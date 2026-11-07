import { describe, expect, it } from 'vitest'
import router from '../router'

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
})
