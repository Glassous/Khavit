import { describe, expect, it } from 'vitest'
import { JmapError, throwIfError } from '../jmap/client'

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
    ).toThrowError(/Invalid value/)
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
