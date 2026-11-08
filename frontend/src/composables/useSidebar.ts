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

let bound = false
let drawerLayer: BackLayerHandle | null = null

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

  return { collapsed, isDesktop, drawerOpen, setCollapsed, toggle, toggleDrawer, closeDrawer }
}
