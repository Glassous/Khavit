/**
 * 本地开发的演示数据。
 *
 * 只在 `import.meta.env.DEV` 下通过动态 import 载入，生产构建不会包含此文件
 * （见 src/jmap/client.ts 里的 MOCK_ENABLED 判断）。
 */
import type { AccountRecord, Attachment, DomainRecord, Email, EmailAddress, Mailbox, MailboxRights } from '../jmap/types'

const MINUTE = 60_000
const GB = 1024 ** 3

export const MAILBOX = {
  inbox: 'mb-inbox',
  drafts: 'mb-drafts',
  sent: 'mb-sent',
  junk: 'mb-junk',
  trash: 'mb-trash',
  archive: 'mb-archive',
  projects: 'mb-projects',
} as const

export const ACCOUNT_ID = 'acc-demo'

const RIGHTS: MailboxRights = {
  mayReadItems: true,
  mayAddItems: true,
  mayRemoveItems: true,
  maySetSeen: true,
  maySetKeywords: true,
  mayCreateChild: true,
  mayRename: true,
  maySubmit: true,
  mayDelete: true,
}

function mailbox(
  id: string,
  name: string,
  role: string | null,
  sortOrder: number,
): Mailbox {
  return {
    id,
    name,
    parentId: null,
    role,
    sortOrder,
    isSubscribed: true,
    totalEmails: 0,
    unreadEmails: 0,
    totalThreads: 0,
    unreadThreads: 0,
    myRights: RIGHTS,
  }
}

export interface MockState {
  version: number
  currentUser: string
  mailboxes: Mailbox[]
  emails: Email[]
  domains: DomainRecord[]
  accounts: AccountRecord[]
  blobs: Record<string, { name: string; type: string; size: number; text?: string }>
  seq: number
}

function ago(minutes: number): string {
  return new Date(Date.now() - minutes * MINUTE).toISOString()
}

interface SeedInput {
  id: string
  box: string
  from: [name: string, email: string]
  to?: [name: string, email: string][]
  cc?: [name: string, email: string][]
  subject: string
  text: string
  html?: string
  minutesAgo: number
  unread?: boolean
  starred?: boolean
  draft?: boolean
  attachments?: [name: string, type: string, size: number][]
  threadId?: string
}

function address([name, email]: [string, string]): EmailAddress {
  return { name, email }
}

function previewOf(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, 140)
}

function seedMail(input: SeedInput, me: EmailAddress): Email {
  const to = (input.to ?? [[me.name ?? '', me.email]]).map(address)
  const cc = (input.cc ?? []).map(address)
  const attachments: Attachment[] = (input.attachments ?? []).map(([name, type, size], index) => ({
    partId: `att-${index + 1}`,
    blobId: `${input.id}-blob-${index + 1}`,
    size,
    name,
    type,
    disposition: 'attachment',
  }))

  const bodyValues: Record<string, { value: string }> = { text: { value: input.text } }
  const htmlBody: NonNullable<Email['htmlBody']> = []
  if (input.html) {
    bodyValues.html = { value: input.html }
    htmlBody.push({ partId: 'html', blobId: null, size: input.html.length, type: 'text/html' })
  }

  const keywords: Record<string, boolean> = {}
  if (!input.unread) keywords.$seen = true
  if (input.starred) keywords.$flagged = true
  if (input.draft) {
    keywords.$draft = true
    keywords.$seen = true
  }

  const when = ago(input.minutesAgo)

  return {
    id: input.id,
    threadId: input.threadId ?? `th-${input.id}`,
    mailboxIds: { [input.box]: true },
    keywords,
    from: [address(input.from)],
    to,
    cc: cc.length > 0 ? cc : undefined,
    subject: input.subject,
    receivedAt: when,
    sentAt: when,
    size: input.text.length + (input.html?.length ?? 0) + attachments.reduce((sum, item) => sum + item.size, 0),
    preview: previewOf(input.text),
    hasAttachment: attachments.length > 0,
    messageId: [`<${input.id}@khavit.dev>`],
    bodyStructure: {
      partId: 'root',
      blobId: null,
      size: input.text.length,
      type: 'multipart/alternative',
      subParts: [
        { partId: 'text', blobId: null, size: input.text.length, type: 'text/plain' },
        ...(input.html
          ? [{ partId: 'html', blobId: null, size: input.html.length, type: 'text/html' }]
          : []),
      ],
    },
    bodyValues,
    textBody: [{ partId: 'text', blobId: null, size: input.text.length, type: 'text/plain' }],
    htmlBody: htmlBody.length > 0 ? htmlBody : undefined,
    attachments: attachments.length > 0 ? attachments : undefined,
  }
}

/**
 * 带 HTML 正文的富文本示例（表格 + 强调 + 链接）。
 * 不写死文字颜色：正文 iframe 会跟随明暗主题，硬编码深色在暗色模式下会看不见。
 */
const RELEASE_HTML = `<div style="font-family:inherit;font-size:14px;line-height:1.75">
  <p>你好，</p>
  <p>本周的构建已经全部通过，下面是本次发版的要点：</p>
  <ul style="padding-left:20px;margin:12px 0">
    <li>JMAP 会话恢复不再依赖 <code>apiUrl</code> 的绝对地址</li>
    <li>附件下载改走认证代理，避免直链泄露</li>
    <li>移动端列表滚动位置在返回时保留</li>
  </ul>
  <table style="border-collapse:collapse;margin:14px 0;font-size:13px">
    <thead>
      <tr>
        <th style="text-align:left;padding:6px 14px 6px 0;border-bottom:1px solid rgba(128,128,128,.4)">模块</th>
        <th style="text-align:left;padding:6px 14px 6px 0;border-bottom:1px solid rgba(128,128,128,.4)">状态</th>
      </tr>
    </thead>
    <tbody>
      <tr><td style="padding:6px 14px 6px 0">邮件列表</td><td style="padding:6px 14px 6px 0">已发布</td></tr>
      <tr><td style="padding:6px 14px 6px 0">写信与草稿</td><td style="padding:6px 14px 6px 0">已发布</td></tr>
      <tr><td style="padding:6px 14px 6px 0">管理后台</td><td style="padding:6px 14px 6px 0">灰度中</td></tr>
    </tbody>
  </table>
  <p>有问题直接回复这封邮件即可。</p>
  <p style="opacity:.62;font-size:12.5px;margin-top:18px">—— 邮局团队</p>
</div>`

const INVOICE_HTML = `<div style="font-family:inherit;font-size:14px;line-height:1.75">
  <p>你好，</p>
  <p><strong>2026 年 11 月的服务费账单已生成</strong>，合计 <strong>¥ 128.00</strong>，将于 11 月 10 日从尾号 4821 的银行卡自动扣款。</p>
  <p style="margin:16px 0">
    <a href="https://example.com/billing" style="display:inline-block;padding:8px 16px;border-radius:8px;background:#2F5BEA;color:#fff;text-decoration:none;font-size:13px">查看账单明细</a>
  </p>
  <p style="opacity:.62;font-size:12.5px">如已付款请忽略这封邮件。发票可在控制台「账单」页下载。</p>
</div>`

export function createSeed(username: string): MockState {
  const [localPart, domain] = username.split('@')
  const me: EmailAddress = { name: localPart || '我', email: username }

  const domains: DomainRecord[] = [
    {
      id: 'dom-1',
      name: domain || 'khavit.dev',
      aliases: {},
      enable: true,
      description: '主域名',
      createdAt: ago(60 * 24 * 120),
      certificateManagement: { '@type': 'Automatic' },
      dkimManagement: { '@type': 'Automatic' },
      dnsManagement: { '@type': 'Manual' },
      catchAllAddress: null,
      allowRelaying: false,
    },
    {
      id: 'dom-2',
      name: 'khavit.local',
      aliases: {},
      enable: false,
      description: '测试域名（已停用）',
      createdAt: ago(60 * 24 * 30),
      certificateManagement: { '@type': 'Manual' },
      dkimManagement: { '@type': 'Manual' },
      dnsManagement: { '@type': 'Manual' },
      catchAllAddress: 'catch@khavit.local',
      allowRelaying: false,
    },
  ]

  const accounts: AccountRecord[] = [
    {
      id: ACCOUNT_ID,
      '@type': 'User',
      name: localPart || 'demo',
      domainId: 'dom-1',
      emailAddress: username,
      roles: { '@type': 'Admin' },
      quotas: { maxDiskQuota: 5 * GB, maxEmails: 50_000, maxMailboxes: 50 },
      aliases: {
        1: { enable: true, name: 'hi', domainId: 'dom-1', description: '对外联系' },
        2: { enable: true, name: 'billing', domainId: 'dom-1', description: '账单专用' },
      },
      description: '本地演示账号',
      locale: 'zh-CN',
      timeZone: 'Asia/Shanghai',
      usedDiskQuota: 1.4 * GB,
      createdAt: ago(60 * 24 * 120),
    },
    {
      id: 'acc-team',
      '@type': 'User',
      name: 'team',
      domainId: 'dom-1',
      emailAddress: `team@${domain || 'khavit.dev'}`,
      roles: { '@type': 'User' },
      quotas: { maxDiskQuota: 2 * GB },
      aliases: {},
      description: '共享邮箱',
      locale: 'zh-CN',
      timeZone: 'Asia/Shanghai',
      usedDiskQuota: 0.42 * GB,
      createdAt: ago(60 * 24 * 60),
    },
    {
      id: 'acc-sales',
      '@type': 'User',
      name: 'sales',
      domainId: 'dom-2',
      emailAddress: 'sales@khavit.local',
      roles: { '@type': 'User' },
      quotas: { maxDiskQuota: 1 * GB },
      aliases: {},
      description: null,
      locale: 'zh-CN',
      timeZone: 'Asia/Shanghai',
      usedDiskQuota: 0,
      createdAt: ago(60 * 24 * 20),
    },
  ]

  const emails: Email[] = [
    seedMail(
      {
        id: 'm-001',
        box: MAILBOX.inbox,
        from: ['邮局团队', 'noreply@khavit.dev'],
        subject: 'v0.9.2 发版说明：附件下载与移动端修复',
        text: `你好，

本周的构建已经全部通过，下面是本次发版的要点：

- JMAP 会话恢复不再依赖 apiUrl 的绝对地址
- 附件下载改走认证代理，避免直链泄露
- 移动端列表滚动位置在返回时保留

有问题直接回复这封邮件即可。

—— 邮局团队`,
        html: RELEASE_HTML,
        minutesAgo: 12,
        unread: true,
        attachments: [['发版说明-v0.9.2.pdf', 'application/pdf', 486_912]],
      },
      me,
    ),
    seedMail(
      {
        id: 'm-002',
        box: MAILBOX.inbox,
        from: ['陈亦然', 'yiran.chen@khavit.dev'],
        subject: '关于周三评审会的三点补充',
        text: `刚开完会，补充三点：

1. 邮件列表的密度切换建议默认「舒适」，设置里保留切换入口；
2. 附件预览先只做图片与 PDF，其它类型走下载；
3. 管理后台的账号删除需要二次确认，避免误操作。

评审材料我放在共享盘了，周三上午我们过一遍。`,
        minutesAgo: 95,
        unread: true,
        starred: true,
      },
      me,
    ),
    seedMail(
      {
        id: 'm-003',
        box: MAILBOX.inbox,
        from: ['Stalwart 通知', 'notify@stalwart.dev'],
        subject: '你的域名 DKIM 密钥已轮换',
        text: `系统已于今天凌晨完成 DKIM 密钥轮换。

旧的 selector 会保留 7 天，请在这段时间内更新 DNS 记录。如果使用自动 DNS 管理，无需任何操作。

—— Stalwart`,
        minutesAgo: 60 * 6,
        attachments: [['dkim-public-key.txt', 'text/plain', 1_284]],
      },
      me,
    ),
    seedMail(
      {
        id: 'm-004',
        box: MAILBOX.inbox,
        from: ['林知遥', 'zhiyao@example.com'],
        subject: '周末爬山？',
        text: `这周六天气不错，打算去西山走一圈，早上七点半地铁口集合。

你上次说的那双徒步鞋可以带上了，路有一段碎石。`,
        minutesAgo: 60 * 20,
      },
      me,
    ),
    seedMail(
      {
        id: 'm-005',
        box: MAILBOX.inbox,
        from: ['账单中心', 'billing@example.com'],
        subject: '2026 年 11 月服务费账单',
        text: `你好，

2026 年 11 月的服务费账单已生成，合计 ¥ 128.00，将于 11 月 10 日从尾号 4821 的银行卡自动扣款。

如已付款请忽略这封邮件。`,
        html: INVOICE_HTML,
        minutesAgo: 60 * 26,
        starred: true,
        attachments: [['invoice-2026-11.pdf', 'application/pdf', 128_400]],
      },
      me,
    ),
    seedMail(
      {
        id: 'm-006',
        box: MAILBOX.inbox,
        from: ['周敏', 'min.zhou@khavit.dev'],
        subject: '回复：邮件正文里的中文排版',
        text: `中英混排的时候，英文与数字两侧留半个字的空间会舒服很多，Tailwind 的 tracking-tight 在标题上效果不错。

另外正文的行高我调到 1.72 了，长段落读起来不那么挤。`,
        minutesAgo: 60 * 30,
        unread: true,
      },
      me,
    ),
    seedMail(
      {
        id: 'm-007',
        box: MAILBOX.inbox,
        from: ['GitHub', 'noreply@github.com'],
        subject: '[khavit/mail] 3 个新的 Pull Request',
        text: `仓库 khavit/mail 有 3 个新的 Pull Request 等待评审：

#128 修复列表滚动位置丢失
#129 给附件列表加上文件大小
#130 统一错误提示的文案

查看全部：https://github.com/khavit/mail/pulls`,
        minutesAgo: 60 * 46,
      },
      me,
    ),
    seedMail(
      {
        id: 'm-008',
        box: MAILBOX.inbox,
        from: ['安全中心', 'security@example.com'],
        subject: '新设备登录提醒',
        text: `你的账号于 2026-11-06 22:41 在一台新设备（Chrome · Windows）上登录。

如果这不是你本人，请立即修改密码并退出所有设备。`,
        minutesAgo: 60 * 52,
      },
      me,
    ),
    seedMail(
      {
        id: 'm-009',
        box: MAILBOX.inbox,
        from: ['许清和', 'qinghe@khavit.dev'],
        subject: '设计稿 v3 已上传',
        text: `第三版设计稿上传了，主要调整了设置页的信息层级，账号与配额放在同一张卡片里。

麻烦看下空状态和加载骨架的节奏，我觉得还可以再轻一点。`,
        minutesAgo: 60 * 74,
        attachments: [
          ['settings-v3.png', 'image/png', 1_048_576],
          ['空状态说明.pdf', 'application/pdf', 320_512],
        ],
      },
      me,
    ),
    seedMail(
      {
        id: 'm-010',
        box: MAILBOX.inbox,
        from: ['电子发票', 'invoice@example.com'],
        subject: '你的电子发票已开具',
        text: `订单 K20261105008 的电子发票已开具，共计 ¥ 268.00。

发票可在附件中下载，也可以在订单详情页查看。`,
        minutesAgo: 60 * 90,
        attachments: [['invoice-K20261105008.pdf', 'application/pdf', 96_256]],
      },
      me,
    ),
    seedMail(
      {
        id: 'm-011',
        box: MAILBOX.inbox,
        from: ['系统通知', 'postmaster@khavit.dev'],
        subject: '邮箱容量使用提醒：已用 42%',
        text: `你当前已使用 2.1 GB / 5 GB。

占用最多的是「已发送」与「归档」两个文件夹。建议清理一年前的附件，或者调整配额。`,
        minutesAgo: 60 * 120,
      },
      me,
    ),
    seedMail(
      {
        id: 'm-012',
        box: MAILBOX.inbox,
        from: ['订阅周报', 'weekly@example.com'],
        subject: '本周值得一读的 5 篇文章',
        text: `1. 自托管邮件的十年：从 Dovecot 到 JMAP
2. 为什么你的 CSS 断点应该按内容定
3. 用 RocksDB 做单机存储的取舍
4. 反垃圾邮件的现实与理想
5. 一个人维护一台服务器`,
        minutesAgo: 60 * 168,
      },
      me,
    ),
    seedMail(
      {
        id: 'm-013',
        box: MAILBOX.inbox,
        from: ['苏木', 'sumu@khavit.dev'],
        subject: '把 mail.example.com 的证书续上',
        text: `证书还有 12 天到期，ACME 自动续期昨晚跑失败了，日志里是 DNS 校验超时。

今天下班前我会手动续一次，之后再看下 cron。`,
        minutesAgo: 60 * 200,
      },
      me,
    ),
    seedMail(
      {
        id: 'm-014',
        box: MAILBOX.sent,
        from: [localPart || '我', username],
        to: [['陈亦然', 'yiran.chen@khavit.dev']],
        subject: '回复：关于周三评审会的三点补充',
        text: `三点都同意。

第一点我今晚就把默认值改掉，第二点图片和 PDF 的预览我拉一个分支试试，第三点二次确认弹窗已经有了，稍后一起走查。`,
        minutesAgo: 60 * 3,
      },
      me,
    ),
    seedMail(
      {
        id: 'm-015',
        box: MAILBOX.sent,
        from: [localPart || '我', username],
        to: [['周敏', 'min.zhou@khavit.dev']],
        cc: [['许清和', 'qinghe@khavit.dev']],
        subject: '邮件列表的密度方案',
        text: `两种密度我都做了：

- 舒适：列表项高度 76px，摘要两行
- 紧凑：列表项高度 60px，摘要一行

设置里默认跟随系统，手动切换后记住选择。`,
        minutesAgo: 60 * 27,
      },
      me,
    ),
    seedMail(
      {
        id: 'm-016',
        box: MAILBOX.sent,
        from: [localPart || '我', username],
        to: [['林知遥', 'zhiyao@example.com']],
        subject: 'Re: 周末爬山？',
        text: `可以，我七点二十到地铁口，路上买点面包。

防风的薄外套也带上，山上风大。`,
        minutesAgo: 60 * 19,
      },
      me,
    ),
    seedMail(
      {
        id: 'm-017',
        box: MAILBOX.drafts,
        from: [localPart || '我', username],
        to: [['苏木', 'sumu@khavit.dev']],
        subject: '证书续期的检查清单',
        text: `列一下要确认的几件事：

1. ACME 账号是否还在有效期
2. DNS 校验的超时时间要不要调到 120 秒
3. 续期成功后自动 reload nginx`,
        minutesAgo: 40,
        draft: true,
      },
      me,
    ),
    seedMail(
      {
        id: 'm-018',
        box: MAILBOX.junk,
        from: ['中奖通知', 'winner@spam-example.top'],
        subject: '恭喜你获得 iPhone 一台，点击领取',
        text: `尊敬的用户，你的邮箱被抽中为幸运用户，请点击下方链接填写收货地址，领取 iPhone 一台。

（这是一封模拟的垃圾邮件）`,
        minutesAgo: 60 * 33,
        unread: true,
      },
      me,
    ),
    seedMail(
      {
        id: 'm-019',
        box: MAILBOX.junk,
        from: ['发票代开', 'fapiao@spam-example.top'],
        subject: '正规发票代开，税点优惠',
        text: `各类发票均可代开，手续简便。

（这是一封模拟的垃圾邮件）`,
        minutesAgo: 60 * 71,
        unread: true,
      },
      me,
    ),
    seedMail(
      {
        id: 'm-020',
        box: MAILBOX.archive,
        from: ['旧同事 王舟', 'wangzhou@example.com'],
        subject: '上季度的复盘纪要',
        text: `把上季度复盘的纪要发你一份存档。

重点结论：邮件客户端的核心是「快」，任何一次多余的网络往返都会毁掉体验。`,
        minutesAgo: 60 * 24 * 22,
        attachments: [['复盘纪要-2026Q3.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 148_000]],
      },
      me,
    ),
    seedMail(
      {
        id: 'm-021',
        box: MAILBOX.archive,
        from: ['域名注册商', 'service@example.com'],
        subject: '域名续费成功',
        text: `khavit.dev 已续费 1 年，有效期至 2027-11-05。

自动续费保持开启，扣款方式为账户余额。`,
        minutesAgo: 60 * 24 * 35,
      },
      me,
    ),
    seedMail(
      {
        id: 'm-022',
        box: MAILBOX.trash,
        from: ['推广信息', 'promo@example.com'],
        subject: '双十一云服务器 2 折起',
        text: `限时三天，云服务器 2 折起，新用户另有代金券。

（这是一封模拟的推广邮件）`,
        minutesAgo: 60 * 24 * 4,
      },
      me,
    ),
    seedMail(
      {
        id: 'm-023',
        box: MAILBOX.projects,
        from: ['陈亦然', 'yiran.chen@khavit.dev'],
        subject: 'Khavit 项目：里程碑 M2 验收',
        text: `M2 的验收清单已经全部勾完，剩下两处小的 UI 问题：

- 附件列表在窄屏下换行对不齐
- 管理后台的空格输入没有被 trim

下周进入 M3。`,
        minutesAgo: 60 * 48,
        starred: true,
      },
      me,
    ),
    seedMail(
      {
        id: 'm-024',
        box: MAILBOX.projects,
        from: ['许清和', 'qinghe@khavit.dev'],
        subject: 'Khavit 项目：图标规范',
        text: `图标统一用 lucide，尺寸只有 14 / 16 / 20 三档，描边 1.5。

线框图和真实界面的密度要一致，不然评审时很容易跑偏。`,
        minutesAgo: 60 * 24 * 6,
      },
      me,
    ),
  ]

  const mailboxes: Mailbox[] = [
    mailbox(MAILBOX.inbox, 'Inbox', 'inbox', 1),
    mailbox(MAILBOX.drafts, 'Drafts', 'drafts', 2),
    mailbox(MAILBOX.sent, 'Sent', 'sent', 3),
    mailbox(MAILBOX.junk, 'Junk', 'junk', 4),
    mailbox(MAILBOX.trash, 'Trash', 'trash', 5),
    mailbox(MAILBOX.archive, 'Archive', 'archive', 6),
    mailbox(MAILBOX.projects, '项目', null, 7),
  ]

  const blobs: MockState['blobs'] = {}
  emails.forEach((email) => {
    email.attachments?.forEach((item) => {
      if (item.blobId && item.name) {
        blobs[item.blobId] = { name: item.name, type: item.type, size: item.size }
      }
    })
  })

  return {
    version: 1,
    currentUser: username,
    mailboxes,
    emails,
    domains,
    accounts,
    blobs,
    seq: 100,
  }
}
