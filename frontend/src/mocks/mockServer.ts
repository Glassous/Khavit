/**
 * 一个跑在浏览器内存里的「假 JMAP 服务」。
 *
 * 只实现前端实际用到的方法（Mailbox/Email/Thread/Identity/EmailSubmission + x:Domain/x:Account），
 * 数据放在 localStorage 里，刷新后改动仍在；清掉 `postal.mock.state.v1` 即可恢复演示数据。
 *
 * 本文件只会被 `import('../mocks')` 动态加载，生产构建不会包含。
 */
import type {
  AccountRecord,
  DomainRecord,
  Email,
  EmailAddress,
  EmailQueryFilter,
  Id,
  JmapResponse,
  JmapSession,
  Mailbox,
  MethodCall,
  MethodResponse,
  UploadResult,
} from '../jmap/types'
import { ACCOUNT_ID, createSeed, type MockState } from './mockSeed'

const CORE = 'urn:ietf:params:jmap:core'
const MAIL = 'urn:ietf:params:jmap:mail'
const SUBMISSION = 'urn:ietf:params:jmap:submission'
const STALWART = 'urn:stalwart:jmap'

const STORAGE_KEY = 'postal.mock.state.v1'
/** 制造一点网络延迟，让骨架屏/loading 在本地也能被看到（测试里关掉） */
const DELAY = import.meta.env.MODE === 'test' ? 0 : 90

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

let cache: MockState | null = null

function persist(state: MockState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // 超出配额时退回内存态，不影响演示
  }
}

function nextId(state: MockState, prefix: string): string {
  state.seq += 1
  return `${prefix}-${state.seq}`
}

/** 登录邮箱变了（换账号/换域名）时，让演示账号跟着变，设置页才不会驴唇不对马嘴 */
function syncUser(state: MockState, username: string): void {
  if (!username || state.currentUser === username) return
  state.currentUser = username
  const [local, domain] = username.split('@')
  const account = state.accounts.find((item) => item.id === ACCOUNT_ID)
  if (!account) return

  let domainRecord = state.domains.find((item) => item.name === domain)
  if (!domainRecord) {
    domainRecord = {
      id: nextId(state, 'dom'),
      name: domain || 'khavit.dev',
      aliases: {},
      enable: true,
      description: '登录时自动创建',
      createdAt: new Date().toISOString(),
    }
    state.domains.push(domainRecord)
  }

  account.name = local || 'demo'
  account.emailAddress = username
  account.domainId = domainRecord.id
  account.aliases = {
    1: { enable: true, name: 'hi', domainId: domainRecord.id, description: '对外联系' },
  }
  persist(state)
}

function load(username?: string): MockState {
  if (cache) {
    if (username) syncUser(cache, username)
    return cache
  }

  const raw = localStorage.getItem(STORAGE_KEY)
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as MockState
      if (parsed?.version === 1 && Array.isArray(parsed.emails)) {
        cache = parsed
        if (username) syncUser(cache, username)
        return cache
      }
    } catch {
      console.warn('[mock] 本地演示数据损坏，已重新生成')
    }
  }

  cache = createSeed(username || 'demo@khavit.dev')
  persist(cache)
  return cache
}

/* ------------------------------- 工具 ------------------------------- */

function emailText(email: Email): string {
  const values = Object.values(email.bodyValues ?? {})
  return values.map((item) => item.value ?? '').join('\n')
}

function movingCount<T>(list: T[], pick: (item: T) => string): number {
  return new Set(list.map(pick)).size
}

function mailboxWithCounts(state: MockState): Mailbox[] {
  return state.mailboxes.map((box) => {
    const items = state.emails.filter((email) => email.mailboxIds?.[box.id])
    const unread = items.filter((email) => !email.keywords?.$seen)
    return {
      ...box,
      totalEmails: items.length,
      unreadEmails: unread.length,
      totalThreads: movingCount(items, (item) => item.threadId),
      unreadThreads: movingCount(unread, (item) => item.threadId),
    }
  })
}

function pickProps(email: Email, properties?: string[]): Email {
  if (!properties?.length) return email
  const out: Record<string, unknown> = {}
  properties.forEach((key) => {
    if (key in email) out[key] = (email as unknown as Record<string, unknown>)[key]
  })
  if (!('id' in out)) out.id = email.id
  return out as unknown as Email
}

/** 支持 `mailboxIds/x`、`keywords/$draft` 这类路径补丁，也兼容 `{ keywords: {...} }` 写法 */
function applyPatch(email: Email, patch: Record<string, unknown>): void {
  const target = email as unknown as Record<string, any>
  Object.entries(patch).forEach(([key, value]) => {
    if (key.includes('/')) {
      const [prop, sub] = key.split('/')
      const bag = { ...(target[prop] ?? {}) }
      if (value === null) delete bag[sub]
      else bag[sub] = value
      target[prop] = bag
      return
    }
    if (key === 'keywords' || key === 'mailboxIds') {
      target[key] = { ...(value as Record<string, unknown>) }
      return
    }
    // patchEmailKeywords 直接发 { '$seen': true }，也当作关键字补丁处理
    if (key.startsWith('$')) {
      const bag = { ...(target.keywords ?? {}) }
      if (value === null) delete bag[key]
      else bag[key] = value
      target.keywords = bag
      return
    }
    target[key] = value
  })
  // 关键字变化后，摘要/大小无关，但未读数需要重新统计（getMailboxes 时算）
  email.hasAttachment = Boolean(email.attachments?.length)
}

function queryEmails(
  state: MockState,
  args: Record<string, unknown>,
): { ids: Id[]; total: number } {
  const filter = (args.filter ?? {}) as EmailQueryFilter
  let list = state.emails.slice()

  if (filter.inMailbox) list = list.filter((email) => email.mailboxIds?.[filter.inMailbox!])
  if (filter.hasKeyword) list = list.filter((email) => email.keywords?.[filter.hasKeyword!])
  if (filter.notKeyword) list = list.filter((email) => !email.keywords?.[filter.notKeyword!])
  if (filter.from) {
    const value = filter.from.toLowerCase()
    list = list.filter((email) => (email.from ?? []).some((item) => item.email.toLowerCase().includes(value)))
  }
  if (filter.subject) {
    const value = filter.subject.toLowerCase()
    list = list.filter((email) => (email.subject ?? '').toLowerCase().includes(value))
  }
  if (filter.text) {
    const value = filter.text.toLowerCase()
    list = list.filter((email) => {
      const haystack = [
        email.subject ?? '',
        email.preview ?? '',
        ...(email.from ?? []).map((item) => `${item.name ?? ''} ${item.email}`),
        ...(email.to ?? []).map((item) => `${item.name ?? ''} ${item.email}`),
        emailText(email),
      ]
        .join(' ')
        .toLowerCase()
      return haystack.includes(value)
    })
  }

  const sort = Array.isArray(args.sort) ? (args.sort[0] as { property?: string; isAscending?: boolean }) : null
  const property = sort?.property ?? 'receivedAt'
  const ascending = Boolean(sort?.isAscending)
  list.sort((a, b) => {
    const left = String((a as unknown as Record<string, unknown>)[property] ?? '')
    const right = String((b as unknown as Record<string, unknown>)[property] ?? '')
    return ascending ? left.localeCompare(right) : right.localeCompare(left)
  })

  const total = list.length
  const position = Number(args.position ?? 0)
  const limit = args.limit === undefined ? total : Number(args.limit)
  return { total, ids: list.slice(position, position + limit).map((item) => item.id) }
}

function createEmail(state: MockState, payload: Record<string, any>): Email {
  const id = nextId(state, 'm')
  const bodyValues = (payload.bodyValues ?? {}) as Email['bodyValues']
  const text = bodyValues?.text?.value ?? bodyValues?.html?.value ?? ''
  const attachments = ((payload.attachments ?? []) as Record<string, any>[]).map((item, index) => {
    const meta = state.blobs[String(item.blobId)]
    return {
      partId: `att-${index + 1}`,
      blobId: String(item.blobId),
      size: meta?.size ?? 0,
      name: item.name ?? meta?.name ?? 'attachment',
      type: item.type ?? meta?.type ?? 'application/octet-stream',
      disposition: 'attachment',
    }
  })

  const when = new Date().toISOString()
  const email: Email = {
    id,
    threadId: `th-${id}`,
    mailboxIds: { ...(payload.mailboxIds ?? {}) },
    keywords: { ...(payload.keywords ?? {}) },
    from: (payload.from as EmailAddress[]) ?? [],
    to: (payload.to as EmailAddress[]) ?? [],
    cc: payload.cc as EmailAddress[] | undefined,
    bcc: payload.bcc as EmailAddress[] | undefined,
    subject: String(payload.subject ?? ''),
    receivedAt: when,
    sentAt: when,
    size: text.length + attachments.reduce((sum, item) => sum + item.size, 0),
    preview: text.replace(/\s+/g, ' ').trim().slice(0, 140),
    hasAttachment: attachments.length > 0,
    bodyValues,
    textBody: (payload.textBody as Email['textBody']) ?? [{ partId: 'text', type: 'text/plain', blobId: null, size: text.length }],
    htmlBody: payload.htmlBody as Email['htmlBody'],
    attachments: attachments.length > 0 ? attachments : undefined,
    inReplyTo: payload.inReplyTo as string[] | undefined,
    references: payload.references as string[] | undefined,
  }

  state.emails.unshift(email)
  return email
}

/* ------------------------------ 方法分发 ------------------------------ */

function dispatch(state: MockState, name: string, args: Record<string, any>, username: string): Record<string, any> {
  switch (name) {
    case 'Mailbox/get':
      return { accountId: ACCOUNT_ID, state: 'mock-mailbox', list: mailboxWithCounts(state), notFound: [] }

    case 'Email/query': {
      const { ids, total } = queryEmails(state, args)
      return {
        accountId: ACCOUNT_ID,
        queryState: 'mock-query',
        canCalculateChanges: false,
        position: Number(args.position ?? 0),
        ids,
        total,
      }
    }

    case 'Email/get': {
      const ids = (args.ids ?? []) as Id[]
      const list: Email[] = []
      const notFound: Id[] = []
      ids.forEach((id) => {
        const email = state.emails.find((item) => item.id === id)
        if (email) list.push(pickProps(email, args.properties as string[] | undefined))
        else notFound.push(id)
      })
      return { accountId: ACCOUNT_ID, state: 'mock-email', list, notFound }
    }

    case 'Email/set': {
      const created: Record<string, unknown> = {}
      const notCreated: Record<string, unknown> = {}
      const updated: Record<string, unknown> = {}
      const notUpdated: Record<string, unknown> = {}
      const destroyed: Id[] = []

      Object.entries((args.create ?? {}) as Record<string, Record<string, any>>).forEach(([key, payload]) => {
        const email = createEmail(state, payload)
        created[key] = { id: email.id, threadId: email.threadId, blobId: `${email.id}-blob`, size: email.size }
      })

      Object.entries((args.update ?? {}) as Record<string, Record<string, unknown>>).forEach(([id, patch]) => {
        const email = state.emails.find((item) => item.id === id)
        if (!email) {
          notUpdated[id] = { type: 'notFound' }
          return
        }
        applyPatch(email, patch)
        updated[id] = null
      })

      ;((args.destroy ?? []) as Id[]).forEach((id) => {
        const index = state.emails.findIndex((item) => item.id === id)
        if (index >= 0) {
          state.emails.splice(index, 1)
          destroyed.push(id)
        }
      })

      return {
        accountId: ACCOUNT_ID,
        oldState: 'mock-email',
        newState: 'mock-email',
        created,
        notCreated,
        updated,
        notUpdated,
        destroyed,
        notDestroyed: {},
      }
    }

    case 'Thread/get': {
      const ids = (args.ids ?? []) as Id[]
      const list = ids.map((id) => ({
        id,
        emailIds: state.emails.filter((email) => email.threadId === id).map((email) => email.id),
      }))
      return { accountId: ACCOUNT_ID, state: 'mock-thread', list, notFound: [] }
    }

    case 'Identity/get':
      return {
        accountId: ACCOUNT_ID,
        state: 'mock-identity',
        list: [
          {
            id: 'id-1',
            name: username.split('@')[0] || '我',
            email: username,
            textSignature: '',
            htmlSignature: '',
            mayDelete: false,
          },
        ],
        notFound: [],
      }

    case 'EmailSubmission/set': {
      const created: Record<string, unknown> = {}
      const notCreated: Record<string, unknown> = {}

      Object.entries((args.create ?? {}) as Record<string, Record<string, any>>).forEach(([key, payload]) => {
        const email = state.emails.find((item) => item.id === payload.emailId)
        if (!email) {
          notCreated[key] = { type: 'invalidEmail', description: '找不到要发送的草稿' }
          return
        }

        const submissionId = nextId(state, 'sub')
        created[key] = { id: submissionId, emailId: email.id }

        // onSuccessUpdateEmail 的 key 是 `#<createKey>`，值是一条路径补丁
        const patch = (args.onSuccessUpdateEmail ?? {})[`#${key}`] as Record<string, unknown> | undefined
        if (patch) applyPatch(email, patch)

        email.sentAt = new Date().toISOString()
        email.receivedAt = email.sentAt
      })

      return { accountId: ACCOUNT_ID, created, notCreated }
    }

    case 'x:Domain/get':
      return { state: 'mock-domain', list: state.domains, notFound: [] }

    case 'x:Domain/set': {
      const created: Record<string, unknown> = {}
      const notCreated: Record<string, unknown> = {}

      Object.entries((args.create ?? {}) as Record<string, Record<string, any>>).forEach(([key, payload]) => {
        const domainName = String(payload.name ?? '').trim().toLowerCase()
        if (!domainName) {
          notCreated[key] = { type: 'invalidProperties', properties: ['name'], description: '域名不能为空' }
          return
        }
        if (state.domains.some((item) => item.name.toLowerCase() === domainName)) {
          notCreated[key] = { type: 'invalidProperties', properties: ['name'], description: '域名已存在' }
          return
        }
        const record: DomainRecord = {
          id: nextId(state, 'dom'),
          name: domainName,
          aliases: {},
          enable: payload.enable ?? true,
          description: payload.description ?? null,
          createdAt: new Date().toISOString(),
          certificateManagement: { '@type': 'Automatic' },
          dkimManagement: { '@type': 'Automatic' },
          dnsManagement: { '@type': 'Manual' },
          catchAllAddress: null,
          allowRelaying: false,
        }
        state.domains.push(record)
        created[key] = { id: record.id }
      })

      Object.entries((args.update ?? {}) as Record<string, Record<string, unknown>>).forEach(([id, patch]) => {
        const record = state.domains.find((item) => item.id === id)
        if (record) Object.assign(record, patch)
      })

      ;((args.destroy ?? []) as Id[]).forEach((id) => {
        state.domains = state.domains.filter((item) => item.id !== id)
      })

      return { state: 'mock-domain', created, notCreated, updated: {}, notUpdated: {}, destroyed: [] }
    }

    case 'x:Account/get':
      return { state: 'mock-account', list: state.accounts, notFound: [] }

    case 'x:Account/set': {
      const created: Record<string, unknown> = {}
      const notCreated: Record<string, unknown> = {}
      const notUpdated: Record<string, unknown> = {}

      Object.entries((args.create ?? {}) as Record<string, Record<string, any>>).forEach(([key, payload]) => {
        const localPart = String(payload.name ?? '').trim()
        const secret = String(payload.credentials?.['1']?.secret ?? '')
        const domain = state.domains.find((item) => item.id === payload.domainId)?.name ?? ''

        if (!localPart) {
          notCreated[key] = { type: 'invalidProperties', properties: ['name'], description: '账号名不能为空' }
          return
        }
        if (secret.length < 12) {
          notCreated[key] = { type: 'invalidProperties', properties: ['credentials'], description: '密码至少 12 位' }
          return
        }
        const emailAddress = `${localPart}@${domain}`
        if (state.accounts.some((item) => item.emailAddress === emailAddress)) {
          notCreated[key] = { type: 'invalidProperties', properties: ['name'], description: '该邮箱账号已存在' }
          return
        }

        const record: AccountRecord = {
          id: nextId(state, 'acc'),
          '@type': 'User',
          name: localPart,
          domainId: payload.domainId,
          emailAddress,
          credentials: { 1: { '@type': 'Password', secret } },
          roles: { '@type': 'User' },
          quotas: payload.quotas ?? {},
          aliases: payload.aliases ?? {},
          description: payload.description ?? null,
          locale: payload.locale ?? 'zh-CN',
          timeZone: payload.timeZone ?? 'Asia/Shanghai',
          usedDiskQuota: 0,
          createdAt: new Date().toISOString(),
        }
        state.accounts.push(record)
        created[key] = { id: record.id }
      })

      Object.entries((args.update ?? {}) as Record<string, Record<string, any>>).forEach(([id, patch]) => {
        const record = state.accounts.find((item) => item.id === id)
        if (!record) {
          notUpdated[id] = { type: 'notFound' }
          return
        }
        if (patch.credentials) {
          const secret = String(patch.credentials?.['1']?.secret ?? '')
          if (secret.length < 12) {
            notUpdated[id] = { type: 'invalidProperties', properties: ['credentials'], description: '密码至少 12 位' }
            return
          }
        }
        Object.assign(record, patch)
        if (patch.aliases) record.aliases = { ...patch.aliases }
        if (patch.quotas) record.quotas = { ...record.quotas, ...patch.quotas }
      })

      ;((args.destroy ?? []) as Id[]).forEach((id) => {
        state.accounts = state.accounts.filter((item) => item.id !== id)
      })

      return { state: 'mock-account', created, notCreated, updated: {}, notUpdated, destroyed: [] }
    }

    default:
      throw new Error(`本地模拟服务未实现方法：${name}`)
  }
}

/** 递归解析 JMAP 的 resultOf 引用（`#ids` → 前一个方法的结果） */
function resolveArgs(value: unknown, results: Record<string, unknown>): unknown {
  if (Array.isArray(value)) return value.map((item) => resolveArgs(item, results))
  if (!value || typeof value !== 'object') return value

  const source = value as Record<string, unknown>
  const ref = source.resultOf as string | undefined
  if (ref && typeof source.path === 'string') {
    return evalPath(results[ref], source.path)
  }

  const out: Record<string, unknown> = {}
  Object.entries(source).forEach(([key, item]) => {
    // 只有 `{ resultOf, path }` 形状才是引用；`#submission` 这类是普通字段名，不能去掉 #
    const isRef = Boolean(item && typeof item === 'object' && 'resultOf' in (item as Record<string, unknown>))
    if (isRef) {
      out[key.replace(/^#/, '')] = resolveArgs(item, results)
    } else {
      out[key] = resolveArgs(item, results)
    }
  })
  return out
}

function evalPath(source: unknown, path: string): unknown {
  const segments = path.split('/').filter(Boolean)
  const walk = (value: any, index: number): any => {
    if (index === segments.length) return value
    const segment = segments[index]
    if (segment === '*') {
      if (!Array.isArray(value)) return []
      return value.flatMap((item) => walk(item, index + 1) ?? [])
    }
    return walk(value?.[segment], index + 1)
  }
  return walk(source, 0)
}

/* ------------------------------ 对外接口 ------------------------------ */

const DEFAULT_USER = 'demo@khavit.dev'

function normalizeUser(username?: string): string {
  return username?.trim() || DEFAULT_USER
}

export function session(username?: string): JmapSession {
  const user = normalizeUser(username)
  load(user)
  const account = {
    name: user,
    isPersonal: true,
    isReadOnly: false,
    accountCapabilities: { [MAIL]: {}, [SUBMISSION]: {}, [STALWART]: {} },
  }
  return {
    apiUrl: '/jmap/',
    uploadUrl: '/jmap/upload/{accountId}/',
    downloadUrl: '/jmap/download/{accountId}/{blobId}/{name}?accept={type}',
    eventSourceUrl: '/jmap/eventsource/?types={types}&closeafter={closeafter}&ping={ping}',
    username: user,
    accounts: { [ACCOUNT_ID]: account },
    primaryAccounts: { [MAIL]: ACCOUNT_ID, [SUBMISSION]: ACCOUNT_ID, [STALWART]: ACCOUNT_ID },
    capabilities: {
      [CORE]: {
        maxSizeUpload: 50_000_000,
        maxConcurrentUpload: 4,
        maxSizeRequest: 10_000_000,
        maxConcurrentRequests: 4,
        maxCallsInRequest: 32,
        maxObjectsInGet: 1000,
        maxObjectsInSet: 1000,
      },
      [MAIL]: {},
      [SUBMISSION]: {},
      [STALWART]: {},
    },
    state: 'mock-session',
  }
}

export async function handle(username: string, calls: MethodCall[]): Promise<JmapResponse> {
  await sleep(DELAY)
  const user = normalizeUser(username)
  const state = load(user)
  const results: Record<string, unknown> = {}
  const methodResponses: MethodResponse[] = []

  calls.forEach(([name, rawArgs, callId]) => {
    try {
      const args = resolveArgs(rawArgs, results) as Record<string, any>
      const output = dispatch(state, name, args, user)
      results[callId] = output
      methodResponses.push([name, { ...output, accountId: output.accountId ?? ACCOUNT_ID }, callId])
    } catch (err) {
      methodResponses.push([
        'error',
        { type: 'serverFail', description: err instanceof Error ? err.message : String(err) },
        callId,
      ])
    }
  })

  persist(state)
  return { methodResponses, sessionState: 'mock-session' }
}

/** 浏览器有 File.text()，jsdom 里没有，退回 FileReader */
async function readText(file: File): Promise<string | undefined> {
  try {
    if (typeof file.text === 'function') return await file.text()
    return await new Promise<string | undefined>((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : undefined)
      reader.onerror = () => resolve(undefined)
      reader.readAsText(file)
    })
  } catch {
    return undefined
  }
}

export async function upload(file: File, accountId: Id): Promise<UploadResult> {
  await sleep(DELAY)
  const state = load()
  const blobId = nextId(state, 'blob')
  let text: string | undefined
  if (file.size <= 64 * 1024 && /^text\/|json|xml|csv|javascript/.test(file.type)) {
    text = await readText(file)
  }
  state.blobs[blobId] = {
    name: file.name,
    type: file.type || 'application/octet-stream',
    size: file.size,
    text,
  }
  persist(state)
  return { accountId, blobId, type: file.type || 'application/octet-stream', size: file.size }
}

export async function download(blobId: Id, name: string, type: string): Promise<Blob> {
  await sleep(DELAY)
  const state = load()
  const meta = state.blobs[blobId]
  const content =
    meta?.text ??
    `这是本地模拟附件：${name}

本地开发模式下附件由前端生成，生产环境会由 Stalwart 返回真实文件内容。
`
  return new Blob([content], { type: meta?.type || type || 'text/plain' })
}

/** 演示数据重置入口（控制台可调用：__resetMockData()） */
export function reset(): void {
  localStorage.removeItem(STORAGE_KEY)
  cache = null
}
