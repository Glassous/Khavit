import type { LocationQuery } from 'vue-router'

/**
 * 岛内面板：设置与管理后台不再是两个独立页面，而是盖在邮件页「岛内」的一层视图。
 *
 * 状态放在地址的查询串里，而不是路由路径：
 *   #/mail/inbox?panel=settings
 *   #/mail/inbox?panel=admin&section=accounts
 *
 * 这样刷新、分享、前进后退都能还原到同一个界面，同时邮件页本身保持挂载
 * （列表滚动位置、已读邮件都还在），不会像换页那样被销毁重建。
 */
export type IslandPanel = 'settings' | 'admin'

/** 管理后台的二级分区 */
export type AdminSection = 'domains' | 'accounts'

export const PANEL_TITLES: Record<IslandPanel, string> = {
  settings: '设置',
  admin: '管理后台',
}

export const DEFAULT_ADMIN_SECTION: AdminSection = 'domains'

/** 从查询串解析出当前面板；非法值一律当作「没有面板」 */
export function resolvePanel(query: LocationQuery): IslandPanel | null {
  const value = query.panel
  if (value === 'settings' || value === 'admin') return value
  return null
}

/** 查询串里的分区，缺省时回到「域名」 */
export function resolveAdminSection(query: LocationQuery): AdminSection {
  return query.section === 'accounts' ? 'accounts' : DEFAULT_ADMIN_SECTION
}

/**
 * 打开某个面板时的目标地址（只动查询串，文件夹等其它参数由调用方自己带着）。
 */
export function panelQuery(panel: IslandPanel, section: AdminSection = DEFAULT_ADMIN_SECTION): Record<string, string> {
  return panel === 'admin' ? { panel: 'admin', section } : { panel: 'settings' }
}

/**
 * 旧地址的跳转目标：/settings → ?panel=settings、/admin/accounts → ?panel=admin&section=accounts。
 * 老书签、外部链接照旧可用，只是落到邮件页的岛内面板上。
 */
export function legacyPanelLocation(panel: IslandPanel, section?: string): {
  name: string
  query: Record<string, string>
} {
  return {
    name: 'mail',
    query: panelQuery(panel, resolveAdminSection({ section: section ?? null })),
  }
}
