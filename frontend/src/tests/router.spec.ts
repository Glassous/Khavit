import { describe, expect, it } from 'vitest'
import router from '../router'
import { PANEL_TITLES, legacyPanelLocation, resolveAdminSection, resolvePanel } from '../utils/panel'

/**
 * 回归测试：默认路由模式必须是 hash。
 * 之前用 history 模式时，静态托管（1Panel / Nginx 没配 try_files）刷新 /mail/inbox 会 404。
 */
describe('router', () => {
  it('默认 hash 模式，带路径的地址解析到 # 之后', () => {
    expect(router.resolve('/mail/inbox').href).toBe('#/mail/inbox')
    expect(router.resolve('/mail/inbox?panel=admin').href).toBe('#/mail/inbox?panel=admin')
  })

  /**
   * 回归测试：登录后只有「邮件页」一条真正的内容路由。
   * 设置与管理后台改成挂在邮件页上的岛内面板（?panel=…），不再整页替换内容区。
   */
  it('路由表只保留邮件页与 404，设置/管理后台不再是独立页面', () => {
    expect(router.resolve('/mail').name).toBe('mail')
    expect(router.resolve('/mail/trash').name).toBe('mail')
    expect(router.resolve('/settings').name).toBeUndefined()
    expect(router.resolve('/admin/domains').name).toBeUndefined()
    expect(router.resolve('/no-such-page').name).toBe('not-found')
  })

  it('老地址仍然留在路由表里做跳转，书签不会 404', () => {
    // 跳转记录同样挂在布局父路由下，最后一条匹配项就是那个 redirect
    const settings = router.resolve('/settings').matched
    const admin = router.resolve('/admin/accounts').matched

    expect(typeof settings[settings.length - 1]?.redirect).toBe('function')
    expect(typeof admin[admin.length - 1]?.redirect).toBe('function')
  })

  it('老地址的跳转目标落在邮件页的岛内面板上', () => {
    expect(legacyPanelLocation('settings')).toEqual({ name: 'mail', query: { panel: 'settings' } })
    expect(legacyPanelLocation('admin', 'accounts')).toEqual({
      name: 'mail',
      query: { panel: 'admin', section: 'accounts' },
    })
    // 未知分区回到默认的「域名」
    expect(legacyPanelLocation('admin', 'whatever')).toEqual({
      name: 'mail',
      query: { panel: 'admin', section: 'domains' },
    })
  })

  it('查询串能还原出面板与分区，非法值不会打开面板', () => {
    expect(resolvePanel({ panel: 'settings' })).toBe('settings')
    expect(resolvePanel({ panel: 'admin' })).toBe('admin')
    expect(resolvePanel({ panel: 'nope' })).toBeNull()
    expect(resolvePanel({})).toBeNull()

    expect(resolveAdminSection({ section: 'accounts' })).toBe('accounts')
    expect(resolveAdminSection({ section: 'domains' })).toBe('domains')
    expect(resolveAdminSection({})).toBe('domains')

    expect(PANEL_TITLES.settings).toBe('设置')
    expect(PANEL_TITLES.admin).toBe('管理后台')
  })

  it('邮件页仍然是唯一带侧栏与搜索的页面', () => {
    const mail = router.resolve('/mail/inbox')

    expect(mail.meta.sidebar).toBe(true)
    expect(mail.meta.searchable).toBe(true)
    expect(mail.matched).toHaveLength(2)
  })
})
