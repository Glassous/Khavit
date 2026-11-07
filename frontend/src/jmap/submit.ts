import { CORE, MAIL, SUBMISSION, jmap } from './client'
import type { EmailAddress, Id, Identity } from './types'

export async function getIdentities(accountId: Id): Promise<Identity[]> {
  // using 必须带 submission，否则 unknownMethod（实测）
  const res = await jmap.callOne<{ list: Identity[] }>(
    'Identity/get',
    { accountId },
    [CORE, MAIL, SUBMISSION],
  )
  return res.list ?? []
}

export interface OutgoingAttachment {
  blobId: Id
  type: string
  name: string
  size?: number
}

export interface OutgoingEmail {
  from?: EmailAddress[]
  to: EmailAddress[]
  cc?: EmailAddress[]
  bcc?: EmailAddress[]
  subject: string
  text: string
  html?: string
  attachments?: OutgoingAttachment[]
  inReplyTo?: string[]
  references?: string[]
}

function toEmailBody(input: OutgoingEmail): Record<string, unknown> {
  const bodyValues: Record<string, { value: string; charset: string }> = {
    text: { value: input.text || '', charset: 'utf-8' },
  }
  const body: Record<string, unknown> = {
    bodyValues,
    textBody: [{ partId: 'text', type: 'text/plain' }],
  }

  if (input.html && input.html.trim()) {
    bodyValues.html = { value: input.html, charset: 'utf-8' }
    body.htmlBody = [{ partId: 'html', type: 'text/html' }]
  }

  if (input.attachments?.length) {
    body.attachments = input.attachments.map((item) => ({
      blobId: item.blobId,
      type: item.type,
      name: item.name,
      disposition: 'attachment',
    }))
  }

  return body
}

async function createDraft(
  accountId: Id,
  base: Record<string, unknown>,
): Promise<{ id: Id; threadId?: Id }> {
  const res = await jmap.callOne<{
    created?: Record<string, { id: Id; threadId?: Id }>
    notCreated?: Record<string, { type: string; description?: string; properties?: string[] }>
  }>('Email/set', { accountId, create: { draft: base } }, [CORE, MAIL])

  const created = res.created?.draft
  if (!created) {
    const failure = res.notCreated?.draft
    const detail = failure
      ? [failure.type, failure.properties?.join(','), failure.description].filter(Boolean).join(' · ')
      : '未知原因'
    throw new Error(`草稿创建失败：${detail}`)
  }
  return { id: created.id, threadId: created.threadId }
}

/** 创建或更新草稿，返回 emailId */
export async function saveDraft(
  accountId: Id,
  draftsMailboxId: Id,
  input: OutgoingEmail,
  existingDraftId?: Id,
): Promise<{ id: Id; threadId?: Id }> {
  // 注意：Stalwart 对 null 值字段会报 invalidProperties（实测 cc: null 被拒），
  // 所以可选字段一律「不存在」而不是 null
  const base: Record<string, unknown> = {
    mailboxIds: { [draftsMailboxId]: true },
    keywords: { $draft: true, $seen: true },
    to: input.to,
    subject: input.subject || '(无主题)',
    ...toEmailBody(input),
  }

  if (input.from?.length) base.from = input.from
  if (input.cc?.length) base.cc = input.cc
  if (input.bcc?.length) base.bcc = input.bcc
  if (input.inReplyTo?.length) base.inReplyTo = input.inReplyTo
  if (input.references?.length) base.references = input.references

  // JMAP 规定 Email 除 mailboxIds/keywords 外不可变，实测 Stalwart 也拒绝 update 正文
  // （会返回 notUpdated: invalidProperties），所以「编辑草稿」= 新建一封 + 销毁旧的
  if (existingDraftId) {
    const fresh = await createDraft(accountId, base)
    await jmap
      .callOne('Email/set', { accountId, destroy: [existingDraftId] }, [CORE, MAIL])
      .catch((err) => console.error('[submit] 旧草稿清理失败', err))
    return fresh
  }

  return createDraft(accountId, base)
}

export interface SubmitParams {
  emailId: Id
  identityId: Id
  sentMailboxId: Id
  draftsMailboxId: Id
  envelope: { from: string; to: string[] }
}

/** 提交发信：成功后把邮件从草稿箱移到已发送，并去掉 $draft */
export async function submitEmail(accountId: Id, params: SubmitParams): Promise<Id> {
  const res = await jmap.callOne<{
    created?: Record<string, { id: Id }>
    notCreated?: Record<string, { type: string; description?: string }>
  }>(
    'EmailSubmission/set',
    {
      accountId,
      create: {
        submission: {
          emailId: params.emailId,
          identityId: params.identityId,
          envelope: {
            mailFrom: { email: params.envelope.from, parameters: null },
            rcptTo: params.envelope.to.map((email) => ({ email, parameters: null })),
          },
        },
      },
      onSuccessUpdateEmail: {
        '#submission': {
          [`mailboxIds/${params.draftsMailboxId}`]: null,
          [`mailboxIds/${params.sentMailboxId}`]: true,
          'keywords/$draft': null,
          'keywords/$seen': true,
        },
      },
    },
    [CORE, MAIL, SUBMISSION],
  )

  const created = res.created?.submission
  if (!created) {
    const failure = res.notCreated?.submission
    throw new Error(failure?.description ?? failure?.type ?? '发送失败')
  }
  return created.id
}

/** 一键发送：先落草稿再提交，失败时草稿还在，不会丢内容 */
export async function sendEmail(
  accountId: Id,
  params: {
    identity: Identity
    draftsMailboxId: Id
    sentMailboxId: Id
    input: OutgoingEmail
    existingDraftId?: Id
  },
): Promise<{ emailId: Id; submissionId: Id }> {
  const draft = await saveDraft(accountId, params.draftsMailboxId, params.input, params.existingDraftId)

  const recipients = [
    ...params.input.to,
    ...(params.input.cc ?? []),
    ...(params.input.bcc ?? []),
  ]
    .map((item) => item.email)
    .filter(Boolean)

  const submissionId = await submitEmail(accountId, {
    emailId: draft.id,
    identityId: params.identity.id,
    sentMailboxId: params.sentMailboxId,
    draftsMailboxId: params.draftsMailboxId,
    envelope: { from: params.identity.email, to: recipients },
  })

  return { emailId: draft.id, submissionId }
}
