import { nextTick, ref } from 'vue'
import gsap from 'gsap'
import { Flip } from 'gsap/Flip'
import { useTopBarAutoHide } from './useTopBarAutoHide'

gsap.registerPlugin(Flip)

/**
 * 响应式下「列表小卡片 ⇄ 正文大卡片」的展开/收起。
 *
 * 这里是完整的 GSAP Flip，而不是两套界面交叉淡入：
 * 列表行和正文卡片是**同一个组件、同一个 DOM 节点**（MailListItem 根元素），
 * 展开只是把它从列表流里的圆角小卡切成铺满整屏的卡（class + 内容切换），
 * 于是可以走标准三段式：Flip.getState(切换前) → 改状态 → Flip.from(切换后)。
 * 头像、发件人、标题这些前后都在的元素会作为子目标一起补齐位移，视觉上连续。
 *
 * 顶栏那排会随状态换内容的按钮（汉堡 / 返回 / 搜索 / 邮件操作）在切换前淡出、
 * 切换后淡入，两个动作串行，不会出现两套按钮同时在场。
 */

/** 当前展开成正文的那封邮件 */
const expandedId = ref('')
/** 顶栏是否处于正文态 */
const reading = ref(false)

const DURATION = 0.26
const EASE = 'power2.out'

let busy = false

function cardOf(id: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-mail-card="${id}"]`)
}

/** 卡片根 + 前后都在的内层元素（头像、发件人、标题） */
function flipTargets(root: HTMLElement): HTMLElement[] {
  const inner = Array.from(root.querySelectorAll<HTMLElement>('[data-flip-inner]'))
  return [root, ...inner]
}

function swapEls(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-topbar-swap]'))
}

function reducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * 顶栏待切换的那组按钮整体淡出。
 * 卡片必须等它结束再变形（顺序就是「先淡出再淡入」），所以要极短——
 * 60ms 只有三四帧，既不会两套按钮同时在场，也让人感觉是「点下去就展开了」。
 */
function fadeOutTopbar(): Promise<void> {
  const els = swapEls()
  if (!els.length || reducedMotion()) return Promise.resolve()
  return new Promise((resolve) => {
    gsap.to(els, { autoAlpha: 0, duration: 0.06, ease: 'power1.out', onComplete: resolve })
  })
}

/** 切换完成后让新的一组按钮淡入 */
function fadeInTopbar(): void {
  const els = swapEls()
  if (!els.length) return
  if (reducedMotion()) {
    gsap.set(els, { clearProps: 'opacity,visibility' })
    return
  }
  gsap.fromTo(
    els,
    { autoAlpha: 0 },
    { autoAlpha: 1, duration: 0.14, ease: 'power2.out', clearProps: 'opacity,visibility' },
  )
}

export function useMailExpand() {
  const topBar = useTopBarAutoHide()

  /** 展开某封邮件；load 与动画并行跑，正文数据到位时通常动画还没结束 */
  async function open(id: string, load?: () => void | Promise<void>): Promise<void> {
    if (busy || expandedId.value === id) return
    const el = cardOf(id)
    const state = el && !reducedMotion() ? Flip.getState(flipTargets(el)) : null

    busy = true
    topBar.reset()
    // 先发起加载：等淡出的这几帧里 selectedId 就位，顶栏切换时一次渲染到位，
    // 不会先渲染成列表态、再因为数据到达重建一遍按钮
    if (load) void load()
    await fadeOutTopbar()

    expandedId.value = id
    reading.value = true
    await nextTick()

    if (state) {
      Flip.from(state, {
        duration: DURATION,
        ease: EASE,
        // 卡片宽度基本不变、高度要长满一屏：用 width/height 补间，避免内容被纵向压扁
        scale: false,
        onComplete: () => {
          busy = false
        },
      })
    } else {
      busy = false
    }

    fadeInTopbar()
  }

  /**
   * 收起正文，退回列表（同一张卡片反向变形）。
   * after 在状态切换之后、测量之前执行：调用方可以在这里清掉「当前邮件」，
   * 让 Flip 的目标状态就是最终状态，不会先缩回高亮行再跳成普通行。
   */
  async function close(after?: () => void): Promise<void> {
    if (busy || !expandedId.value) return
    const el = cardOf(expandedId.value)
    const state = el && !reducedMotion() ? Flip.getState(flipTargets(el)) : null

    busy = true
    topBar.reset()
    await fadeOutTopbar()

    expandedId.value = ''
    reading.value = false
    after?.()
    await nextTick()

    if (state) {
      Flip.from(state, {
        duration: DURATION,
        ease: EASE,
        scale: false,
        onComplete: () => {
          busy = false
        },
      })
    } else {
      busy = false
    }

    fadeInTopbar()
  }

  /** 立刻收起、不做动画：删除/归档后那封邮件已经不在了，别让它慢慢缩回去 */
  function collapse(): void {
    expandedId.value = ''
    reading.value = false
    busy = false
  }

  return { expandedId, reading, open, close, collapse }
}
