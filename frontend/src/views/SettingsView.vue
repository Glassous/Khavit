<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  HardDrive,
  ImageOff,
  KeyRound,
  Loader2,
  LogOut,
  Monitor,
  Moon,
  Sun,
  Trash2,
  UserRound,
} from 'lucide-vue-next'
import AppButton from '../components/ui/AppButton.vue'
import AppInput from '../components/ui/AppInput.vue'
import AppSwitch from '../components/ui/AppSwitch.vue'
import AppBadge from '../components/ui/AppBadge.vue'
import { useAuthStore } from '../stores/auth'
import { useMailStore } from '../stores/mail'
import { useTheme } from '../composables/useTheme'
import { useDensity } from '../composables/useDensity'
import { useConfirm } from '../composables/useConfirm'
import { useToast } from '../composables/useToast'
import { getAccountById, listDomains, setAccountPassword } from '../jmap/admin'
import { formatBytes } from '../utils/format'
import { describeError } from '../utils/i18n'
import { readAllowedImageSenders } from '../utils/storage'
import type { AccountRecord, DomainRecord } from '../jmap/types'

const auth = useAuthStore()
const mail = useMailStore()
const router = useRouter()
const { mode, setMode } = useTheme()
const { compact, setCompact } = useDensity()
const { confirm } = useConfirm()
const toast = useToast()

const account = ref<AccountRecord | null>(null)
const domains = ref<DomainRecord[]>([])
const loadingAccount = ref(false)
const password = ref('')
const confirmPassword = ref('')
const savingPassword = ref(false)
const allowedSenders = ref<string[]>(readAllowedImageSenders())
const loadError = ref('')

const quotaBytes = computed(() => account.value?.quotas?.maxDiskQuota ?? 0)
const usedBytes = computed(() => account.value?.usedDiskQuota ?? 0)
const usedPercent = computed(() => {
  if (!quotaBytes.value) return 0
  return Math.min(100, Math.round((usedBytes.value / quotaBytes.value) * 100))
})

const passwordError = computed(() => {
  if (!password.value) return ''
  if (password.value.length < 12) return '至少 12 位，建议用多词短语，服务端会做强度校验'
  if (confirmPassword.value && password.value !== confirmPassword.value) return '两次输入不一致'
  return ''
})

const aliases = computed(() => {
  const fallbackDomain = auth.user.split('@')[1] ?? ''
  return Object.values(account.value?.aliases ?? {}).map((alias) => {
    const name = alias.name?.trim() ?? ''
    // 服务端只存「@ 前面的部分 + domainId」，这里补回完整地址
    const domain = domains.value.find((item) => item.id === alias.domainId)?.name ?? fallbackDomain
    return {
      name,
      email: name.includes('@') || !domain ? name : `${name}@${domain}`,
    }
  })
})

onMounted(async () => {
  if (!auth.admin) return
  loadingAccount.value = true
  try {
    const [record, domainList] = await Promise.all([
      getAccountById(auth.accountId),
      listDomains().catch(() => [] as DomainRecord[]),
    ])
    account.value = record
    domains.value = domainList
  } catch (err) {
    loadError.value = describeError(err, '读取账号信息失败，可能是权限不足')
    console.error('[settings] 读取账号失败', err)
  } finally {
    loadingAccount.value = false
  }
})

async function changePassword(): Promise<void> {
  if (!password.value || passwordError.value) return
  savingPassword.value = true
  try {
    await setAccountPassword(auth.accountId, password.value)
    password.value = ''
    confirmPassword.value = ''
    toast.success('密码已更新', '下次登录请使用新密码')
  } catch (err) {
    toast.error('修改密码失败', describeError(err, '修改失败，请稍后重试'))
  } finally {
    savingPassword.value = false
  }
}

function toggleDensity(value: boolean): void {
  setCompact(value)
  toast.info(value ? '已切换为紧凑列表' : '已切换为舒适列表')
}

function clearAllowedSenders(): void {
  localStorage.removeItem('postal.remoteImages.v1')
  allowedSenders.value = []
  toast.success('已清空放行名单')
}

/** 退出登录：清掉本标签页的会话与邮件缓存，回到登录页 */
async function logout(): Promise<void> {
  const ok = await confirm({
    title: '退出登录？',
    description: '会话凭据会从本标签页清除，草稿保存在服务器上不会丢失。',
    confirmLabel: '退出',
    tone: 'danger',
  })
  if (!ok) return

  auth.logout()
  mail.reset()
  await router.replace('/login')
}
</script>

<template>
  <div class="min-h-0 flex-1 overflow-y-auto scroll-slim max-lg:pt-[var(--topbar-safe)]">
    <div class="mx-auto w-full max-w-[760px] px-4 py-5 sm:px-6">
        <!-- 账号 -->
        <section class="mb-4 rounded-[14px] border border-line bg-surface p-5">
          <div class="flex items-start gap-3">
            <span class="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-ghost text-brand">
              <UserRound class="h-5 w-5" />
            </span>
            <div class="min-w-0 flex-1">
              <h2 class="text-[14px] font-semibold text-ink">账号</h2>
              <p class="mt-0.5 break-all text-[12.5px] text-ink-3">{{ auth.user }}</p>

              <div class="mt-2 flex flex-wrap items-center gap-2">
                <AppBadge :tone="auth.admin ? 'brand' : 'neutral'">
                  {{ auth.admin ? '管理员' : '普通账号' }}
                </AppBadge>
                <AppBadge v-if="account?.description" tone="neutral">{{ account.description }}</AppBadge>
              </div>

              <div v-if="loadingAccount" class="mt-3 flex items-center gap-2 text-[12px] text-ink-3">
                <Loader2 class="h-3.5 w-3.5 animate-spin" /> 正在读取容量…
              </div>

              <div v-else-if="quotaBytes > 0" class="mt-3">
                <div class="flex items-center justify-between text-[11.5px] text-ink-3">
                  <span class="flex items-center gap-1.5"><HardDrive class="h-3.5 w-3.5" /> 邮箱容量</span>
                  <span class="tabular-nums">
                    {{ formatBytes(usedBytes) }} / {{ formatBytes(quotaBytes) }}
                  </span>
                </div>
                <div class="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-3">
                  <div
                    class="h-full rounded-full transition-all duration-300"
                    :class="usedPercent > 85 ? 'bg-danger' : 'bg-brand'"
                    :style="{ width: `${usedPercent}%` }"
                  />
                </div>
              </div>

              <p v-else-if="loadError" class="mt-2 text-[12px] text-ink-3">{{ loadError }}</p>

              <div v-if="aliases.length" class="mt-3">
                <p class="text-[11.5px] text-ink-4">别名地址</p>
                <div class="mt-1 flex flex-wrap gap-1.5">
                  <span
                    v-for="alias in aliases"
                    :key="alias.email"
                    class="rounded-md bg-surface-2 px-2 py-0.5 text-[11.5px] text-ink-2"
                  >
                    {{ alias.email }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- 安全 -->
        <section v-if="auth.admin" class="mb-4 rounded-[14px] border border-line bg-surface p-5">
          <div class="flex items-start gap-3">
            <span class="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-2 text-ink-2">
              <KeyRound class="h-5 w-5" />
            </span>
            <div class="min-w-0 flex-1">
              <h2 class="text-[14px] font-semibold text-ink">修改密码</h2>
              <p class="mt-0.5 text-[12.5px] leading-relaxed text-ink-3">
                密码由服务端做强度校验，弱口令会被拒绝。修改后会替换该账号的密码凭证。
              </p>

              <form class="mt-3 flex flex-col gap-3 sm:max-w-[360px]" @submit.prevent="changePassword">
                <AppInput
                  v-model="password"
                  type="password"
                  label="新密码"
                  placeholder="至少 12 位，建议多词短语"
                  autocomplete="new-password"
                  :error="passwordError"
                />
                <AppInput
                  v-model="confirmPassword"
                  type="password"
                  label="确认新密码"
                  placeholder="再输入一次"
                  autocomplete="new-password"
                />
                <div>
                  <AppButton
                    type="submit"
                    variant="primary"
                    :loading="savingPassword"
                    :disabled="!password || Boolean(passwordError)"
                  >
                    更新密码
                  </AppButton>
                </div>
              </form>
            </div>
          </div>
        </section>

        <!-- 外观 -->
        <section class="mb-4 rounded-[14px] border border-line bg-surface p-5">
          <div class="flex items-start gap-3">
            <span class="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-2 text-ink-2">
              <Monitor class="h-5 w-5" />
            </span>
            <div class="min-w-0 flex-1">
              <h2 class="text-[14px] font-semibold text-ink">外观</h2>

              <div class="mt-3 flex flex-wrap gap-2">
                <button
                  v-for="option in [
                    { key: 'light', label: '浅色', icon: Sun },
                    { key: 'dark', label: '深色', icon: Moon },
                    { key: 'system', label: '跟随系统', icon: Monitor },
                  ]"
                  :key="option.key"
                  type="button"
                  class="flex cursor-pointer items-center gap-2 rounded-[10px] border px-3 py-2 text-[12.5px] transition-colors"
                  :class="
                    mode === option.key
                      ? 'border-brand/40 bg-brand-ghost font-medium text-brand'
                      : 'border-line text-ink-2 hover:border-line-strong hover:bg-surface-2'
                  "
                  @click="setMode(option.key as 'light' | 'dark' | 'system')"
                >
                  <component :is="option.icon" class="h-3.5 w-3.5" />
                  {{ option.label }}
                </button>
              </div>

              <div class="mt-4">
                <AppSwitch
                  :model-value="compact"
                  label="紧凑列表"
                  description="减少每封邮件的高度，一屏看更多。"
                  @update:model-value="toggleDensity"
                />
              </div>
            </div>
          </div>
        </section>

        <!-- 隐私 -->
        <section class="mb-4 rounded-[14px] border border-line bg-surface p-5">
          <div class="flex items-start gap-3">
            <span class="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-2 text-ink-2">
              <ImageOff class="h-5 w-5" />
            </span>
            <div class="min-w-0 flex-1">
              <h2 class="text-[14px] font-semibold text-ink">外部图片</h2>
              <p class="mt-0.5 text-[12.5px] leading-relaxed text-ink-3">
                默认拦截邮件里的远程图片，避免发件人通过追踪像素确认你已读。放行过发件人后按域名记忆。
              </p>

              <div v-if="allowedSenders.length" class="mt-3 flex flex-wrap items-center gap-1.5">
                <span
                  v-for="domain in allowedSenders"
                  :key="domain"
                  class="rounded-md border border-line bg-surface-2 px-2 py-0.5 text-[11.5px] text-ink-2"
                >
                  {{ domain }}
                </span>
                <button
                  type="button"
                  class="ml-1 flex cursor-pointer items-center gap-1 rounded-md px-2 py-0.5 text-[11.5px] text-danger transition-colors hover:bg-danger/8"
                  @click="clearAllowedSenders"
                >
                  <Trash2 class="h-3 w-3" /> 全部清空
                </button>
              </div>
              <p v-else class="mt-2 text-[12px] text-ink-4">还没有放行任何发件人。</p>
            </div>
          </div>
        </section>

        <!-- 退出登录 -->
        <section class="rounded-[14px] border border-line bg-surface p-5">
          <div class="flex items-start gap-3">
            <span class="flex h-10 w-10 items-center justify-center rounded-xl bg-danger/10 text-danger">
              <LogOut class="h-5 w-5" />
            </span>
            <div class="min-w-0 flex-1">
              <h2 class="text-[14px] font-semibold text-ink">退出登录</h2>
              <p class="mt-0.5 break-all text-[12.5px] leading-relaxed text-ink-3">
                退出后本标签页的会话凭据会被清除，{{ auth.user }} 的邮件与草稿仍保留在服务器上。
              </p>
              <div class="mt-3">
                <AppButton variant="danger" size="sm" @click="logout">
                  退出当前账号
                </AppButton>
              </div>
            </div>
          </div>
        </section>
    </div>
  </div>
</template>
