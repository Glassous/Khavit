import type { EmailAddress } from '../jmap/types'
import { LOCALE } from './i18n'

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

export function parseDate(value?: string | null): Date | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

/** 只取时刻，24 小时制：09:30 */
export function formatClock(date: Date): string {
  return date.toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit', hour12: false })
}

/** 邮件列表时间：今天显示时刻，昨天显示「昨天」，今年显示月日，更早显示年月日 */
export function formatListTime(value?: string | null): string {
  const date = parseDate(value)
  if (!date) return ''
  const now = new Date()
  const diff = now.getTime() - date.getTime()

  if (diff >= 0 && diff < MINUTE) return '刚刚'
  if (diff >= 0 && diff < HOUR) return `${Math.floor(diff / MINUTE)} 分钟前`
  if (isSameDay(date, now)) return formatClock(date)

  const yesterday = new Date(now.getTime() - DAY)
  if (isSameDay(date, yesterday)) return `昨天 ${formatClock(date)}`

  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString(LOCALE, { month: 'numeric', day: 'numeric' })
  }
  return date.toLocaleDateString(LOCALE, { year: 'numeric', month: 'numeric', day: 'numeric' })
}

/** 完整时间：2026年11月7日 周六 09:30 */
export function formatFullTime(value?: string | null): string {
  const date = parseDate(value)
  if (!date) return ''
  return date.toLocaleString(LOCALE, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    weekday: 'short',
  })
}

/** 引用/转发时放在正文里的时间：比完整时间短，避免长句 */
export function formatQuoteTime(value?: string | null): string {
  const date = parseDate(value)
  if (!date) return '时间未知'
  return date.toLocaleString(LOCALE, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  )
}

export function formatBytes(bytes?: number | null): string {
  if (!bytes || bytes < 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let index = 0
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024
    index += 1
  }
  const text =
    value >= 10 || index === 0 ? String(Math.round(value)) : value.toFixed(1).replace(/\.0$/, '')
  return `${text} ${units[index]}`
}

export function formatAddress(address?: EmailAddress | null): string {
  if (!address) return ''
  return address.name?.trim() ? address.name.trim() : address.email
}

export function formatAddressList(list?: EmailAddress[] | null, max = 2): string {
  if (!list || list.length === 0) return '（无收件人）'
  const shown = list.slice(0, max).map(formatAddress)
  const rest = list.length - shown.length
  return rest > 0 ? `${shown.join('、')} 等 ${list.length} 人` : shown.join('、')
}

/** 首字母头像（中英文都取首字符） */
export function initialOf(value?: string | null): string {
  const text = (value ?? '').trim()
  if (!text) return '?'
  return text.slice(0, 1).toUpperCase()
}

const AVATAR_COLORS = [
  'bg-[#2F5BEA]',
  'bg-[#12876F]',
  'bg-[#B4690E]',
  'bg-[#C8392B]',
  'bg-[#6D5BD0]',
  'bg-[#0E7490]',
]

/** 按地址稳定取色，同一发件人始终同色 */
export function avatarColor(seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) % 9973
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]
}

export function domainOf(email?: string | null): string {
  if (!email) return ''
  const at = email.lastIndexOf('@')
  return at >= 0 ? email.slice(at + 1).toLowerCase() : ''
}

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return `${text.slice(0, max)}…`
}
