/** 只声明前端实际用到的 JMAP 子集，字段名以实测为准（见 docs/jmap-contract.md） */

export type Id = string

export interface JmapAccount {
  name: string
  isPersonal: boolean
  isReadOnly: boolean
  accountCapabilities: Record<string, unknown>
}

export interface JmapSession {
  apiUrl: string
  uploadUrl: string
  downloadUrl: string
  eventSourceUrl?: string
  username: string
  accounts: Record<Id, JmapAccount>
  primaryAccounts: Record<string, Id>
  capabilities: Record<string, Record<string, unknown> | undefined>
  state?: string
}

export type MethodCall = [name: string, args: Record<string, unknown>, callId: string]

export interface MethodError {
  type: string
  description?: string
  properties?: string[]
}

export type MethodResponse = [name: string, args: Record<string, any>, callId: string]

export interface JmapResponse {
  methodResponses: MethodResponse[]
  sessionState?: string
}

export interface UploadResult {
  accountId: Id
  blobId: Id
  type: string
  size: number
}

export interface MailboxRights {
  mayReadItems: boolean
  mayAddItems: boolean
  mayRemoveItems: boolean
  maySetSeen: boolean
  maySetKeywords: boolean
  mayCreateChild: boolean
  mayRename: boolean
  maySubmit: boolean
  mayDelete: boolean
}

export type MailboxRole = 'inbox' | 'drafts' | 'sent' | 'junk' | 'trash' | 'archive' | string

export interface Mailbox {
  id: Id
  name: string
  parentId: Id | null
  role: MailboxRole | null
  sortOrder: number
  isSubscribed: boolean
  totalEmails: number
  unreadEmails: number
  totalThreads: number
  unreadThreads: number
  myRights: MailboxRights
}

export interface EmailAddress {
  name?: string | null
  email: string
}

export interface BodyPart {
  partId: string | null
  blobId: string | null
  size: number
  name?: string | null
  type: string
  charset?: string | null
  disposition?: string | null
  cid?: string | null
  subParts?: BodyPart[]
}

export interface BodyValue {
  value: string
  isEncodingProblem?: boolean
  isTruncated?: boolean
}

export interface Attachment {
  partId: string
  blobId: Id
  size: number
  name?: string | null
  type: string
  disposition?: string | null
  cid?: string | null
}

export interface Email {
  id: Id
  blobId?: Id
  threadId: Id
  mailboxIds: Record<Id, boolean>
  keywords: Record<string, boolean>
  from?: EmailAddress[] | null
  to?: EmailAddress[] | null
  cc?: EmailAddress[] | null
  bcc?: EmailAddress[] | null
  replyTo?: EmailAddress[] | null
  subject?: string | null
  sentAt?: string | null
  receivedAt?: string | null
  size: number
  preview?: string
  hasAttachment?: boolean
  messageId?: string[] | null
  inReplyTo?: string[] | null
  references?: string[] | null
  bodyStructure?: BodyPart
  bodyValues?: Record<string, BodyValue>
  attachments?: Attachment[]
  htmlBody?: BodyPart[]
  textBody?: BodyPart[]
}

export interface Identity {
  id: Id
  name: string
  email: string
  replyTo?: EmailAddress[] | null
  bcc?: EmailAddress[] | null
  textSignature?: string
  htmlSignature?: string
  mayDelete?: boolean
}

export interface EmailQueryResult {
  accountId: Id
  queryState: string
  canCalculateChanges: boolean
  position: number
  ids: Id[]
  total?: number
}

export interface EmailQueryFilter {
  inMailbox?: Id
  inMailboxOtherThan?: Id[]
  text?: string
  from?: string
  to?: string
  subject?: string
  body?: string
  before?: string
  after?: string
  hasKeyword?: string
  notKeyword?: string
  minSize?: number
  maxSize?: number
}

export interface AddressBookItem {
  name: string
  email: string
}

/* ---------------- 管理 API 对象（urn:stalwart:jmap） ---------------- */

export interface PasswordCredential {
  '@type': 'Password'
  secret: string
  credentialId?: string
  expiresAt?: string | null
  allowedIps?: Record<string, string>
}

export interface EmailAlias {
  enable?: boolean
  name: string
  domainId: Id
  description?: string | null
}

export interface AccountQuotas {
  maxDiskQuota?: number
  maxEmails?: number
  maxMailboxes?: number
  maxEmailSubmissions?: number
  maxSieveScripts?: number
  maxAppPasswords?: number
  maxApiKeys?: number
}

export interface AccountRecord {
  id: Id
  '@type': 'User' | 'Group'
  name: string
  domainId: Id
  emailAddress?: string
  credentials?: Record<string, PasswordCredential>
  roles?: { '@type': 'User' | 'Admin' | 'Custom'; roleIds?: Id[] }
  permissions?: { '@type': string }
  quotas?: AccountQuotas
  aliases?: Record<string, EmailAlias>
  memberGroupIds?: Record<string, Id>
  description?: string | null
  locale?: string
  timeZone?: string | null
  usedDiskQuota?: number
  createdAt?: string
}

export interface DomainRecord {
  id: Id
  name: string
  aliases?: Record<string, string>
  enable: boolean
  description?: string | null
  createdAt?: string
  certificateManagement?: { '@type': 'Manual' | 'Automatic'; acmeProviderId?: Id }
  dkimManagement?: { '@type': 'Manual' | 'Automatic' }
  dnsManagement?: { '@type': 'Manual' | 'Automatic' }
  catchAllAddress?: string | null
  subAddressing?: { '@type': string }
  allowRelaying?: boolean
  reportAddressUri?: string | null
  dnsZoneFile?: string
}
