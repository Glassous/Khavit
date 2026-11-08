import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { panelQuery, resolveAdminSection, resolvePanel } from '../utils/panel'
import type { AdminSection, IslandPanel } from '../utils/panel'

/**
 * 岛内面板的开关状态，唯一真相是地址栏的查询串（见 utils/panel.ts）。
 * 打开/关闭一律走 replace：面板不是「一次页面跳转」，不该往历史里塞记录，
 * 否则用户按浏览器的返回键会一直在邮件页与面板之间来回弹。
 */
export function useIslandPanel() {
  const route = useRoute()
  const router = useRouter()

  const panel = computed(() => resolvePanel(route.query))
  const open = computed(() => panel.value !== null)
  const adminSection = computed(() => resolveAdminSection(route.query))

  /** 换面板时只改面板相关参数，其它查询串（外部带进来的 next、utm 等）原样保留 */
  async function apply(next: IslandPanel | null, section: AdminSection): Promise<void> {
    const { panel: _panel, section: _section, ...rest } = route.query
    await router.replace({ query: next ? { ...rest, ...panelQuery(next, section) } : rest })
  }

  async function show(next: IslandPanel): Promise<void> {
    if (panel.value === next) return
    await apply(next, adminSection.value)
  }

  async function hide(): Promise<void> {
    if (!panel.value) return
    await apply(null, adminSection.value)
  }

  async function toggle(next: IslandPanel): Promise<void> {
    if (panel.value === next) await hide()
    else await show(next)
  }

  async function setAdminSection(next: AdminSection): Promise<void> {
    if (panel.value === 'admin' && adminSection.value === next) return
    await apply('admin', next)
  }

  return { panel, open, adminSection, show, hide, toggle, setAdminSection }
}
