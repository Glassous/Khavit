import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { JmapError, jmap } from '../jmap/client'
import { getMailboxes, summarizeUnread } from '../jmap/mail'
import { getIdentities } from '../jmap/submit'
import type { Identity, Mailbox } from '../jmap/types'

export const useAuthStore = defineStore('auth', () => {
  const user = ref('')
  const accountId = ref('')
  const admin = ref(false)
  const mailboxes = ref<Mailbox[]>([])
  const identities = ref<Identity[]>([])
  const bootstrapped = ref(false)
  const loading = ref(false)
  const error = ref('')

  const isLoggedIn = computed(() => Boolean(user.value && accountId.value))
  const displayName = computed(() => user.value.split('@')[0] || user.value)
  const primaryIdentity = computed<Identity | null>(() => identities.value[0] ?? null)
  const inboxUnread = computed(() => summarizeUnread(mailboxes.value).inboxUnread)
  const junkUnread = computed(() => summarizeUnread(mailboxes.value).junkUnread)

  function mailboxByRole(role: string): Mailbox | undefined {
    return mailboxes.value.find((item) => item.role === role)
  }

  async function hydrate(): Promise<void> {
    const id = await jmap.primaryAccountId()
    accountId.value = id
    const session = await jmap.discover()
    user.value = session.username
    admin.value = await jmap.isAdmin()

    const [boxes, ids] = await Promise.all([
      getMailboxes(id).catch((err) => {
        console.error('[auth] 读取邮箱失败', err)
        return [] as Mailbox[]
      }),
      getIdentities(id).catch((err) => {
        console.error('[auth] 读取发信身份失败', err)
        return [] as Identity[]
      }),
    ])
    mailboxes.value = boxes
    identities.value = ids
  }

  /** 页面刷新后尝试用会话里的凭据恢复登录 */
  async function bootstrap(): Promise<boolean> {
    if (bootstrapped.value) return isLoggedIn.value
    bootstrapped.value = true

    if (!jmap.authenticated) return false

    loading.value = true
    error.value = ''
    try {
      await hydrate()
      return true
    } catch (err) {
      if (err instanceof JmapError && err.isAuth) {
        jmap.logout()
      }
      console.error('[auth] 恢复会话失败', err)
      return false
    } finally {
      loading.value = false
    }
  }

  async function login(mail: string, password: string): Promise<boolean> {
    loading.value = true
    error.value = ''
    jmap.setCredentials(mail.trim(), password)
    try {
      await hydrate()
      return true
    } catch (err) {
      const message =
        err instanceof JmapError
          ? err.isAuth
            ? '邮箱地址或密码不正确'
            : err.message
          : '登录失败，请检查服务器连接'
      error.value = message
      jmap.logout()
      return false
    } finally {
      loading.value = false
    }
  }

  async function refreshMailboxes(): Promise<void> {
    if (!accountId.value) return
    mailboxes.value = await getMailboxes(accountId.value)
  }

  function logout(): void {
    jmap.logout()
    user.value = ''
    accountId.value = ''
    admin.value = false
    mailboxes.value = []
    identities.value = []
    bootstrapped.value = false
    error.value = ''
  }

  return {
    user,
    accountId,
    admin,
    mailboxes,
    identities,
    loading,
    error,
    isLoggedIn,
    displayName,
    primaryIdentity,
    inboxUnread,
    junkUnread,
    mailboxByRole,
    bootstrap,
    login,
    logout,
    refreshMailboxes,
  }
})
