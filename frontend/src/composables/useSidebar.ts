import { ref } from 'vue'

/**
 * 侧栏状态：模块级单例，顶栏按钮、侧栏、页面共享同一份状态。
 * - 桌面端（lg 及以上）折叠成只显示图标的窄栏；
 * - 移动端不使用折叠态，抽屉始终是完整侧栏，由 drawerOpen 控制显隐。
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

function bind(): void {
  if (bound || typeof window === 'undefined') return
  const query = window.matchMedia(DESKTOP_QUERY)
  isDesktop.value = query.matches
  query.addEventListener('change', (event) => {
    isDesktop.value = event.matches
    // 切到桌面端时抽屉不再有意义，顺手关掉
    if (event.matches) drawerOpen.value = false
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
    drawerOpen.value = !drawerOpen.value
  }

  function closeDrawer(): void {
    drawerOpen.value = false
  }

  return { collapsed, isDesktop, drawerOpen, setCollapsed, toggle, toggleDrawer, closeDrawer }
}
