import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import MailListItem from '../components/mail/MailListItem.vue'
import { useDensity } from '../composables/useDensity'
import type { Email } from '../jmap/types'

/**
 * 回归测试：设置页的「紧凑列表」必须真的作用到邮件列表。
 * 之前的毛病是开关只写了 localStorage，列表组件既没订阅状态也没收到 compact，
 * 所以怎么切都看不出变化。
 */
const demoEmail: Email = {
  id: 'e1',
  threadId: 't1',
  mailboxIds: { inbox: true },
  keywords: {},
  from: [{ name: '张三', email: 'zhangsan@example.com' }],
  to: [{ name: '我', email: 'me@example.com' }],
  subject: '周会纪要',
  sentAt: '2026-01-01T08:00:00Z',
  receivedAt: '2026-01-01T08:00:00Z',
  size: 2048,
  preview: '这里是一段邮件摘要，用来占位第三行文本。',
}

function mountItem(compact: boolean) {
  return mount(MailListItem, {
    props: { email: demoEmail, compact },
    // v-tooltip 是全局指令，单测里给个空实现即可（否则 Vue 会报解析失败）
    global: { directives: { tooltip: {} } },
  })
}

describe('列表密度', () => {
  beforeEach(() => {
    localStorage.clear()
    useDensity().setCompact(false)
  })

  it('切换密度会写回 localStorage，并保持同一份状态', () => {
    const { compact, setCompact } = useDensity()
    expect(compact.value).toBe(false)

    setCompact(true)
    expect(compact.value).toBe(true)
    expect(localStorage.getItem('postal.density.v1')).toBe('compact')

    setCompact(false)
    expect(localStorage.getItem('postal.density.v1')).toBe('comfortable')
  })

  it('紧凑模式只剩两行，不再渲染内容摘要', () => {
    const compactItem = mountItem(true)
    expect(compactItem.text()).toContain('周会纪要')
    expect(compactItem.text()).not.toContain('这里是一段邮件摘要')

    const comfortableItem = mountItem(false)
    expect(comfortableItem.text()).toContain('这里是一段邮件摘要')
  })
})
