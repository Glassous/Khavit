import { nextTick, onScopeDispose, watch, type WatchSource } from 'vue'

/**
 * 手机返回键（含全面屏返回手势）适配。
 *
 * 移动端每打开一层浮层，就往历史里垫一条「守卫记录」：地址不变，只多一格历史。
 * 用户按返回时浏览器退掉的是这条守卫记录，页面不会跳走，我们把对应的浮层关掉即可。
 * 浮层由按钮/遮罩/下滑手势关闭时，再把守卫记录退掉，历史栈保持干净。
 *
 * 只在响应式布局（< lg）启用：桌面端的写信窗口允许在后台继续导航，
 * 历史守卫会和真实的页面跳转互相打架（例如写信时切文件夹，返回键会退回旧文件夹）。
 *
 * 多个浮层按打开顺序入栈，返回键永远只关最上面那层：确认框 → 写信 → 正文 → 抽屉…
 */

/** 历史记录标记：Android 壳的返回键策略会读取这个字段，改名需要同步 MainActivity */
const STATE_KEY = '__khavitBackLayer'
const MOBILE_QUERY = '(max-width: 1023.98px)'
/** 守卫回退的兜底时长：个别 WebView 可能吞掉 popstate */
const RELEASE_TIMEOUT = 800

interface Layer {
  token: string
  onBack: () => void
  active: boolean
}

export interface BackLayerHandle {
  /** 这一层是否还在栈上；被返回键关掉后即失效 */
  readonly active: boolean
  /**
   * 页面主动关闭浮层时调用：退掉垫在历史里的守卫记录。
   * 返回的 Promise 在这次历史回退完成后兑现；守卫不在栈顶时立即兑现。
   */
  release(): Promise<void>
  /** 组件卸载时只摘掉这一层、不动历史，避免页面跳转过程中误退真实记录 */
  detach(): void
}

const layers: Layer[] = []
/** 当前这条历史记录里存的是哪一层的守卫标记 */
let currentToken: string | null = null
/** release() 主动触发的回退，等 popstate 回来时不再重复关闭 */
const pendingReleases = new Map<string, () => void>()
let seq = 0
let listenerAttached = false
/** useBackLayer 最近一次主动退栈的 Promise，供「关掉弹窗后马上跳页」的场景等待 */
let lastRelease: Promise<void> = Promise.resolve()

function isMobile(): boolean {
  return typeof window !== 'undefined' && window.matchMedia(MOBILE_QUERY).matches
}

function tokenOf(state: unknown): string | null {
  if (!state || typeof state !== 'object') return null
  const value = (state as Record<string, unknown>)[STATE_KEY]
  return typeof value === 'string' ? value : null
}

function onPopState(): void {
  const before = currentToken
  const after = tokenOf(window.history.state)
  currentToken = after

  // 页面主动关闭时自己发起的回退：浮层状态已经更新，这里只需兑现 Promise
  if (before && pendingReleases.has(before)) {
    pendingReleases.get(before)?.()
    pendingReleases.delete(before)
    return
  }

  if (layers.length === 0) return
  const top = layers[layers.length - 1]

  // 用户按了返回键：栈顶那层的守卫记录被退掉，关掉对应浮层。
  // 若 after === before，说明是退回到了这层自己的记录（前进/后退），保持打开。
  if (top.token === before && after !== before) {
    layers.pop()
    top.active = false
    top.onBack()
  }
}

function ensureListener(): void {
  if (typeof window === 'undefined' || listenerAttached) return
  window.addEventListener('popstate', onPopState)
  listenerAttached = true
}

/** 桌面端 / 不支持历史 API 的环境：返回一个永远失效的空手柄 */
function inertHandle(): BackLayerHandle {
  return {
    active: false,
    release: () => Promise.resolve(),
    detach: () => undefined,
  }
}

/**
 * 压入一层浮层守卫。onBack 只会在用户按手机返回键、且这层位于栈顶时调用。
 * 桌面端直接返回空手柄，调用方无需判断平台。
 */
export function pushBackLayer(onBack: () => void): BackLayerHandle {
  if (!isMobile()) return inertHandle()

  ensureListener()
  // 导航后当前记录可能换了，先对齐再压栈
  currentToken = tokenOf(window.history.state)

  const token = `bk-${Date.now().toString(36)}-${++seq}`
  const layer: Layer = { token, onBack, active: true }

  try {
    window.history.pushState({ ...(window.history.state ?? {}), [STATE_KEY]: token }, '')
  } catch {
    // 少数沙箱/内嵌 WebView 限制 pushState，退化为不拦截返回键
    return inertHandle()
  }

  layers.push(layer)
  currentToken = token

  return {
    get active() {
      return layer.active
    },

    release(): Promise<void> {
      if (!layer.active) return Promise.resolve()
      layer.active = false
      const index = layers.indexOf(layer)
      if (index > -1) layers.splice(index, 1)

      // 这层的守卫已不在当前记录上（例如导航压了新记录）：
      // 不能贸然 history.back()，否则会退掉用户真正的页面
      if (currentToken !== token) return Promise.resolve()

      return new Promise<void>((resolve) => {
        pendingReleases.set(token, resolve)
        window.setTimeout(() => {
          if (!pendingReleases.has(token)) return
          pendingReleases.delete(token)
          resolve()
        }, RELEASE_TIMEOUT)
        window.history.back()
      })
    },

    detach(): void {
      if (!layer.active) return
      layer.active = false
      const index = layers.indexOf(layer)
      if (index > -1) layers.splice(index, 1)
    },
  }
}

/**
 * 声明式写法：active 为 true 时压入守卫，变回 false 时自动退掉。
 * 适合对话框这类「开关状态就是一个 ref」的场景。
 */
export function useBackLayer(source: WatchSource<boolean>, onBack: () => void): void {
  let handle: BackLayerHandle | null = null

  const stop = watch(
    source,
    (active) => {
      if (active) {
        if (!handle?.active) handle = pushBackLayer(onBack)
        return
      }
      const current = handle
      handle = null
      const released = current?.release() ?? Promise.resolve()
      lastRelease = lastRelease.then(() => released)
    },
    { immediate: true },
  )

  onScopeDispose(() => {
    stop()
    handle?.detach()
    handle = null
  })
}

/**
 * 等弹窗类守卫完全退栈。用于「确认框一关就跳页」的场景（例如退出登录），
 * 否则路由 replace 可能先把守卫记录覆盖掉，紧接着的 history.back 会退到错误的历史项。
 */
export async function whenBackLayersSettled(): Promise<void> {
  await nextTick()
  await lastRelease
}
