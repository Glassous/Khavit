import { describe, expect, it } from 'vitest'
import { JmapError, throwIfError } from '../jmap/client'
import { describeError, mailboxLabel, translateFailure } from '../utils/i18n'

describe('JmapError', () => {
  it('识别认证失败', () => {
    expect(new JmapError('unauthorized', 'x', 401).isAuth).toBe(true)
    expect(new JmapError('http', 'x', 401).isAuth).toBe(true)
    expect(new JmapError('http', 'x', 500).isAuth).toBe(false)
  })

  it('识别权限不足', () => {
    expect(new JmapError('forbidden', 'x').isForbidden).toBe(true)
    expect(new JmapError('http', 'x', 403).isForbidden).toBe(true)
  })
})

describe('throwIfError', () => {
  it('方法名是 error 时抛出', () => {
    expect(() => throwIfError(['error', { type: 'unknownMethod', description: '缺少能力' }, 'c1'])).toThrowError(
      '缺少能力',
    )
  })

  it('Stalwart 的「方法名 + type」错误形态也能识别', () => {
    expect(() =>
      throwIfError(['x:Account/set', { type: 'invalidPatch', description: 'Invalid value', properties: ['credentials'] }, 'c1']),
    ).toThrowError('提交的字段值不合法')
  })

  it('英文错误码与描述统一转成中文', () => {
    expect(translateFailure('forbidden', 'You are not allowed')).toBe('没有权限执行该操作')
    expect(translateFailure('someUnknownType', 'Something exploded')).toBe('操作失败，请稍后重试')
    // 服务端已经给出中文描述时保留原文
    expect(translateFailure('forbidden', '仅管理员可操作')).toBe('仅管理员可操作')
    expect(describeError(new Error('Failed to fetch'))).toBe('网络连接失败，请检查网络与服务器')
    expect(describeError(new Error('未知错误：磁盘已满'))).toBe('未知错误：磁盘已满')
  })

  it('服务端英文文件夹名映射成中文', () => {
    expect(mailboxLabel({ role: 'inbox', name: 'Inbox' })).toBe('收件箱')
    expect(mailboxLabel({ role: 'trash', name: 'Deleted Items' })).toBe('已删除')
    expect(mailboxLabel({ role: null, name: '项目归档' })).toBe('项目归档')
  })

  it('正常响应不抛错', () => {
    expect(() =>
      throwIfError(['Email/get', { accountId: 'b', list: [], notFound: [] }, 'c1']),
    ).not.toThrow()
  })

  it('错误对象保留 properties 便于定位字段', () => {
    try {
      throwIfError(['x:Account/set', { type: 'invalidProperties', properties: ['cc'] }, 'c1'])
    } catch (err) {
      expect(err).toBeInstanceOf(JmapError)
      expect((err as JmapError).properties).toEqual(['cc'])
    }
  })
})
