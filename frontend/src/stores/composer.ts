import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { jmap } from '../jmap/client'
import { saveDraft, sendEmail, type OutgoingAttachment, type OutgoingEmail } from '../jmap/submit'
import type { Email, EmailAddress } from '../jmap/types'
import { formatAddress, formatQuoteTime } from '../utils/format'
import { describeError } from '../utils/i18n'
import { useAuthStore } from './auth'
import { useMailStore } from './mail'
import { useToast } from '../composables/useToast'

export type ComposeMode = 'new' | 'reply' | 'replyAll' | 'forward'

function quoteHtml(email: Email, text: string): string {
  const from = email.from?.[0] ? formatAddress(email.from[0]) : '未知发件人'
  // 引用块里的时间要本地化，不能直接塞 ISO 串（2026-11-07T01:02:03Z）
  const when = formatQuoteTime(email.receivedAt ?? email.sentAt)
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  return `<br><br><div class="postal-quote"><p style="color:#8a93a3;font-size:12px;margin:0 0 6px">${from} 于 ${when} 写道：</p><blockquote style="margin:0;padding-left:12px;border-left:2px solid #e3e7ee">${escaped.replace(/\n/g, '<br>')}</blockquote></div>`
}

export const useComposerStore = defineStore('composer', () => {
  const auth = useAuthStore()
  const mail = useMailStore()
  const toast = useToast()

  const visible = ref(false)
  const expanded = ref(false)
  const mode = ref<ComposeMode>('new')
  const from = ref<EmailAddress | null>(null)
  const to = ref<EmailAddress[]>([])
  const cc = ref<EmailAddress[]>([])
  const bcc = ref<EmailAddress[]>([])
  const showCc = ref(false)
  const subject = ref('')
  const text = ref('')
  const attachments = ref<OutgoingAttachment[]>([])
  const uploading = ref(false)
  const sending = ref(false)
  const draftId = ref<string | undefined>(undefined)
  const autoSaveState = ref<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const lastSavedAt = ref<number>(0)
  const inReplyTo = ref<string[] | undefined>(undefined)
  const references = ref<string[] | undefined>(undefined)

  let saveTimer: ReturnType<typeof setTimeout> | null = null

  const canSend = computed(() => to.value.length > 0 || cc.value.length > 0 || bcc.value.length > 0)
  const title = computed(() => {
    const map: Record<ComposeMode, string> = {
      new: '撰写邮件',
      reply: '回复',
      replyAll: '回复全部',
      forward: '转发',
    }
    return map[mode.value]
  })
  const hasContent = computed(
    () => Boolean(subject.value.trim() || text.value.trim() || to.value.length || attachments.value.length),
  )

  function resetState(): void {
    mode.value = 'new'
    to.value = []
    cc.value = []
    bcc.value = []
    showCc.value = false
    subject.value = ''
    text.value = ''
    attachments.value = []
    draftId.value = undefined
    inReplyTo.value = undefined
    references.value = undefined
    autoSaveState.value = 'idle'
    expanded.value = false
    uploading.value = false
    if (saveTimer) {
      clearTimeout(saveTimer)
      saveTimer = null
    }
  }

  function openNew(): void {
    resetState()
    from.value = auth.primaryIdentity ? { name: auth.primaryIdentity.name, email: auth.primaryIdentity.email } : null
    visible.value = true
  }

  function openReply(email: Email, all = false): void {
    resetState()
    mode.value = all ? 'replyAll' : 'reply'
    const self = auth.user.toLowerCase()
    to.value = (email.replyTo?.length ? email.replyTo : email.from ?? []).filter(
      (item) => item.email.toLowerCase() !== self,
    )
    if (all) {
      const extra = [...(email.to ?? []), ...(email.cc ?? [])].filter(
        (item) => item.email.toLowerCase() !== self && !to.value.some((t) => t.email === item.email),
      )
      cc.value = extra
      showCc.value = extra.length > 0
    }
    subject.value = email.subject?.startsWith('Re:') ? email.subject : `Re: ${email.subject ?? ''}`
    const source = email.bodyValues
      ? Object.values(email.bodyValues)
          .map((item) => item.value)
          .join('\n')
      : (email.preview ?? '')
    text.value = `\n\n${quoteHtml(email, source.slice(0, 4000))}`
    inReplyTo.value = email.messageId ?? undefined
    references.value = [...(email.references ?? []), ...(email.messageId ?? [])]
    from.value = auth.primaryIdentity ? { name: auth.primaryIdentity.name, email: auth.primaryIdentity.email } : null
    visible.value = true
  }

  function openForward(email: Email): void {
    resetState()
    mode.value = 'forward'
    subject.value = email.subject?.startsWith('Fwd:') ? email.subject : `Fwd: ${email.subject ?? ''}`
    const header = [
      '---------- 转发的邮件 ----------',
      `发件人：${email.from?.[0]?.email ?? ''}`,
      `时间：${formatQuoteTime(email.receivedAt ?? email.sentAt)}`,
      `主题：${email.subject ?? ''}`,
      '',
    ].join('\n')
    const body = email.bodyValues ? Object.values(email.bodyValues).map((item) => item.value).join('\n') : ''
    text.value = `\n\n${header}${body.slice(0, 8000)}`
    from.value = auth.primaryIdentity ? { name: auth.primaryIdentity.name, email: auth.primaryIdentity.email } : null
    visible.value = true
  }

  function close(): void {
    if (hasContent.value && autoSaveState.value !== 'saved') {
      void persistDraft()
    }
    visible.value = false
    resetState()
  }

  function scheduleAutoSave(): void {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      void persistDraft()
    }, 1800)
  }

  async function persistDraft(): Promise<void> {
    if (!auth.accountId || !hasContent.value) return
    const drafts = auth.mailboxByRole('drafts')
    if (!drafts) return

    autoSaveState.value = 'saving'
    try {
      const result = await saveDraft(auth.accountId, drafts.id, buildPayload(), draftId.value)
      draftId.value = result.id
      autoSaveState.value = 'saved'
      lastSavedAt.value = Date.now()
    } catch (err) {
      autoSaveState.value = 'error'
      console.error('[composer] 草稿保存失败', err)
    }
  }

  function buildPayload(): OutgoingEmail {
    return {
      from: from.value ? [from.value] : undefined,
      to: to.value,
      cc: cc.value,
      bcc: bcc.value,
      subject: subject.value,
      text: text.value,
      attachments: attachments.value,
      inReplyTo: inReplyTo.value,
      references: references.value,
    }
  }

  async function uploadFiles(files: FileList | File[]): Promise<void> {
    if (!auth.accountId) return
    uploading.value = true
    const list = Array.from(files)
    for (const file of list) {
      try {
        const uploaded = await jmap.upload(file)
        attachments.value = [
          ...attachments.value,
          { blobId: uploaded.blobId, type: uploaded.type || file.type, name: file.name, size: uploaded.size },
        ]
      } catch (err) {
        toast.error('附件上传失败', file.name)
        console.error('[composer] 附件上传失败', err)
      }
    }
    uploading.value = false
    scheduleAutoSave()
  }

  function removeAttachment(blobId: string): void {
    attachments.value = attachments.value.filter((item) => item.blobId !== blobId)
    scheduleAutoSave()
  }

  async function send(): Promise<boolean> {
    if (!auth.accountId || !auth.primaryIdentity) {
      toast.error('缺少发信身份，请先在设置中检查账号')
      return false
    }
    const drafts = auth.mailboxByRole('drafts')
    const sent = auth.mailboxByRole('sent')
    if (!drafts || !sent) {
      toast.error('找不到草稿箱或已发送文件夹')
      return false
    }

    sending.value = true
    if (saveTimer) {
      clearTimeout(saveTimer)
      saveTimer = null
    }

    try {
      await sendEmail(auth.accountId, {
        identity: auth.primaryIdentity,
        draftsMailboxId: drafts.id,
        sentMailboxId: sent.id,
        input: buildPayload(),
        existingDraftId: draftId.value,
      })
      toast.success('邮件已发送')
      visible.value = false
      resetState()
      await Promise.all([auth.refreshMailboxes(), mail.loadFirstPage()])
      return true
    } catch (err) {
      toast.error('发送失败', describeError(err, '邮件没能发出去，请稍后重试'))
      console.error('[composer] 发送失败', err)
      return false
    } finally {
      sending.value = false
    }
  }

  return {
    visible,
    expanded,
    mode,
    title,
    from,
    to,
    cc,
    bcc,
    showCc,
    subject,
    text,
    attachments,
    uploading,
    sending,
    draftId,
    autoSaveState,
    lastSavedAt,
    canSend,
    hasContent,
    openNew,
    openReply,
    openForward,
    close,
    scheduleAutoSave,
    persistDraft,
    uploadFiles,
    removeAttachment,
    send,
  }
})
