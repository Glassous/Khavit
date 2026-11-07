/**
 * 凭据只放 sessionStorage：刷新页面保持登录，关闭标签即失效。
 * 绝不写 localStorage、不进 URL、不打日志。
 */

const SESSION_KEY = 'postal.auth.v1'
const THEME_KEY = 'postal.theme.v1'
const REMOTE_IMG_KEY = 'postal.remoteImages.v1'
const DENSITY_KEY = 'postal.density.v1'

export interface StoredSession {
  user: string
  pass: string
}

export function readSession(): StoredSession | null {
  const raw = sessionStorage.getItem(SESSION_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as StoredSession
    if (!parsed.user || !parsed.pass) return null
    return parsed
  } catch {
    console.error('[storage] 会话数据损坏，已清除')
    sessionStorage.removeItem(SESSION_KEY)
    return null
  }
}

export function writeSession(session: StoredSession): void {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
}

export function clearSession(): void {
  sessionStorage.removeItem(SESSION_KEY)
}

export type ThemeMode = 'light' | 'dark' | 'system'

export function readTheme(): ThemeMode {
  const raw = localStorage.getItem(THEME_KEY)
  return raw === 'light' || raw === 'dark' || raw === 'system' ? raw : 'system'
}

export function writeTheme(mode: ThemeMode): void {
  localStorage.setItem(THEME_KEY, mode)
}

export function readDensity(): 'comfortable' | 'compact' {
  return localStorage.getItem(DENSITY_KEY) === 'compact' ? 'compact' : 'comfortable'
}

export function writeDensity(value: 'comfortable' | 'compact'): void {
  localStorage.setItem(DENSITY_KEY, value)
}

/** 外部图片放行名单：按发件人域记忆 */
export function readAllowedImageSenders(): string[] {
  const raw = localStorage.getItem(REMOTE_IMG_KEY)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as string[]) : []
  } catch {
    return []
  }
}

export function allowImageSender(domain: string): void {
  const list = readAllowedImageSenders()
  if (!list.includes(domain)) {
    localStorage.setItem(REMOTE_IMG_KEY, JSON.stringify([...list, domain]))
  }
}

export function isImageSenderAllowed(domain: string): boolean {
  return readAllowedImageSenders().includes(domain)
}
