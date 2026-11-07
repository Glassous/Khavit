/**
 * 简体中文界面文案基础设施。
 *
 * 两类「英文化」源头集中在这里处理：
 * 1) 服务端返回的文件夹名（Inbox / Sent Items …）与错误码（invalidArguments …）都是英文，
 *    直接展示会让界面中英混杂，所以统一映射成中文；
 * 2) 日期 / 数字一律用固定 locale，避免跟随浏览器语言漂移。
 */

export const LOCALE = 'zh-CN'

const CJK = /[\u4e00-\u9fff]/

/** 文案里是否已经包含中文（用于判断服务端描述要不要再翻译） */
export function isChinese(text?: string | null): boolean {
  return Boolean(text && CJK.test(text))
}

const ROLE_LABELS: Record<string, string> = {
  inbox: '收件箱',
  drafts: '草稿箱',
  sent: '已发送',
  junk: '垃圾邮件',
  trash: '已删除',
  archive: '归档',
  outbox: '发件箱',
  templates: '模板',
  snoozed: '稍后处理',
  important: '重要',
  flagged: '星标',
  all: '全部邮件',
}

const ROLE_ORDER = ['inbox', 'drafts', 'sent', 'junk', 'trash', 'archive']

/** 服务端给的英文文件夹名（没有 role 时）→ 中文 */
const NAME_LABELS: Record<string, string> = {
  inbox: '收件箱',
  sent: '已发送',
  sentitems: '已发送',
  drafts: '草稿箱',
  junk: '垃圾邮件',
  junkmail: '垃圾邮件',
  spam: '垃圾邮件',
  trash: '已删除',
  deleteditems: '已删除',
  deleted: '已删除',
  archive: '归档',
  archives: '归档',
}

/**
 * 文件夹显示名：标准角色用中文，自建文件夹保留用户自己起的名字。
 * 服务端角色名大小写不定，这里统一小写后比对。
 */
export function mailboxLabel(mailbox?: { role?: string | null; name?: string | null } | null): string {
  if (!mailbox) return '收件箱'
  const role = mailbox.role?.trim().toLowerCase()
  if (role && ROLE_LABELS[role]) return ROLE_LABELS[role]
  const name = mailbox.name?.trim()
  if (!name) return '未命名文件夹'
  // 自建文件夹名偶尔也被服务端写成英文标准名（如 "Deleted Items"），一并中文化
  const key = name.toLowerCase().replace(/\s+/g, '')
  return NAME_LABELS[key] ?? ROLE_LABELS[key] ?? name
}

/** 侧栏文件夹排序权重，标准角色靠前，自建文件夹排在后面 */
export function roleOrder(role?: string | null): number {
  const index = ROLE_ORDER.indexOf(role?.trim().toLowerCase() ?? '')
  return index === -1 ? ROLE_ORDER.length : index
}

/** JMAP 标准错误类型 → 中文说明 */
const ERROR_LABELS: Record<string, string> = {
  unauthorized: '登录状态已失效，请重新登录',
  forbidden: '没有权限执行该操作',
  invalidCredentials: '邮箱地址或密码不正确',
  unknownMethod: '服务端不支持该操作',
  unknownCapability: '服务端缺少所需能力，请确认版本',
  invalidArguments: '请求参数不合法',
  invalidProperties: '提交的字段不合法',
  invalidPatch: '提交的字段值不合法',
  invalidResultReference: '请求结果引用无效，请重试',
  accountNotFound: '账号不存在',
  accountNotSupportedByMethod: '该账号不支持此操作',
  accountReadOnly: '账号处于只读状态',
  requestTooLarge: '请求内容过大',
  cannotCalculateChanges: '无法计算变更，请刷新后重试',
  stateMismatch: '数据已更新，请刷新后重试',
  anchorNotFound: '找不到要定位的邮件',
  duplicateRequest: '重复请求，请稍后重试',
  unsupportedFilter: '不支持该筛选条件',
  unsupportedSort: '不支持该排序方式',
  tooManyChanges: '变更过多，请刷新后重试',
  rateLimit: '操作过于频繁，请稍后再试',
  overQuota: '邮箱容量已满',
  tooLarge: '内容超出大小限制',
  notFound: '找不到对应的数据',
  notRequested: '请求的数据不存在',
  blobNotFound: '附件已不存在，可能已被清理',
  serverUnavailable: '邮件服务暂时不可用，请稍后重试',
  serverFail: '邮件服务内部错误',
  serverPartialFail: '部分操作未完成，请刷新确认',
  serverBusy: '邮件服务繁忙，请稍后重试',
  network: '网络连接失败，请检查网络与服务器',
  empty: '服务端没有返回任何结果',
  http: '请求被服务器拒绝',
  upload: '附件上传失败',
  download: '附件下载失败',
  unknown: '邮件服务返回了未知错误',
}

/** 服务端返回的字段名 → 中文，用于「字段：原因」这类提示 */
const FIELD_LABELS: Record<string, string> = {
  name: '账号名',
  domainId: '域名',
  credentials: '密码',
  quotas: '容量配额',
  aliases: '别名',
  description: '备注',
  locale: '语言',
  timeZone: '时区',
  subject: '主题',
  to: '收件人',
  cc: '抄送',
  bcc: '密送',
  from: '发件人',
  textBody: '正文',
  htmlBody: '正文',
  mailboxIds: '所在文件夹',
  keywords: '标记',
  attachments: '附件',
  emailId: '邮件',
  identityId: '发信身份',
  envelope: '信封',
}

export function fieldLabel(field?: string | null, fallback = '字段'): string {
  const key = field?.trim() ?? ''
  return FIELD_LABELS[key] ?? (isChinese(key) ? key : fallback)
}

/** 错误类型对应的中文说明，没有登记的类型返回 undefined */
export function errorLabelFor(type?: string | null): string | undefined {
  return type ? ERROR_LABELS[type] : undefined
}

/**
 * 把 JMAP 方法错误（type + description）转成一句中文。
 * 服务端描述若本身就是中文则原样保留，只有英文码才替换。
 */
export function translateFailure(type?: string | null, description?: string | null): string {
  // 描述本身是中文（服务端已本地化）时更具体，优先用它
  if (isChinese(description)) return description!.trim()
  const label = errorLabelFor(type)
  if (label) return label
  if (type && isChinese(type)) return type.trim()
  return '操作失败，请稍后重试'
}

/** 浏览器 / fetch 抛出的英文错误 → 中文提示 */
function translateThrown(message: string): string {
  const text = message.toLowerCase()
  if (/failed to fetch|networkerror|load failed|network request failed/.test(text)) {
    return '网络连接失败，请检查网络与服务器'
  }
  if (/abort|timeout|timed out/.test(text)) return '请求超时，请重试'
  if (/quota|storage full/.test(text)) return '邮箱容量已满'
  return ''
}

/**
 * 统一的错误提示入口：JmapError、普通 Error、字符串都能吃。
 * 任何情况下都返回中文，避免把 `TypeError: Failed to fetch` 直接甩给用户。
 */
export function describeError(err: unknown, fallback = '操作失败，请稍后重试'): string {
  if (!err) return fallback

  if (typeof err === 'string') {
    if (isChinese(err)) return err
    return translateThrown(err) || fallback
  }

  if (err instanceof Error) {
    const anyErr = err as Error & { type?: string; description?: string }
    // JmapError：优先用错误类型判断
    const label = errorLabelFor(anyErr.type)
    if (label) return label
    if (isChinese(anyErr.message)) return anyErr.message.trim()
    const translated = translateThrown(anyErr.message)
    if (translated) return translated
    if (anyErr.description && isChinese(anyErr.description)) return anyErr.description.trim()
    return fallback
  }

  return fallback
}

/** 数量本地化：1234 → 1,234 */
export function formatNumber(value: number): string {
  return new Intl.NumberFormat(LOCALE).format(value)
}
