import { CORE, STALWART, jmap } from './client'
import { fieldLabel, translateFailure } from '../utils/i18n'
import type { AccountRecord, DomainRecord, Id } from './types'

const USING = [CORE, STALWART]

export async function listDomains(): Promise<DomainRecord[]> {
  const res = await jmap.callOne<{ list: DomainRecord[] }>('x:Domain/get', { ids: null }, USING)
  return res.list ?? []
}

export async function createDomain(name: string): Promise<Id> {
  const res = await jmap.callOne<{
    created?: Record<string, { id: Id }>
    notCreated?: Record<string, { type: string; description?: string; properties?: string[] }>
  }>('x:Domain/set', { create: { domain: { name } } }, USING)
  const created = res.created?.domain
  if (!created) {
    const failure = res.notCreated?.domain
    const fields = (failure?.properties ?? []).map((item) => fieldLabel(item)).join('、')
    const reason = translateFailure(failure?.type, failure?.description)
    throw new Error(fields ? `创建域名失败：${fields}${reason}` : `创建域名失败：${reason}`)
  }
  return created.id
}

export async function updateDomain(id: Id, patch: Partial<DomainRecord>): Promise<void> {
  await jmap.callOne('x:Domain/set', { update: { [id]: patch } }, USING)
}

export async function listAccounts(): Promise<AccountRecord[]> {
  const res = await jmap.callOne<{ list: AccountRecord[] }>('x:Account/get', { ids: null }, USING)
  return res.list ?? []
}

export interface CreateAccountInput {
  name: string
  domainId: Id
  password: string
  quotaBytes?: number
  description?: string
  aliases?: string[]
}

/**
 * 建号。实测约束（见 docs/jmap-contract.md）：
 * - credentials 必须是 map，key 为数字字符串
 * - aliases 也是 map
 * - 密码有强度校验，弱密码会被服务端拒绝
 */
export async function createAccount(input: CreateAccountInput): Promise<Id> {
  const aliases: Record<string, { enable: boolean; name: string; domainId: Id }> = {}
  ;(input.aliases ?? []).forEach((alias, index) => {
    aliases[String(index + 1)] = { enable: true, name: alias, domainId: input.domainId }
  })

  const payload: Record<string, unknown> = {
    '@type': 'User',
    name: input.name,
    domainId: input.domainId,
    credentials: { 1: { '@type': 'Password', secret: input.password } },
    roles: { '@type': 'User' },
    quotas: input.quotaBytes ? { maxDiskQuota: input.quotaBytes } : {},
    aliases,
    description: input.description ?? null,
    locale: 'zh-CN',
    timeZone: 'Asia/Shanghai',
  }

  const res = await jmap.callOne<{
    created?: Record<string, { id: Id }>
    notCreated?: Record<string, { type: string; description?: string; properties?: string[] }>
  }>('x:Account/set', { create: { account: payload } }, USING)

  const created = res.created?.account
  if (!created) {
    const failure = res.notCreated?.account
    const fields = (failure?.properties ?? []).map((item) => fieldLabel(item)).join('、')
    // 服务端描述是英文（如 "password too weak"），一律换成中文提示
    const reason = translateFailure(failure?.type, failure?.description)
    throw new Error(fields ? `${fields}：${reason}` : reason)
  }
  return created.id
}

/** 改密码：会整体替换 credentials 列表 */
export async function setAccountPassword(id: Id, password: string): Promise<void> {
  await jmap.callOne(
    'x:Account/set',
    { update: { [id]: { credentials: { 1: { '@type': 'Password', secret: password } } } } },
    USING,
  )
}

export async function setAccountQuota(id: Id, quotaBytes: number): Promise<void> {
  await jmap.callOne('x:Account/set', { update: { [id]: { quotas: { maxDiskQuota: quotaBytes } } } }, USING)
}

export async function setAccountAliases(id: Id, names: string[], domainId: Id): Promise<void> {
  const aliases: Record<string, { enable: boolean; name: string; domainId: Id }> = {}
  names.forEach((name, index) => {
    aliases[String(index + 1)] = { enable: true, name, domainId }
  })
  await jmap.callOne('x:Account/set', { update: { [id]: { aliases } } }, USING)
}

export async function setAccountDescription(id: Id, description: string): Promise<void> {
  await jmap.callOne('x:Account/set', { update: { [id]: { description } } }, USING)
}

export async function destroyAccount(id: Id): Promise<void> {
  await jmap.callOne('x:Account/set', { destroy: [id] }, USING)
}

/** 当前登录账号的管理视图（设置页展示邮箱地址、配额、别名） */
export async function getAccountById(id: Id): Promise<AccountRecord | null> {
  const res = await jmap.callOne<{ list: AccountRecord[] }>('x:Account/get', { ids: [id] }, USING)
  return res.list?.[0] ?? null
}

/** 账号的磁盘用量（字节），失败时返回 null 让 UI 隐藏进度条 */
export async function getDiskUsage(): Promise<{ used: number; quota: number } | null> {
  const caps = await jmap.accountCapabilities()
  if (!Object.keys(caps).includes(STALWART)) return null

  const session = await jmap.discover()
  const accountId = session.primaryAccounts['urn:ietf:params:jmap:mail']
  const username = session.username
  const accounts = await listAccounts()
  const self = accounts.find((item) => item.name === username || item.emailAddress === username)
  if (!self) return null

  return {
    used: self.usedDiskQuota ?? 0,
    quota: self.quotas?.maxDiskQuota ?? 0,
  }
}
