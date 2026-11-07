import { beforeEach, describe, expect, it } from 'vitest'
import { download, handle, reset, session, upload } from '../mocks/mockServer'
import { MAILBOX } from '../mocks/mockSeed'
import type { JmapResponse } from '../jmap/types'

const USER = 'demo@khavit.dev'

function first(res: JmapResponse): Record<string, any> {
  return res.methodResponses[0][1]
}

async function call(method: string, args: Record<string, unknown> = {}): Promise<Record<string, any>> {
  return first(await handle(USER, [[method, args, 'c1']]))
}

beforeEach(() => {
  localStorage.clear()
  reset()
})

describe('mock session', () => {
  it('暴露邮件与提交能力，账号 ID 与管理视图一致', () => {
    const s = session(USER)
    expect(s.username).toBe(USER)
    expect(s.primaryAccounts['urn:ietf:params:jmap:mail']).toBe('acc-demo')
    expect(Object.keys(s.accounts['acc-demo'].accountCapabilities)).toContain('urn:stalwart:jmap')
  })
})

describe('mock 邮件流', () => {
  it('文件夹带实时未读数', async () => {
    const res = await call('Mailbox/get', { accountId: 'acc-demo', ids: null })
    const inbox = res.list.find((item: any) => item.role === 'inbox')
    expect(res.list).toHaveLength(7)
    expect(inbox.totalEmails).toBeGreaterThan(0)
    expect(inbox.unreadEmails).toBeGreaterThan(0)
  })

  it('Email/query + Email/get 的 resultOf 引用能串起来', async () => {
    const res = await handle(USER, [
      [
        'Email/query',
        { accountId: 'acc-demo', filter: { inMailbox: MAILBOX.inbox }, limit: 10, calculateTotal: true },
        'q',
      ],
      [
        'Email/get',
        { accountId: 'acc-demo', '#ids': { resultOf: 'q', name: 'Email/query', path: '/ids/*' }, properties: ['id', 'subject'] },
        'g',
      ],
    ])
    const query = res.methodResponses[0][1]
    const list = res.methodResponses[1][1].list
    expect(query.total).toBeGreaterThan(0)
    expect(list).toHaveLength(Math.min(query.total, 10))
    expect(list[0]).toHaveProperty('subject')
    expect(list[0]).not.toHaveProperty('bodyValues')
  })

  it('按关键字搜索能命中正文', async () => {
    const res = await call('Email/query', { accountId: 'acc-demo', filter: { text: '评审' }, calculateTotal: true })
    expect(res.total).toBeGreaterThan(0)
  })

  it('标记已读会降低收件箱未读数', async () => {
    const before = await call('Mailbox/get', {})
    const inboxBefore = before.list.find((item: any) => item.role === 'inbox').unreadEmails

    const unread = await call('Email/query', {
      accountId: 'acc-demo',
      filter: { inMailbox: MAILBOX.inbox, notKeyword: '$seen' },
    })
    await call('Email/set', { accountId: 'acc-demo', update: { [unread.ids[0]]: { $seen: true } } })

    const after = await call('Mailbox/get', {})
    const inboxAfter = after.list.find((item: any) => item.role === 'inbox').unreadEmails
    expect(inboxAfter).toBe(inboxBefore - 1)
  })

  it('发信后草稿从草稿箱移到已发送', async () => {
    const created = await call('Email/set', {
      accountId: 'acc-demo',
      create: {
        draft: {
          mailboxIds: { [MAILBOX.drafts]: true },
          keywords: { $draft: true, $seen: true },
          to: [{ name: '陈亦然', email: 'yiran.chen@khavit.dev' }],
          subject: '测试发送',
          bodyValues: { text: { value: '这是一封测试邮件。' } },
          textBody: [{ partId: 'text', type: 'text/plain' }],
        },
      },
    })
    const emailId = created.created.draft.id as string

    const submission = await call('EmailSubmission/set', {
      accountId: 'acc-demo',
      create: { submission: { emailId, identityId: 'id-1', envelope: { mailFrom: { email: USER }, rcptTo: [] } } },
      onSuccessUpdateEmail: {
        '#submission': {
          [`mailboxIds/${MAILBOX.drafts}`]: null,
          [`mailboxIds/${MAILBOX.sent}`]: true,
          'keywords/$draft': null,
          'keywords/$seen': true,
        },
      },
    })
    expect(submission.created.submission.id).toBeTruthy()

    const email = await call('Email/get', { accountId: 'acc-demo', ids: [emailId], properties: ['mailboxIds', 'keywords', 'sentAt'] })
    const item = email.list[0]
    expect(item.mailboxIds[MAILBOX.sent]).toBe(true)
    expect(item.mailboxIds[MAILBOX.drafts]).toBeUndefined()
    expect(item.keywords.$draft).toBeUndefined()
    expect(item.keywords.$seen).toBe(true)
  })
})

/** jsdom 的 Blob 没有 text()，用 FileReader 读 */
function blobText(blob: Blob): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.readAsText(blob)
  })
}

describe('mock 附件', () => {
  it('上传后能原样下载回来', async () => {
    const file = new File(['本地模拟附件内容'], 'note.txt', { type: 'text/plain' })
    const result = await upload(file, 'acc-demo')
    expect(result.blobId).toBeTruthy()
    expect(result.size).toBe(file.size)

    const blob = await download(result.blobId, 'note.txt', 'text/plain')
    expect(await blobText(blob)).toContain('本地模拟附件内容')
  })

  it('种子邮件的附件可以下载', async () => {
    const blob = await download('m-001-blob-1', '发版说明-v0.9.2.pdf', 'application/pdf')
    expect(blob.size).toBeGreaterThan(0)
    expect(blob.type).toBe('application/pdf')
  })
})

describe('mock 管理流', () => {
  it('建域重名会被拒绝', async () => {
    const res = await call('x:Domain/set', { create: { domain: { name: 'khavit.dev' } } })
    expect(res.created.domain).toBeUndefined()
    expect(res.notCreated.domain.properties).toEqual(['name'])
  })

  it('弱密码建号被拒绝，强密码成功', async () => {
    const weak = await call('x:Account/set', {
      create: { account: { name: 'weak', domainId: 'dom-1', credentials: { 1: { secret: '123' } } } },
    })
    expect(weak.notCreated.account.properties).toEqual(['credentials'])

    const strong = await call('x:Account/set', {
      create: {
        account: { name: 'strong', domainId: 'dom-1', credentials: { 1: { secret: 'a-very-long-password' } } },
      },
    })
    expect(strong.created.account.id).toBeTruthy()

    const list = await call('x:Account/get', { ids: null })
    const added = list.list.find((item: any) => item.name === 'strong')
    expect(added.emailAddress).toBe('strong@khavit.dev')
  })
})
