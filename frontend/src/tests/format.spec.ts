import { describe, expect, it } from 'vitest'
import {
  avatarColor,
  domainOf,
  formatAddress,
  formatAddressList,
  formatBytes,
  formatListTime,
  initialOf,
  truncate,
} from '../utils/format'

describe('formatBytes', () => {
  it('按量级选择单位', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(2048)).toBe('2 KB')
    expect(formatBytes(1024 ** 3)).toBe('1 GB')
  })

  it('非法输入回退为 0 B', () => {
    expect(formatBytes(null)).toBe('0 B')
    expect(formatBytes(-1)).toBe('0 B')
  })
})

describe('formatAddress', () => {
  it('优先显示名字', () => {
    expect(formatAddress({ name: '张三', email: 'a@b.com' })).toBe('张三')
    expect(formatAddress({ name: '  ', email: 'a@b.com' })).toBe('a@b.com')
    expect(formatAddress(null)).toBe('')
  })

  it('多人地址折叠', () => {
    const list = [
      { name: 'A', email: 'a@x.com' },
      { name: 'B', email: 'b@x.com' },
      { name: 'C', email: 'c@x.com' },
    ]
    expect(formatAddressList(list, 2)).toBe('A、B 等 3 人')
    expect(formatAddressList([])).toBe('（无收件人）')
  })
})

describe('formatListTime', () => {
  it('刚发出的显示「刚刚」', () => {
    const now = new Date().toISOString()
    expect(formatListTime(now)).toBe('刚刚')
  })

  it('空值与非法值返回空串', () => {
    expect(formatListTime(null)).toBe('')
    expect(formatListTime('not-a-date')).toBe('')
  })
})

describe('小工具', () => {
  it('首字母与稳定取色', () => {
    expect(initialOf('alice')).toBe('A')
    expect(initialOf('张三')).toBe('张')
    expect(initialOf('')).toBe('?')
    expect(avatarColor('a@b.com')).toBe(avatarColor('a@b.com'))
  })

  it('域名提取', () => {
    expect(domainOf('a@Example.COM')).toBe('example.com')
    expect(domainOf('nope')).toBe('')
    expect(domainOf(null)).toBe('')
  })

  it('截断', () => {
    expect(truncate('abcdef', 3)).toBe('abc…')
    expect(truncate('ab', 3)).toBe('ab')
  })
})
