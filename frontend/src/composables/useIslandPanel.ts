import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { LocationQuery } from 'vue-router'
import { panelQuery, resolveAdminSection, resolvePanel } from '../utils/panel'
import type { AdminSection, IslandPanel } from '../utils/panel'

/**
 * 岛内面板的开关状态，唯一真相是地址栏的查询串（见 utils/panel.ts）。
 *
 * 打开面板时用 push 新增一条历史记录，手机返回键/浏览器返回天然就是「关闭面板」；
 * 在面板内切换（设置 ⇄ 管理后台、管理后台换分区）用 replace，不会多出历史记录。
 * 深链或刷新进来的面板没有上一层可退，关闭时直接抹掉查询串。
 */

/** 历史记录标记：这条记录是「打开面板」压进来的，关闭时应该退回去 */
const PANEL_STATE = '__khavitPanelPushed'

function withoutPanel(query: LocationQuery): LocationQuery {
  const { panel: _panel, section: _section, ...rest } = query
  return rest
}

/** 当前历史记录是否由 openPanel 压入（刷新/深链进来的记录没有这个标记） */
function currentEntryPushed(): boolean {
  if (typeof window === 'undefined') return false
  const state = window.history.state as Record<string, unknown> | null
  return Boolean(state?.[PANEL_STATE])
}

export function useIslandPanel() {
  const route = useRoute()
  const router = useRouter()

  const panel = computed(() => resolvePanel(route.query))
  const open = computed(() => panel.value !== null)
  const adminSection = computed(() => resolveAdminSection(route.query))

  /** 首次打开压一条历史；面板已打开时只替换查询串 */
  async function show(next: IslandPanel): Promise<void> {
    if (panel.value === next) return

    const query = { ...withoutPanel(route.query), ...panelQuery(next, adminSection.value) }
    if (panel.value) {
      await router.replace({ query })
      return
    }
    await router.push({ query, state: { [PANEL_STATE]: true } })
  }

  async function hide(): Promise<void> {
    if (!panel.value) return

    // 这次面板是打开时压进来的记录：退一格就回到打开前的页面，面板随之消失
    if (currentEntryPushed()) {
      router.back()
      return
    }
    // 刷新/深链进来的面板没有上一层，就在当前记录上抹掉面板参数
    await router.replace({ query: withoutPanel(route.query) })
  }

  async function toggle(next: IslandPanel): Promise<void> {
    if (panel.value === next) await hide()
    else await show(next)
  }

  async function setAdminSection(next: AdminSection): Promise<void> {
    if (panel.value === 'admin' && adminSection.value === next) return
    await router.replace({ query: { ...withoutPanel(route.query), ...panelQuery('admin', next) } })
  }

  return { panel, open, adminSection, show, hide, toggle, setAdminSection }
}
