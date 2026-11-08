import { describe, expect, it } from 'vitest'
import router from '../router'
import { resolveRouteTitle } from '../utils/routeMeta'

/**
 * 回归测试：默认路由模式必须是 hash。
 * 之前用 history 模式时，静态托管（1Panel / Nginx 没配 try_files）刷新 /mail/inbox 会 404。
 */
describe('router', () => {
  it('默认 hash 模式，带路径的地址解析到 # 之后', () => {
    expect(router.resolve('/mail/inbox').href).toBe('#/mail/inbox')
    expect(router.resolve('/admin/accounts').href).toBe('#/admin/accounts')
  })

  it('路由表覆盖邮件、设置、管理后台与 404', () => {
    expect(router.resolve('/mail').name).toBe('mail')
    expect(router.resolve('/mail/trash').name).toBe('mail')
    expect(router.resolve('/settings').name).toBe('settings')
    expect(router.resolve('/admin/domains').name).toBe('admin')
    expect(router.resolve('/no-such-page').name).toBe('not-found')
  })

  /**
   * 回归测试：邮件、设置、管理后台必须挂在同一个布局父路由下，
   * 这样切页时布局（顶栏/侧栏）实例复用，不会重建导致顶栏闪一下。
   */
  it('登录后的页面共享同一个布局父路由', () => {
    const mail = router.resolve('/mail/inbox')
    const settings = router.resolve('/settings')
    const admin = router.resolve('/admin/domains')

    expect(mail.matched).toHaveLength(2)
    expect(settings.matched[0]).toBe(mail.matched[0])
    expect(admin.matched[0]).toBe(mail.matched[0])
  })

  it('次级页面标记决定顶栏形态与标题', () => {
    const mail = router.resolve('/mail/inbox')
    const settings = router.resolve('/settings')
    const admin = router.resolve('/admin/domains')

    expect(mail.meta.secondary).toBeFalsy()
    expect(mail.meta.sidebar).toBe(true)
    expect(settings.meta.secondary).toBe(true)
    expect(admin.meta.secondary).toBe(true)

    expect(resolveRouteTitle(settings)).toBe('设置')
    expect(resolveRouteTitle(admin)).toBe('域名')
    expect(resolveRouteTitle(router.resolve('/admin/accounts'))).toBe('邮箱账号')
  })
})
