import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import {
  createAccount,
  createDomain,
  destroyAccount,
  listAccounts,
  listDomains,
  setAccountAliases,
  setAccountDescription,
  setAccountPassword,
  setAccountQuota,
  updateDomain,
} from '../jmap/admin'
import type { AccountRecord, DomainRecord } from '../jmap/types'

export const useAdminStore = defineStore('admin', () => {
  const domains = ref<DomainRecord[]>([])
  const accounts = ref<AccountRecord[]>([])
  const loading = ref(false)
  const saving = ref(false)
  const error = ref('')

  const accountCount = computed(() => accounts.value.filter((item) => item['@type'] === 'User').length)
  const totalDiskUsed = computed(() =>
    accounts.value.reduce((sum, item) => sum + (item.usedDiskQuota ?? 0), 0),
  )

  function domainName(domainId: string): string {
    return domains.value.find((item) => item.id === domainId)?.name ?? '未知域'
  }

  async function load(): Promise<void> {
    loading.value = true
    error.value = ''
    try {
      const [domainList, accountList] = await Promise.all([listDomains(), listAccounts()])
      domains.value = domainList
      accounts.value = accountList
    } catch (err) {
      error.value = err instanceof Error ? err.message : '加载管理数据失败'
      console.error('[admin] 加载失败', err)
    } finally {
      loading.value = false
    }
  }

  async function addDomain(name: string): Promise<boolean> {
    saving.value = true
    try {
      await createDomain(name.trim())
      await load()
      return true
    } catch (err) {
      error.value = err instanceof Error ? err.message : '创建域名失败'
      console.error('[admin] 建域失败', err)
      return false
    } finally {
      saving.value = false
    }
  }

  async function toggleDomain(domain: DomainRecord): Promise<void> {
    await updateDomain(domain.id, { enable: !domain.enable })
    await load()
  }

  async function addAccount(input: Parameters<typeof createAccount>[0]): Promise<boolean> {
    saving.value = true
    error.value = ''
    try {
      await createAccount(input)
      await load()
      return true
    } catch (err) {
      error.value = err instanceof Error ? err.message : '创建账号失败'
      console.error('[admin] 建号失败', err)
      return false
    } finally {
      saving.value = false
    }
  }

  async function changePassword(id: string, password: string): Promise<boolean> {
    saving.value = true
    error.value = ''
    try {
      await setAccountPassword(id, password)
      return true
    } catch (err) {
      error.value = err instanceof Error ? err.message : '修改密码失败'
      return false
    } finally {
      saving.value = false
    }
  }

  async function changeQuota(id: string, quotaBytes: number): Promise<void> {
    await setAccountQuota(id, quotaBytes)
    await load()
  }

  async function changeAliases(id: string, names: string[], domainId: string): Promise<void> {
    await setAccountAliases(id, names, domainId)
    await load()
  }

  async function changeDescription(id: string, description: string): Promise<void> {
    await setAccountDescription(id, description)
    await load()
  }

  async function removeAccount(id: string): Promise<void> {
    await destroyAccount(id)
    await load()
  }

  function reset(): void {
    domains.value = []
    accounts.value = []
    error.value = ''
  }

  return {
    domains,
    accounts,
    loading,
    saving,
    error,
    accountCount,
    totalDiskUsed,
    domainName,
    load,
    addDomain,
    toggleDomain,
    addAccount,
    changePassword,
    changeQuota,
    changeAliases,
    changeDescription,
    removeAccount,
    reset,
  }
})
