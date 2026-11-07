/**
 * 登录状态持久化：凭据写 localStorage，刷新、关掉浏览器再打开都保持登录，直到点「退出登录」。
 * 只落在本机当前浏览器里，不进 URL、不打日志；退出登录会立刻清除。
 */

const SESSION_KEY = 'postal.auth.v1'
const THEME_KEY = 'postal.theme.v1'
const REMOTE_IMG_KEY = 'postal.remoteImages.v1'
const DENSITY_KEY = 'postal.density.v1'

export interface StoredSession {
  user: string
  pass: string
}

/** 读取凭据；旧版本只写了 sessionStorage，这里顺带迁移成持久化存储 */
function readRawSession(): string | null {
  const legacy = sessionStorage.getItem(SESSION_KEY)
  if (legacy) {
    sessionStorage.removeItem(SESSION_KEY)
    localStorage.setItem(SESSION_KEY, legacy)
    return legacy
  }
  return localStorage.getItem(SESSION_KEY)
}

export function readSession(): StoredSession | null {
  const raw = readRawSession()
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as StoredSession
    if (!parsed.user || !parsed.pass) return null
    return parsed
  } catch {
    console.error('[storage] 会话数据损坏，已清除')
    clearSession()
    return null
  }
}

export function writeSession(session: StoredSession): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session))
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_KEY)
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
