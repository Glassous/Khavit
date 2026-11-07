import { CORE, MAIL, jmap } from './client'
import { fieldLabel, translateFailure } from '../utils/i18n'
import type { Email, EmailQueryFilter, EmailQueryResult, Id, Mailbox } from './types'

/** 列表页需要的字段：不含正文，避免无谓流量 */
export const LIST_PROPERTIES = [
  'id',
  'threadId',
  'mailboxIds',
  'keywords',
  'from',
  'to',
  'subject',
  'receivedAt',
  'sentAt',
  'preview',
  'hasAttachment',
  'size',
]

/** 阅读页需要的字段 */
export const READ_PROPERTIES = [
  ...LIST_PROPERTIES,
  'cc',
  'bcc',
  'replyTo',
  'messageId',
  'inReplyTo',
  'references',
  'bodyStructure',
  'bodyValues',
  'attachments',
  'htmlBody',
  'textBody',
]

export async function getMailboxes(accountId: Id): Promise<Mailbox[]> {
  const res = await jmap.callOne<{ list: Mailbox[] }>('Mailbox/get', { accountId, ids: null }, [CORE, MAIL])
  return res.list ?? []
}

export interface ListEmailsParams {
  mailboxId: Id
  limit?: number
  position?: number
  filter?: EmailQueryFilter
  sortProperty?: string
  ascending?: boolean
}

export interface ListEmailsResult {
  emails: Email[]
  total: number
  position: number
  queryState: string
  hasMore: boolean
}

/**
 * 列表加载：query + get 压进一次往返（用 #ids 引用查询结果）。
 * 3 次往返降为 1 次，是首屏速度的关键。
 */
export async function listEmails(accountId: Id, params: ListEmailsParams): Promise<ListEmailsResult> {
  const limit = params.limit ?? 50
  const position = params.position ?? 0

  const queryArgs: Record<string, unknown> = {
    accountId,
    filter: { inMailbox: params.mailboxId, ...(params.filter ?? {}) },
    sort: [{ property: params.sortProperty ?? 'receivedAt', isAscending: params.ascending ?? false }],
    limit,
    position,
    calculateTotal: true,
  }

  const res = await jmap.callMany(
    [
      ['Email/query', queryArgs, 'q'],
      [
        'Email/get',
        {
          accountId,
          '#ids': { resultOf: 'q', name: 'Email/query', path: '/ids/*' },
          properties: LIST_PROPERTIES,
        },
        'g',
      ],
    ],
    [CORE, MAIL],
  )

  // 方法级错误会以 { type, description } 出现在对应 callId 下
  if (res.q?.type) {
    throw new Error(`查询失败：${translateFailure(res.q.type, res.q.description)}`)
  }
  const query = res.q as unknown as EmailQueryResult
  const emails = (res.g?.list ?? []) as Email[]
  const total = query?.total ?? emails.length

  return {
    emails,
    total,
    position: position + emails.length,
    queryState: query?.queryState ?? '',
    hasMore: position + emails.length < total,
  }
}

export async function getEmail(accountId: Id, id: Id): Promise<Email | null> {
  const res = await jmap.callOne<{ list: Email[] }>(
    'Email/get',
    {
      accountId,
      ids: [id],
      properties: READ_PROPERTIES,
      fetchTextBodyValues: true,
      fetchHTMLBodyValues: true,
      maxBodyValueBytes: 600_000,
    },
    [CORE, MAIL],
  )
  return res.list?.[0] ?? null
}

export async function getEmailsByIds(accountId: Id, ids: Id[]): Promise<Email[]> {
  if (ids.length === 0) return []
  const res = await jmap.callOne<{ list: Email[] }>(
    'Email/get',
    { accountId, ids, properties: LIST_PROPERTIES },
    [CORE, MAIL],
  )
  return res.list ?? []
}

/** 同一个 thread 中的全部邮件（会话合并） */
export async function getThreadEmails(accountId: Id, threadId: Id): Promise<Email[]> {
  const res = await jmap.callMany(
    [
      ['Thread/get', { accountId, ids: [threadId] }, 't'],
      [
        'Email/get',
        {
          accountId,
          '#ids': { resultOf: 't', name: 'Thread/get', path: '/list/*/emailIds' },
          properties: LIST_PROPERTIES,
        },
        'g',
      ],
    ],
    [CORE, MAIL],
  )
  return (res.g?.list ?? []) as Email[]
}

export interface KeywordPatch {
  [key: string]: boolean | null
}

interface SetFailure {
  type?: string
  description?: string
  properties?: string[]
}

/**
 * Email/set 调用的失败藏在 notUpdated / notDestroyed 里，HTTP 仍是 200。
 * 之前直接忽略，导致「点了已读但状态不变」这种静默失败，这里统一抛出来。
 */
function assertSetSucceeded(
  res: { notUpdated?: Record<string, SetFailure>; notDestroyed?: Record<string, SetFailure> },
  action: string,
): void {
  const failure = Object.entries(res.notUpdated ?? {})[0] ?? Object.entries(res.notDestroyed ?? {})[0]
  if (!failure) return
  const detail = failure[1]
  const fields = (detail?.properties ?? []).map((item) => fieldLabel(item)).join('、')
  const reason = translateFailure(detail?.type, detail?.description)
  const prefix = fields ? `${action}失败（${fields}）` : `${action}失败`
  throw new Error(`${prefix}：${reason}`)
}

/**
 * 修改邮件关键字（$seen / $flagged …）。
 *
 * 必须用 JMAP PatchObject 的路径写法 `keywords/<name>`：
 * 直接发 `{ "$seen": true }` 会被服务端当成 Email 的非法属性，
 * 返回 notUpdated: invalidProperties，邮件状态永远不变。
 */
export async function patchEmailKeywords(
  accountId: Id,
  ids: Id[],
  patch: KeywordPatch,
): Promise<void> {
  if (ids.length === 0) return
  const entries = Object.entries(patch)
  const update: Record<string, Record<string, boolean | null>> = {}
  ids.forEach((id) => {
    const paths: Record<string, boolean | null> = {}
    entries.forEach(([keyword, value]) => {
      paths[`keywords/${keyword}`] = value
    })
    update[id] = paths
  })
  const res = await jmap.callOne<{ notUpdated?: Record<string, SetFailure> }>(
    'Email/set',
    { accountId, update },
    [CORE, MAIL],
  )
  assertSetSucceeded(res, '更新邮件标记')
}

export async function markSeen(accountId: Id, ids: Id[], seen = true): Promise<void> {
  await patchEmailKeywords(accountId, ids, { '$seen': seen })
}

export async function toggleStar(accountId: Id, ids: Id[], starred: boolean): Promise<void> {
  await patchEmailKeywords(accountId, ids, { '$flagged': starred })
}

/** 移动到另一个邮箱（mailboxIds 是整体替换语义） */
export async function moveEmails(accountId: Id, ids: Id[], targetMailboxId: Id): Promise<void> {
  if (ids.length === 0) return
  const update: Record<string, { mailboxIds: Record<string, boolean> }> = {}
  ids.forEach((id) => {
    update[id] = { mailboxIds: { [targetMailboxId]: true } }
  })
  const res = await jmap.callOne<{ notUpdated?: Record<string, SetFailure> }>(
    'Email/set',
    { accountId, update },
    [CORE, MAIL],
  )
  assertSetSucceeded(res, '移动邮件')
}

/**
 * 删除：已在回收站的永久删除，否则移入回收站。
 * 返回实际执行的动作，便于 UI 提示「已移入回收站」。
 */
export async function deleteEmails(
  accountId: Id,
  ids: Id[],
  trashMailboxId?: Id,
  currentMailboxId?: Id,
): Promise<'moved' | 'destroyed'> {
  if (ids.length === 0) return 'moved'

  if (trashMailboxId && currentMailboxId !== trashMailboxId) {
    await moveEmails(accountId, ids, trashMailboxId)
    return 'moved'
  }

  const res = await jmap.callOne<{ notDestroyed?: Record<string, SetFailure> }>(
    'Email/set',
    { accountId, destroy: ids },
    [CORE, MAIL],
  )
  assertSetSucceeded(res, '删除邮件')
  return 'destroyed'
}

export async function searchEmails(
  accountId: Id,
  text: string,
  options: { limit?: number; position?: number } = {},
): Promise<ListEmailsResult> {
  const limit = options.limit ?? 50
  const position = options.position ?? 0

  const res = await jmap.callMany(
    [
      [
        'Email/query',
        {
          accountId,
          filter: { text },
          sort: [{ property: 'receivedAt', isAscending: false }],
          limit,
          position,
          calculateTotal: true,
        },
        'q',
      ],
      [
        'Email/get',
        {
          accountId,
          '#ids': { resultOf: 'q', name: 'Email/query', path: '/ids/*' },
          properties: LIST_PROPERTIES,
        },
        'g',
      ],
    ],
    [CORE, MAIL],
  )

  const query = res.q as unknown as EmailQueryResult
  const emails = (res.g?.list ?? []) as Email[]
  const total = query?.total ?? emails.length
  return {
    emails,
    total,
    position: position + emails.length,
    queryState: query?.queryState ?? '',
    hasMore: position + emails.length < total,
  }
}

/** 未读数汇总，侧栏徽标用 */
export function summarizeUnread(mailboxes: Mailbox[]): { inboxUnread: number; junkUnread: number } {
  const find = (role: string) => mailboxes.find((m) => m.role === role)?.unreadEmails ?? 0
  return { inboxUnread: find('inbox'), junkUnread: find('junk') }
}
