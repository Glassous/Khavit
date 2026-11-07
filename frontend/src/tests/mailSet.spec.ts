import { afterEach, describe, expect, it, vi } from 'vitest'
import { jmap } from '../jmap/client'
import { markSeen, moveEmails, patchEmailKeywords, toggleStar } from '../jmap/mail'
import { handle, reset } from '../mocks/mockServer'

/**
 * 回归测试：Email/set 的补丁必须用 JMAP PatchObject 路径写法。
 *
 * 之前发的是 `{ "$seen": true }` —— `$seen` 不是 Email 的顶层属性，
 * 真实服务端返回 notUpdated: invalidProperties，而代码忽略了 notUpdated，
 * 于是「打开邮件后仍是未读」在生产环境稳定复现，本地 mock 反而放过了它。
 */

function setPayload(spy: { mock: { calls: unknown[][] } }): Record<string, unknown> {
  const call = spy.mock.calls[0] as [string, { update?: Record<string, unknown> }]
  return call[1]
}

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
  reset()
})

describe('markSeen 的请求体', () => {
  it('标为已读用 keywords/$seen 路径', async () => {
    const spy = vi.spyOn(jmap, 'callOne').mockResolvedValue({ updated: { e1: null } } as never)
    await markSeen('acc-1', ['e1'], true)
    expect(setPayload(spy).update).toEqual({ e1: { 'keywords/$seen': true } })
  })

  it('取消已读把关键字置为 false（与 null 等价，都表示关键字不存在）', async () => {
    const spy = vi.spyOn(jmap, 'callOne').mockResolvedValue({ updated: { e1: null } } as never)
    await markSeen('acc-1', ['e1'], false)
    expect(setPayload(spy).update).toEqual({ e1: { 'keywords/$seen': false } })
  })

  it('星标同样走 keywords/$flagged', async () => {
    const spy = vi.spyOn(jmap, 'callOne').mockResolvedValue({ updated: { e1: null } } as never)
    await toggleStar('acc-1', ['e1'], true)
    expect(setPayload(spy).update).toEqual({ e1: { 'keywords/$flagged': true } })
  })

  it('批量标记合并到一次请求', async () => {
    const spy = vi.spyOn(jmap, 'callOne').mockResolvedValue({ updated: {} } as never)
    await patchEmailKeywords('acc-1', ['e1', 'e2'], { $seen: true })
    expect(spy).toHaveBeenCalledTimes(1)
    expect(setPayload(spy).update).toEqual({
      e1: { 'keywords/$seen': true },
      e2: { 'keywords/$seen': true },
    })
  })
})

describe('notUpdated 不再被静默吞掉', () => {
  it('标记失败会抛错，让 UI 回滚而不是假装成功', async () => {
    vi.spyOn(jmap, 'callOne').mockResolvedValue({
      notUpdated: { e1: { type: 'invalidProperties', properties: ['$seen'] } },
    } as never)
    await expect(markSeen('acc-1', ['e1'], true)).rejects.toThrow('提交的字段不合法')
  })

  it('移动邮件失败也会抛错', async () => {
    vi.spyOn(jmap, 'callOne').mockResolvedValue({
      notUpdated: { e1: { type: 'notFound' } },
    } as never)
    await expect(moveEmails('acc-1', ['e1'], 'mb-2')).rejects.toThrow('找不到对应的数据')
  })
})

describe('mock 服务端与真实 JMAP 保持一致的严格度', () => {
  it('顶层写 $seen 会被判为非法属性（这正是当初的 bug）', async () => {
    const res = await handle('demo@khavit.dev', [
      ['Email/set', { accountId: 'acc-demo', update: { 'm-001': { $seen: true } } }, 'c1'],
    ])
    const payload = res.methodResponses[0][1] as {
      notUpdated?: Record<string, { type: string; properties?: string[] }>
      updated?: Record<string, unknown>
    }
    expect(payload.updated).toEqual({})
    expect(payload.notUpdated?.['m-001']).toEqual({ type: 'invalidProperties', properties: ['$seen'] })
  })

  it('keywords/$seen 能被接受，且未读数随之下降', async () => {
    const before = await handle('demo@khavit.dev', [['Mailbox/get', { accountId: 'acc-demo' }, 'c1']])
    const beforeCount = (before.methodResponses[0][1] as { list: Array<{ role: string; unreadEmails: number }> }).list.find(
      (box) => box.role === 'inbox',
    )!.unreadEmails

    const res = await handle('demo@khavit.dev', [
      ['Email/set', { accountId: 'acc-demo', update: { 'm-001': { 'keywords/$seen': true } } }, 'c1'],
    ])
    expect((res.methodResponses[0][1] as { updated?: Record<string, unknown> }).updated).toEqual({ 'm-001': null })

    const after = await handle('demo@khavit.dev', [['Mailbox/get', { accountId: 'acc-demo' }, 'c1']])
    const afterCount = (after.methodResponses[0][1] as { list: Array<{ role: string; unreadEmails: number }> }).list.find(
      (box) => box.role === 'inbox',
    )!.unreadEmails

    expect(afterCount).toBe(beforeCount - 1)
  })
})
