import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import {
  deleteEmails,
  getEmail,
  listEmails,
  markSeen,
  moveEmails,
  patchEmailKeywords,
  searchEmails,
  toggleStar,
} from '../jmap/mail'
import type { Email, EmailQueryFilter, Mailbox } from '../jmap/types'
import { describeError } from '../utils/i18n'
import { useAuthStore } from './auth'

export type MailFilter = 'all' | 'unread' | 'starred'

const PAGE_SIZE = 50

export const useMailStore = defineStore('mail', () => {
  const auth = useAuthStore()

  const currentMailboxId = ref('')
  const emails = ref<Email[]>([])
  const total = ref(0)
  const position = ref(0)
  const hasMore = ref(false)
  const loading = ref(false)
  const loadingMore = ref(false)
  const error = ref('')

  const selectedId = ref('')
  const selectedEmail = ref<Email | null>(null)
  const loadingEmail = ref(false)

  const filter = ref<MailFilter>('all')
  const searchText = ref('')
  const activeSearch = ref('')

  const currentMailbox = computed<Mailbox | undefined>(() =>
    auth.mailboxes.find((item) => item.id === currentMailboxId.value),
  )

  const unreadInView = computed(() => emails.value.filter((item) => !item.keywords?.$seen).length)
  const selectedSummary = computed(() => emails.value.find((item) => item.id === selectedId.value))

  function buildFilter(): EmailQueryFilter {
    const base: EmailQueryFilter = {}
    if (filter.value === 'unread') base.notKeyword = '$seen'
    if (filter.value === 'starred') base.hasKeyword = '$flagged'
    return base
  }

  async function loadFirstPage(): Promise<void> {
    if (!auth.accountId || !currentMailboxId.value) return
    loading.value = true
    error.value = ''
    try {
      const result = activeSearch.value
        ? await searchEmails(auth.accountId, activeSearch.value, { limit: PAGE_SIZE })
        : await listEmails(auth.accountId, {
            mailboxId: currentMailboxId.value,
            limit: PAGE_SIZE,
            filter: buildFilter(),
          })
      emails.value = result.emails
      total.value = result.total
      position.value = result.position
      hasMore.value = result.hasMore
    } catch (err) {
      error.value = describeError(err, '加载邮件失败')
      console.error('[mail] 加载列表失败', err)
    } finally {
      loading.value = false
    }
  }

  async function loadMore(): Promise<void> {
    if (!auth.accountId || loadingMore.value || !hasMore.value || !currentMailboxId.value) return
    loadingMore.value = true
    try {
      const result = activeSearch.value
        ? await searchEmails(auth.accountId, activeSearch.value, {
            limit: PAGE_SIZE,
            position: position.value,
          })
        : await listEmails(auth.accountId, {
            mailboxId: currentMailboxId.value,
            limit: PAGE_SIZE,
            position: position.value,
            filter: buildFilter(),
          })
      const known = new Set(emails.value.map((item) => item.id))
      emails.value = [...emails.value, ...result.emails.filter((item) => !known.has(item.id))]
      total.value = result.total
      position.value = result.position
      hasMore.value = result.hasMore
    } catch (err) {
      console.error('[mail] 加载更多失败', err)
    } finally {
      loadingMore.value = false
    }
  }

  async function selectMailbox(id: string): Promise<void> {
    if (currentMailboxId.value === id && !activeSearch.value) return
    currentMailboxId.value = id
    activeSearch.value = ''
    searchText.value = ''
    filter.value = 'all'
    selectedId.value = ''
    selectedEmail.value = null
    await loadFirstPage()
  }

  async function setFilter(next: MailFilter): Promise<void> {
    filter.value = next
    await loadFirstPage()
  }

  async function runSearch(text: string): Promise<void> {
    const keyword = text.trim()
    if (!keyword) {
      await clearSearch()
      return
    }
    activeSearch.value = keyword
    await loadFirstPage()
  }

  async function clearSearch(): Promise<void> {
    activeSearch.value = ''
    searchText.value = ''
    await loadFirstPage()
  }

  async function openEmail(id: string): Promise<void> {
    if (!auth.accountId) return
    selectedId.value = id
    loadingEmail.value = true
    selectedEmail.value = null

    try {
      const email = await getEmail(auth.accountId, id)
      selectedEmail.value = email
      if (email && !email.keywords?.$seen) {
        try {
          // 先等服务端确认，再改本地：失败时不能假装已经读过
          await markSeen(auth.accountId, [id], true)
          applyLocalPatch([id], { $seen: true })
        } catch (err) {
          error.value = describeError(err, '标记已读失败')
          console.error('[mail] 标记已读失败', err)
        }
        await auth.refreshMailboxes().catch(() => undefined)
      }
    } catch (err) {
      console.error('[mail] 读取邮件失败', err)
      error.value = describeError(err, '读取邮件失败')
    } finally {
      loadingEmail.value = false
    }
  }

  function closeEmail(): void {
    selectedId.value = ''
    selectedEmail.value = null
  }

  function applyLocalPatch(ids: string[], patch: Record<string, boolean | null>): void {
    const set = new Set(ids)
    emails.value = emails.value.map((item) => {
      if (!set.has(item.id)) return item
      const keywords = { ...(item.keywords ?? {}) }
      Object.entries(patch).forEach(([key, value]) => {
        if (value === true) keywords[key] = true
        else delete keywords[key]
      })
      return { ...item, keywords }
    })
    if (selectedEmail.value && set.has(selectedEmail.value.id)) {
      const keywords = { ...(selectedEmail.value.keywords ?? {}) }
      Object.entries(patch).forEach(([key, value]) => {
        if (value === true) keywords[key] = true
        else delete keywords[key]
      })
      selectedEmail.value = { ...selectedEmail.value, keywords }
    }
  }

  async function setStarred(id: string, starred: boolean): Promise<void> {
    if (!auth.accountId) return
    applyLocalPatch([id], { $flagged: starred })
    try {
      await toggleStar(auth.accountId, [id], starred)
    } catch (err) {
      applyLocalPatch([id], { $flagged: !starred })
      console.error('[mail] 星标失败', err)
    }
  }

  async function toggleRead(id: string, seen: boolean): Promise<void> {
    if (!auth.accountId) return
    applyLocalPatch([id], { $seen: seen })
    try {
      await markSeen(auth.accountId, [id], seen)
    } catch (err) {
      // 服务端没接受就回滚，避免列表显示已读、重新加载又变回未读
      applyLocalPatch([id], { $seen: !seen })
      error.value = describeError(err, '标记已读失败')
      console.error('[mail] 标记已读失败', err)
    }
    await auth.refreshMailboxes().catch(() => undefined)
  }

  async function archive(id: string): Promise<void> {
    if (!auth.accountId) return
    const target = auth.mailboxByRole('archive') ?? auth.mailboxByRole('trash')
    if (!target) return
    emails.value = emails.value.filter((item) => item.id !== id)
    if (selectedId.value === id) closeEmail()
    await moveEmails(auth.accountId, [id], target.id)
    await auth.refreshMailboxes().catch(() => undefined)
  }

  async function remove(id: string): Promise<'moved' | 'destroyed'> {
    if (!auth.accountId) return 'moved'
    const trash = auth.mailboxByRole('trash')
    const action = await deleteEmails(auth.accountId, [id], trash?.id, currentMailboxId.value)
    emails.value = emails.value.filter((item) => item.id !== id)
    if (selectedId.value === id) closeEmail()
    await auth.refreshMailboxes().catch(() => undefined)
    return action
  }

  async function move(id: string, targetMailboxId: string): Promise<void> {
    if (!auth.accountId) return
    await moveEmails(auth.accountId, [id], targetMailboxId)
    emails.value = emails.value.filter((item) => item.id !== id)
    if (selectedId.value === id) closeEmail()
    await auth.refreshMailboxes().catch(() => undefined)
  }

  async function bulkRead(ids: string[], seen: boolean): Promise<void> {
    if (!auth.accountId || ids.length === 0) return
    applyLocalPatch(ids, { $seen: seen })
    try {
      await patchEmailKeywords(auth.accountId, ids, { $seen: seen })
    } catch (err) {
      applyLocalPatch(ids, { $seen: !seen })
      error.value = describeError(err, '批量标记失败')
      console.error('[mail] 批量标记失败', err)
    }
    await auth.refreshMailboxes().catch(() => undefined)
  }

  function moveSelection(delta: number): void {
    if (emails.value.length === 0) return
    const index = emails.value.findIndex((item) => item.id === selectedId.value)
    const next = Math.min(Math.max(index + delta, 0), emails.value.length - 1)
    const target = emails.value[next]
    if (target) void openEmail(target.id)
  }

  function reset(): void {
    emails.value = []
    total.value = 0
    position.value = 0
    hasMore.value = false
    selectedId.value = ''
    selectedEmail.value = null
    activeSearch.value = ''
    searchText.value = ''
    currentMailboxId.value = ''
    filter.value = 'all'
  }

  return {
    currentMailboxId,
    currentMailbox,
    emails,
    total,
    hasMore,
    loading,
    loadingMore,
    error,
    selectedId,
    selectedEmail,
    loadingEmail,
    filter,
    searchText,
    activeSearch,
    unreadInView,
    selectedSummary,
    loadFirstPage,
    loadMore,
    selectMailbox,
    setFilter,
    runSearch,
    clearSearch,
    openEmail,
    closeEmail,
    setStarred,
    toggleRead,
    archive,
    remove,
    move,
    bulkRead,
    moveSelection,
    reset,
  }
})
