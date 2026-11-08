import { ref } from 'vue'
import { pushBackLayer, type BackLayerHandle } from './useMobileBack'

/**
 * 侧栏状态：模块级单例，顶栏按钮、侧栏、页面共享同一份状态。
 * - 桌面端（lg 及以上）折叠成只显示图标的窄栏；
 * - 移动端不使用折叠态，抽屉始终是完整侧栏，由 drawerOpen 控制显隐。
 *
 * 移动端抽屉打开时会往历史里垫一层守卫（见 useMobileBack），
 * 手机返回键先关抽屉；由界面主动关闭时再把守卫退掉。
 */
const STORAGE_KEY = 'postal.sidebar.v1'
const DESKTOP_QUERY = '(min-width: 1024px)'

function readStored(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'rail'
  } catch {
    return false
  }
}

const collapsed = ref(readStored())
const isDesktop = ref(typeof window === 'undefined' ? true : window.matchMedia(DESKTOP_QUERY).matches)
/** 移动端抽屉是否展开 */
const drawerOpen = ref(false)
/** 列表页右滑拉出抽屉：手势进行中 */
const drawerDragging = ref(false)
/** 手势已经拉出的像素（0 = 完全收起） */
const drawerDrag = ref(0)

let bound = false
let drawerLayer: BackLayerHandle | null = null

/** 抽屉宽度，与 max-lg:w-[min(320px,86vw)] 保持一致 */
function drawerWidth(): number {
  return Math.min(320, window.innerWidth * 0.86)
}

function openDrawer(): void {
  if (drawerOpen.value) return
  drawerOpen.value = true
  drawerLayer = pushBackLayer(() => {
    // 返回键已经退掉守卫记录，这里只同步界面状态
    drawerLayer = null
    drawerOpen.value = false
  })
}

/**
 * 关闭抽屉。返回 Promise 以便「抽屉里点文件夹」这类场景先等守卫退干净再导航，
 * 否则守卫记录会夹在新旧页面之间，让下一次返回跳到错误的历史项。
 */
function closeDrawer(): Promise<void> {
  if (!drawerOpen.value && !drawerLayer) return Promise.resolve()
  drawerOpen.value = false
  const layer = drawerLayer
  drawerLayer = null
  return layer ? layer.release() : Promise.resolve()
}

function bind(): void {
  if (bound || typeof window === 'undefined') return
  const query = window.matchMedia(DESKTOP_QUERY)
  isDesktop.value = query.matches
  query.addEventListener('change', (event) => {
    isDesktop.value = event.matches
    // 切到桌面端时抽屉不再有意义，顺手关掉
    if (event.matches) void closeDrawer()
  })
  bound = true
}

export function useSidebar() {
  bind()

  function setCollapsed(next: boolean): void {
    collapsed.value = next
    try {
      localStorage.setItem(STORAGE_KEY, next ? 'rail' : 'full')
    } catch {
      /* 隐私模式下写入失败无所谓 */
    }
  }

  function toggle(): void {
    setCollapsed(!collapsed.value)
  }

  function toggleDrawer(): void {
    if (drawerOpen.value) void closeDrawer()
    else openDrawer()
  }

  /** 列表页右滑起手：只在响应式、抽屉收起时生效 */
  function beginDrawerDrag(): void {
    if (isDesktop.value || drawerOpen.value) return
    drawerDragging.value = true
    drawerDrag.value = 0
  }

  /** 跟手更新拉出距离（只允许向右，最大到抽屉全宽） */
  function updateDrawerDrag(dx: number): void {
    if (!drawerDragging.value) return
    drawerDrag.value = Math.min(Math.max(dx, 0), drawerWidth())
  }

  /**
   * 松手：过阈值直接打开，否则缩回。
   * 结束手势与打开抽屉放在同一帧里，遮罩与抽屉都不会在中间闪一下。
   */
  function endDrawerDrag(): void {
    if (!drawerDragging.value) return
    const passed = drawerDrag.value > Math.min(drawerWidth() * 0.28, 72)
    drawerDragging.value = false
    drawerDrag.value = 0
    if (passed) openDrawer()
  }

  /** 手势被系统打断：原地缩回 */
  function cancelDrawerDrag(): void {
    drawerDragging.value = false
    drawerDrag.value = 0
  }

  return {
    collapsed,
    isDesktop,
    drawerOpen,
    drawerDragging,
    drawerDrag,
    setCollapsed,
    toggle,
    toggleDrawer,
    closeDrawer,
    beginDrawerDrag,
    updateDrawerDrag,
    endDrawerDrag,
    cancelDrawerDrag,
  }
}
