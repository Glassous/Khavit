import type { Id, JmapResponse, JmapSession, MethodCall, MethodResponse, UploadResult } from './types'
import { readSession, writeSession, clearSession } from '../utils/storage'
import { translateFailure } from '../utils/i18n'

export const CORE = 'urn:ietf:params:jmap:core'
export const MAIL = 'urn:ietf:params:jmap:mail'
export const SUBMISSION = 'urn:ietf:params:jmap:submission'
export const QUOTA = 'urn:ietf:params:jmap:quota'
export const STALWART = 'urn:stalwart:jmap'

const TIMEOUT = 30_000
const RETRIES = 2

/**
 * 本地开发默认使用内置的模拟数据，无需后端也能把界面跑起来。
 *
 * - 关掉：在 .env.local 里设 `VITE_USE_MOCK=false`（或直接用生产的 .env 变量）
 * - 生产：`import.meta.env.DEV` 在 build 时被替换成常量 false，
 *   下面的 if 分支连同 `import('../mocks')` 会被整块剔除，产物里不含任何演示数据
 */
const MOCK_ENABLED =
  import.meta.env.DEV && (import.meta.env.VITE_USE_MOCK as string | undefined)?.toLowerCase() !== 'false'

export class JmapError extends Error {
  type: string
  status: number
  detail?: string
  properties?: string[]

  constructor(type: string, message: string, status = 0, detail?: string, properties?: string[]) {
    super(message)
    this.name = 'JmapError'
    this.type = type
    this.status = status
    this.detail = detail
    this.properties = properties
  }

  get isAuth() {
    return this.type === 'unauthorized' || this.status === 401
  }

  get isForbidden() {
    return this.type === 'forbidden' || this.status === 403
  }
}

/** UTF-8 安全的 Basic 认证头（中文/特殊字符密码不能直接 btoa） */
function basicAuth(user: string, pass: string): string {
  const bytes = new TextEncoder().encode(`${user}:${pass}`)
  let bin = ''
  bytes.forEach((b) => {
    bin += String.fromCharCode(b)
  })
  return `Basic ${btoa(bin)}`
}

function joinUrl(base: string, path: string): string {
  if (/^https?:\/\//i.test(path)) return path
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * 极简 JMAP 客户端。
 * 关键取舍：不使用 session.apiUrl（它是 Stalwart 按自身 hostname 拼的绝对 URL，
 * 反代端口不同就会连错），统一走同源 basePath。
 */
export class JmapClient {
  private basePath: string
  private sessionPath: string
  private user = ''
  private pass = ''
  private sessionCache: JmapSession | null = null

  constructor(
    basePath = (import.meta.env.VITE_JMAP_PATH as string) || '/jmap/',
    sessionPath = '/.well-known/jmap',
  ) {
    this.basePath = basePath
    this.sessionPath = sessionPath

    const saved = readSession()
    if (saved) {
      this.user = saved.user
      this.pass = saved.pass
    }
  }

  get authenticated(): boolean {
    return Boolean(this.user && this.pass)
  }

  get username(): string {
    return this.user
  }

  setCredentials(user: string, pass: string): void {
    this.user = user
    this.pass = pass
    this.sessionCache = null
    writeSession({ user, pass })
  }

  logout(): void {
    this.user = ''
    this.pass = ''
    this.sessionCache = null
    clearSession()
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    if (!this.authenticated) throw new JmapError('unauthorized', '尚未登录')
    return { Authorization: basicAuth(this.user, this.pass), ...extra }
  }

  async discover(force = false): Promise<JmapSession> {
    if (this.sessionCache && !force) return this.sessionCache

    if (MOCK_ENABLED) {
      const { mockSession } = await import('../mocks')
      this.sessionCache = await mockSession(this.user)
      return this.sessionCache
    }

    const res = await fetch(this.sessionPath, {
      method: 'GET',
      headers: this.headers({ Accept: 'application/json' }),
      credentials: 'omit',
    })

    if (res.status === 401 || res.status === 403) {
      throw new JmapError('unauthorized', '邮箱地址或密码不正确', res.status)
    }
    if (!res.ok) {
      throw new JmapError('http', `无法连接邮件服务（HTTP ${res.status}）`, res.status)
    }

    const body = (await res.json()) as JmapSession
    this.sessionCache = body
    return body
  }

  /** 主账号 ID（邮件能力对应的 accountId） */
  async primaryAccountId(): Promise<Id> {
    const session = await this.discover()
    return session.primaryAccounts[MAIL] ?? Object.keys(session.accounts)[0] ?? ''
  }

  async accountCapabilities(): Promise<Record<string, unknown>> {
    const session = await this.discover()
    const id = session.primaryAccounts[MAIL] ?? Object.keys(session.accounts)[0]
    return session.accounts?.[id]?.accountCapabilities ?? {}
  }

  /** 是否为管理员（决定是否显示管理后台入口） */
  async isAdmin(): Promise<boolean> {
    const caps = await this.accountCapabilities()
    return Object.keys(caps).includes(STALWART)
  }

  async call(methodCalls: MethodCall[], using: string[] = [CORE, MAIL]): Promise<JmapResponse> {
    if (MOCK_ENABLED) {
      const { mockCall } = await import('../mocks')
      return mockCall(this.user, methodCalls)
    }

    const url = joinUrl(window.location.origin, this.basePath)
    const payload = JSON.stringify({ using, methodCalls })

    let lastError: unknown = null
    for (let attempt = 0; attempt <= RETRIES; attempt += 1) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), TIMEOUT)
      const res = await fetch(url, {
        method: 'POST',
        headers: this.headers({ 'Content-Type': 'application/json' }),
        body: payload,
        signal: controller.signal,
        credentials: 'omit',
      }).catch((err: unknown) => {
        lastError = err
        return null
      })
      clearTimeout(timer)

      if (!res) {
        if (attempt === RETRIES) {
          throw new JmapError('network', '网络请求失败，请检查服务器连接', 0, String(lastError))
        }
        await sleep(300 * (attempt + 1) ** 2)
        continue
      }

      if (res.status === 401) {
        throw new JmapError('unauthorized', '登录状态已失效，请重新登录', 401)
      }
      if (res.status >= 500) {
        lastError = new Error(`HTTP ${res.status}`)
        if (attempt === RETRIES) {
          throw new JmapError('server', `服务端错误（HTTP ${res.status}）`, res.status)
        }
        await sleep(300 * (attempt + 1) ** 2)
        continue
      }
      if (!res.ok) {
        const text = await res.text()
        throw new JmapError('http', `请求被拒绝（HTTP ${res.status}）`, res.status, text.slice(0, 300))
      }

      return (await res.json()) as JmapResponse
    }

    throw new JmapError('network', '网络请求失败')
  }

  /** 单方法调用，自动把 JMAP 的 error 响应转成异常 */
  async callOne<T = Record<string, any>>(
    name: string,
    args: Record<string, unknown>,
    using: string[] = [CORE, MAIL],
  ): Promise<T> {
    const res = await this.call([[name, args, 'r1']], using)
    const first = res.methodResponses?.[0]
    if (!first) throw new JmapError('empty', '服务端未返回结果')
    throwIfError(first)
    return first[1] as T
  }

  /** 一次往返里顺序执行多个方法，返回各自的 args */
  async callMany(
    methodCalls: MethodCall[],
    using: string[] = [CORE, MAIL],
  ): Promise<Record<string, Record<string, any>>> {
    const res = await this.call(methodCalls, using)
    const out: Record<string, Record<string, any>> = {}
    res.methodResponses.forEach((r) => {
      out[r[2]] = r[1]
    })
    return out
  }

  async upload(file: File): Promise<UploadResult> {
    if (MOCK_ENABLED) {
      const { mockUpload } = await import('../mocks')
      return mockUpload(file, await this.primaryAccountId())
    }

    const session = await this.discover()
    const accountId = await this.primaryAccountId()
    const raw = (session.uploadUrl || '/jmap/upload/{accountId}/').replace('{accountId}', accountId)
    const url = joinUrl(window.location.origin, raw)

    const res = await fetch(url, {
      method: 'POST',
      headers: this.headers({ 'Content-Type': file.type || 'application/octet-stream' }),
      body: file,
      credentials: 'omit',
    }).catch(() => {
      throw new JmapError('upload', '附件上传失败，请检查网络连接')
    })

    if (!res.ok) {
      throw new JmapError('upload', `附件上传失败（HTTP ${res.status}）`, res.status)
    }
    return (await res.json()) as UploadResult
  }

  /** 下载附件内容（downloadUrl 需要认证头，不能用裸链接） */
  async downloadBlob(blobId: Id, name: string, type = 'application/octet-stream'): Promise<Blob> {
    if (MOCK_ENABLED) {
      const { mockDownload } = await import('../mocks')
      return mockDownload(blobId, name, type)
    }

    const url = await this.downloadUrl(blobId, name, type)
    const res = await fetch(url, { headers: this.headers(), credentials: 'omit' })
    if (!res.ok) {
      throw new JmapError('download', `附件下载失败（HTTP ${res.status}）`, res.status)
    }
    return res.blob()
  }

  /** 生成附件下载地址（downloadUrl 是模板，需替换占位符） */
  async downloadUrl(blobId: Id, name: string, type = 'application/octet-stream'): Promise<string> {
    const session = await this.discover()
    const accountId = await this.primaryAccountId()
    const raw = (session.downloadUrl || '/jmap/download/{accountId}/{blobId}/{name}?accept={type}')
      .replace('{accountId}', accountId)
      .replace('{blobId}', blobId)
      .replace('{name}', encodeURIComponent(name || 'download'))
      .replace('{type}', encodeURIComponent(type))
    return joinUrl(window.location.origin, raw)
  }
}

export function throwIfError(response: MethodResponse): void {
  const args = response[1]
  if (response[0] === 'error' || (args && typeof args.type === 'string' && !('list' in args))) {
    throw new JmapError(
      args?.type ?? 'unknown',
      // 服务端错误码与描述都是英文，界面上一律换成中文提示
      translateFailure(args?.type, args?.description),
      0,
      args?.description,
      args?.properties,
    )
  }
}

export const jmap = new JmapClient()
