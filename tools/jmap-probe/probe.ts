/**
 * Stalwart JMAP 契约探针
 *
 * 目的：在真实后端上验证前端依赖的字段与方法是否存在，避免照文档猜。
 *
 * 用法：
 *   JMAP_URL=https://mail.example.com \
 *   MAIL_USER=admin@example.com \
 *   MAIL_PASS=****** \
 *   npm run probe
 *
 * 可选：
 *   ADMIN_USER / ADMIN_PASS  用于管理 API（x:Account / x:Domain），
 *                            默认复用 MAIL_USER / MAIL_PASS
 *   INSECURE=1               跳过 TLS 校验（自签证书时用）
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const BASE = (process.env.JMAP_URL ?? 'https://mail.example.com').replace(/\/+$/, '')
const USER = process.env.MAIL_USER ?? ''
const PASS = process.env.MAIL_PASS ?? ''
const ADMIN_USER = process.env.ADMIN_USER ?? USER
const ADMIN_PASS = process.env.ADMIN_PASS ?? PASS

if (process.env.INSECURE === '1') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
}

const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../docs/.jmap-raw')

const CORE = 'urn:ietf:params:jmap:core'
const MAIL = 'urn:ietf:params:jmap:mail'
const SUBMISSION = 'urn:ietf:params:jmap:submission'
const VACATION = 'urn:ietf:params:jmap:vacationresponse'
const STALWART = 'urn:stalwart:jmap'

const basic = (user: string, pass: string) => `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`

/** Stalwart 返回的 apiUrl/uploadUrl 可能是相对路径（/jmap/），必须基于 BASE 解析 */
const absolute = (url: string): string => (url.startsWith('http') ? url : `${BASE}${url.startsWith('/') ? '' : '/'}${url}`)

const authHeaders = (user: string, pass: string) => ({
  Authorization: basic(user, pass),
  'Content-Type': 'application/json',
})

/** 打印一小段 JSON，长的截断，避免刷屏 */
function preview(label: string, value: unknown, max = 1200): void {
  const text = JSON.stringify(value, null, 2) ?? 'null'
  const clipped = text.length > max ? `${text.slice(0, max)}\n  ...(已截断，完整内容见 docs/.jmap-raw/)` : text
  console.log(`\n----- ${label} -----\n${clipped}`)
}

function save(name: string, value: unknown): void {
  mkdirSync(OUT_DIR, { recursive: true })
  writeFileSync(resolve(OUT_DIR, `${name}.json`), JSON.stringify(value, null, 2), 'utf8')
}

async function fetchJson(url: string, init: RequestInit): Promise<{ status: number; body: any }> {
  const res = await fetch(url, init)
  const text = await res.text()
  let body: unknown = text
  try {
    body = JSON.parse(text)
  } catch {
    // 非 JSON 响应保留原文，便于识别反代/证书问题
  }
  return { status: res.status, body }
}

async function main(): Promise<void> {
  if (!USER || !PASS) {
    console.error('缺少 MAIL_USER / MAIL_PASS 环境变量')
    process.exit(1)
  }

  console.log(`目标后端：${BASE}`)
  console.log(`账号：${USER}`)

  // ---- 1. session 发现 ----
  const session = await fetchJson(`${BASE}/.well-known/jmap`, { headers: authHeaders(USER, PASS) })
  console.log(`session 状态码：${session.status}`)
  save('session', session.body)
  preview('session', session.body)

  if (session.status !== 200) {
    console.error('session 发现失败。常见原因：反代 Host/SNI 不匹配、证书无效、账号密码错误')
    process.exit(1)
  }

  const s = session.body as Record<string, any>
  // 注意 1：Stalwart 返回的 apiUrl 是「按它自己配置的 hostname」拼出的绝对 URL，不含反代端口。
  //   生产同源部署时可直接使用；本地端口映射场景必须用 JMAP_API_URL 覆盖。
  // 注意 2：也可能返回相对路径（/jmap/），所以统一过一遍 absolute()
  const apiOverride = process.env.JMAP_API_URL
  const apiUrl: string = absolute(apiOverride || s.apiUrl || '/jmap/')
  if (apiOverride) console.log(`apiUrl 被 JMAP_API_URL 覆盖为：${apiUrl}`)
  const primary: Record<string, string> = s.primaryAccounts ?? {}
  const accountId: string = primary[MAIL] ?? Object.keys(s.accounts ?? {})[0] ?? ''
  const capabilities: string[] = Object.keys(s.capabilities ?? {})
  const accountCapabilities: string[] = Object.keys(s.accounts?.[accountId]?.accountCapabilities ?? {})

  console.log(`apiUrl：${apiUrl}`)
  console.log(`primaryAccounts：${JSON.stringify(s.primaryAccounts ?? {})}`)
  console.log(`capabilities：${capabilities.join(', ')}`)
  console.log(`uploadUrl：${s.uploadUrl ?? '(未提供)'}`)
  console.log(`downloadUrl：${s.downloadUrl ?? '(未提供)'}`)

  const hasMail = capabilities.includes(MAIL)
  const hasSubmission = capabilities.includes(SUBMISSION)
  const hasVacation = capabilities.includes(VACATION)
  // 实测：urn:stalwart:jmap 不在 session.capabilities 里，而是挂在 accountCapabilities 上
  const hasStalwart = capabilities.includes(STALWART) || accountCapabilities.includes(STALWART)
  console.log(`\n账号级能力：${accountCapabilities.join(', ')}`)
  console.log(`能力检查：mail=${hasMail} submission=${hasSubmission} vacation=${hasVacation} stalwart-admin=${hasStalwart}`)

  // ---- 2. 邮箱与会话身份 ----
  const identity: Record<string, unknown> = {}
  if (hasMail) {
    const mailboxes = await fetchJson(apiUrl, {
      method: 'POST',
      headers: authHeaders(USER, PASS),
      body: JSON.stringify({
        using: [CORE, MAIL],
        methodCalls: [
          ['Mailbox/get', { accountId, ids: null }, 'mb'],
          ['Identity/get', { accountId }, 'id1'],
        ],
      }),
    })
    save('mailbox-get', mailboxes.body)
    preview('Mailbox/get + Identity/get', mailboxes.body)

    const list: any[] = (mailboxes.body as any)?.methodResponses?.[0]?.[1]?.list ?? []
    console.log(`\n邮箱数量：${list.length}`)
    list.forEach((m) => console.log(`  ${m.role ?? '-'}\t${m.name}\tunread=${m.unreadEmails ?? 0}\ttotal=${m.totalEmails ?? 0}\tid=${m.id}`))

    // ---- 3. 邮件查询 + 取正文 ----
    const query = await fetchJson(apiUrl, {
      method: 'POST',
      headers: authHeaders(USER, PASS),
      body: JSON.stringify({
        using: [CORE, MAIL],
        methodCalls: [
          ['Email/query', { accountId, sort: [{ property: 'receivedAt', isAscending: false }], limit: 5 }, 'q'],
          [
            'Email/get',
            {
              accountId,
              '#ids': { resultOf: 'q', name: 'Email/query', path: '/ids/*' },
              properties: ['id', 'threadId', 'mailboxIds', 'keywords', 'from', 'to', 'subject', 'receivedAt', 'preview', 'hasAttachment', 'size'],
              fetchTextBodyValues: true,
              maxBodyValueBytes: 2000,
            },
            'e',
          ],
        ],
      }),
    })
    save('email-query-get', query.body)
    preview('Email/query + Email/get', query.body)

    const emails: any[] = (query.body as any)?.methodResponses?.[1]?.[1]?.list ?? []
    console.log(`\n取到 ${emails.length} 封邮件`)
    emails.forEach((e) => console.log(`  ${e.receivedAt}\t${e.from?.[0]?.email ?? '?'}\t${(e.subject ?? '(无主题)').slice(0, 40)}`))

    // ---- 4. Thread 结构（判断能否做会话合并） ----
    if (emails[0]?.threadId) {
      const thread = await fetchJson(apiUrl, {
        method: 'POST',
        headers: authHeaders(USER, PASS),
        body: JSON.stringify({
          using: [CORE, MAIL],
          methodCalls: [['Thread/get', { accountId, ids: [emails[0].threadId] }, 't']],
        }),
      })
      save('thread-get', thread.body)
      preview('Thread/get', thread.body)
    }
  }

  // ---- 5. 管理 API：账号与域 ----
  if (hasStalwart) {
    const admin = await fetchJson(apiUrl, {
      method: 'POST',
      headers: authHeaders(ADMIN_USER, ADMIN_PASS),
      body: JSON.stringify({
        using: [CORE, STALWART],
        methodCalls: [
          ['x:Domain/get', { ids: null }, 'd'],
          ['x:Account/get', { ids: null }, 'a'],
          ['x:Tenant/get', { ids: null }, 't'],
        ],
      }),
    })
    save('x-management-get', admin.body)
    preview('x:Domain/get + x:Account/get + x:Tenant/get', admin.body)

    const responses: any[] = (admin.body as any)?.methodResponses ?? []
    console.log('\n管理 API 结果：')
    responses.forEach((r) => {
      const type = r?.[0]
      const args = r?.[1]
      if (args?.type === 'forbidden' || args?.type === 'unauthorized') {
        console.log(`  ${type} -> ${args.type}（该账号不是管理员，符合预期）`)
        return
      }
      console.log(`  ${type} -> list=${Array.isArray(args?.list) ? args.list.length : 'n/a'} state=${args?.state ?? '-'}`)
      if (Array.isArray(args?.list) && args.list.length > 0) {
        console.log(`    首条字段：${Object.keys(args.list[0]).join(', ')}`)
      }
    })
  } else {
    console.log('\n后端未声明 urn:stalwart:jmap，管理 API 不可用（或该账号非管理员）')
  }

  // ---- 6. Submission 能力（写信提交） ----
  if (hasSubmission) {
    const cap = await fetchJson(apiUrl, {
      method: 'POST',
      headers: authHeaders(USER, PASS),
      body: JSON.stringify({
        using: [CORE, SUBMISSION],
        methodCalls: [['Identity/get', { accountId }, 'i']],
      }),
    })
    save('identity-get', cap.body)
    const identities: any[] = (cap.body as any)?.methodResponses?.[0]?.[1]?.list ?? []
    console.log(`\n发信身份数量：${identities.length}`)
    identities.forEach((i) => console.log(`  ${i.email}\tname=${i.name ?? '-'}\tmaySend=${i.maySend ?? '-'}`))

    // 读取 submission 能力细节，决定前端是否需要显式 session 参数
    preview('submission capability', s.capabilities?.[SUBMISSION])
  }

  console.log('\n探针执行完毕，原始响应已写入 docs/.jmap-raw/')
}

main().catch((err) => {
  console.error('探针失败：', err)
  process.exit(1)
})
