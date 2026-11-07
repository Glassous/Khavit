<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  ArrowLeft,
  Check,
  Copy,
  Globe,
  HardDrive,
  Loader2,
  Plus,
  RefreshCw,
  Users,
} from 'lucide-vue-next'
import AppShell from '../components/layout/AppShell.vue'
import AppButton from '../components/ui/AppButton.vue'
import AppDialog from '../components/ui/AppDialog.vue'
import AppDrawer from '../components/ui/AppDrawer.vue'
import AppInput from '../components/ui/AppInput.vue'
import DomainTable from '../components/admin/DomainTable.vue'
import AccountTable from '../components/admin/AccountTable.vue'
import AccountDialog from '../components/admin/AccountDialog.vue'
import { useAdminStore } from '../stores/admin'
import { useAuthStore } from '../stores/auth'
import { useConfirm } from '../composables/useConfirm'
import { useToast } from '../composables/useToast'
import { formatBytes } from '../utils/format'
import { describeError, formatNumber } from '../utils/i18n'
import type { AccountRecord, DomainRecord } from '../jmap/types'

const admin = useAdminStore()
const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
const { confirm } = useConfirm()
const toast = useToast()

const section = computed<'domains' | 'accounts'>(() =>
  route.params.section === 'accounts' ? 'accounts' : 'domains',
)

const domainDialog = ref(false)
const newDomain = ref('')
const domainError = ref('')
const zoneDomain = ref<DomainRecord | null>(null)
const copied = ref(false)

const accountDialog = ref(false)
const editingAccount = ref<AccountRecord | null>(null)

const enabledDomains = computed(() => admin.domains.filter((item) => item.enable))

onMounted(async () => {
  await admin.load()
})

watch(section, () => {
  if (zoneDomain.value) zoneDomain.value = null
})

async function switchSection(next: 'domains' | 'accounts'): Promise<void> {
  await router.push(`/admin/${next}`)
}

async function submitDomain(): Promise<void> {
  domainError.value = ''
  const name = newDomain.value.trim().toLowerCase()
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(name)) {
    domainError.value = '请输入合法域名，例如 example.com'
    return
  }
  const ok = await admin.addDomain(name)
  if (!ok) {
    domainError.value = admin.error || '创建失败'
    return
  }
  newDomain.value = ''
  domainDialog.value = false
  toast.success('域名已添加', '下一步：把 DNS 记录配到域名服务商')
}

async function toggleDomain(domain: DomainRecord): Promise<void> {
  await admin.toggleDomain(domain)
  toast.success(domain.enable ? '域名已停用' : '域名已启用')
}

function openZone(domain: DomainRecord): void {
  zoneDomain.value = domain
  copied.value = false
}

async function copyZone(): Promise<void> {
  const text = zoneDomain.value?.dnsZoneFile ?? ''
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
    copied.value = true
    setTimeout(() => (copied.value = false), 1800)
  } catch (err) {
    toast.error('复制失败，请手动选择文本')
    console.error('[admin] 复制失败', err)
  }
}

function openCreate(): void {
  if (section.value === 'domains') {
    newDomain.value = ''
    domainError.value = ''
    domainDialog.value = true
    return
  }
  if (enabledDomains.value.length === 0) {
    toast.warn('请先添加域名', '没有可用域名时无法创建邮箱账号')
    return
  }
  editingAccount.value = null
  accountDialog.value = true
}

function openEdit(account: AccountRecord): void {
  editingAccount.value = account
  accountDialog.value = true
}

async function removeAccount(account: AccountRecord): Promise<void> {
  const label = account.emailAddress ?? account.name
  const ok = await confirm({
    title: `删除账号 ${label}？`,
    description: '该账号的邮件会一并清理，且无法撤销。建议先确认没有需要的邮件。',
    confirmLabel: '永久删除',
    tone: 'danger',
  })
  if (!ok) return

  try {
    await admin.removeAccount(account.id)
    toast.success('账号已删除', label)
  } catch (err) {
    toast.error('删除失败', describeError(err, '账号没能删除，请稍后重试'))
  }
}

async function refresh(): Promise<void> {
  await admin.load()
  toast.success('已刷新')
}
</script>

<template>
  <AppShell :searchable="false">
    <div class="flex min-h-0 flex-1">
      <!-- 二级导航 -->
      <aside class="hidden w-[208px] shrink-0 flex-col border-r border-line bg-canvas-deep/50 md:flex">
        <div class="px-3 py-3">
          <button
            type="button"
            class="flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1.5 text-[12.5px] text-ink-3 transition-colors hover:bg-surface/70 hover:text-ink"
            @click="router.push('/mail')"
          >
            <ArrowLeft class="h-3.5 w-3.5" /> 返回邮件
          </button>
        </div>

        <nav class="flex-1 px-2">
          <p class="px-2 pb-1.5 text-[11px] font-medium uppercase tracking-wider text-ink-4">管理</p>
          <button
            v-for="item in [
              { key: 'domains', label: '域名', icon: Globe },
              { key: 'accounts', label: '邮箱账号', icon: Users },
            ]"
            :key="item.key"
            type="button"
            class="mb-0.5 flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-left text-[13.5px] transition-colors"
            :class="
              section === item.key
                ? 'bg-surface font-medium text-ink shadow-[0_1px_2px_rgb(15_21_32/0.04)]'
                : 'text-ink-2 hover:bg-surface/70 hover:text-ink'
            "
            @click="switchSection(item.key as 'domains' | 'accounts')"
          >
            <component :is="item.icon" class="h-4 w-4" :class="section === item.key ? 'text-brand' : 'text-ink-3'" />
            {{ item.label }}
          </button>
        </nav>

        <div class="border-t border-line px-3 py-3">
          <p class="text-[11px] text-ink-4">当前账号</p>
          <p class="mt-0.5 truncate text-[11.5px] text-ink-3">{{ auth.user }}</p>
        </div>
      </aside>

      <!-- 主区 -->
      <main class="min-w-0 flex-1 overflow-y-auto scroll-slim">
        <div class="mx-auto w-full max-w-[1000px] px-4 py-5 sm:px-6">
          <header class="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 class="text-[20px] font-semibold tracking-tight text-ink">
                {{ section === 'domains' ? '域名' : '邮箱账号' }}
              </h1>
              <p class="mt-1 text-[12.5px] text-ink-3">
                {{
                  section === 'domains'
                    ? '每个域名对应一组 DNS 记录，添加后把记录配到域名服务商即可收信。'
                    : '账号是真实邮箱地址，创建后可用 Webmail 或任意 IMAP/SMTP 客户端登录。'
                }}
              </p>
            </div>

            <div class="flex items-center gap-2">
              <AppButton size="sm" variant="ghost" :loading="admin.loading" @click="refresh">
                <template #icon>
                  <RefreshCw class="h-3.5 w-3.5" />
                </template>
                刷新
              </AppButton>
              <AppButton size="sm" variant="primary" @click="openCreate">
                <template #icon>
                  <Plus class="h-3.5 w-3.5" />
                </template>
                {{ section === 'domains' ? '添加域名' : '新建账号' }}
              </AppButton>
            </div>
          </header>

          <!-- 统计 -->
          <div class="mt-4 grid gap-3 sm:grid-cols-3">
            <div class="rounded-[14px] border border-line bg-surface p-3.5">
              <p class="flex items-center gap-1.5 text-[11.5px] text-ink-4">
                <Globe class="h-3 w-3" /> 域名
              </p>
              <p class="mt-1 text-[19px] font-semibold tabular-nums text-ink">
                {{ formatNumber(admin.domains.length) }}
                <span class="ml-1 text-[11.5px] font-normal text-ink-3">
                  / 启用 {{ formatNumber(enabledDomains.length) }}
                </span>
              </p>
            </div>
            <div class="rounded-[14px] border border-line bg-surface p-3.5">
              <p class="flex items-center gap-1.5 text-[11.5px] text-ink-4">
                <Users class="h-3 w-3" /> 邮箱账号
              </p>
              <p class="mt-1 text-[19px] font-semibold tabular-nums text-ink">{{ formatNumber(admin.accountCount) }}</p>
            </div>
            <div class="rounded-[14px] border border-line bg-surface p-3.5">
              <p class="flex items-center gap-1.5 text-[11.5px] text-ink-4">
                <HardDrive class="h-3 w-3" /> 已用磁盘
              </p>
              <p class="mt-1 text-[19px] font-semibold tabular-nums text-ink">
                {{ formatBytes(admin.totalDiskUsed) }}
              </p>
            </div>
          </div>

          <div v-if="admin.loading" class="mt-4 flex items-center justify-center gap-2 rounded-[14px] border border-line bg-surface py-14 text-[13px] text-ink-3">
            <Loader2 class="h-4 w-4 animate-spin" /> 正在加载…
          </div>

          <div v-else class="mt-4">
            <DomainTable
              v-if="section === 'domains'"
              :domains="admin.domains"
              :accounts="admin.accounts"
              @toggle="toggleDomain"
              @zone="openZone"
            />
            <AccountTable
              v-else
              :accounts="admin.accounts"
              :domains="admin.domains"
              @edit="openEdit"
              @remove="removeAccount"
            />
          </div>

          <p v-if="admin.error && !admin.loading" class="mt-3 rounded-lg border border-danger/25 bg-danger/8 px-3 py-2 text-[12.5px] text-danger">
            {{ admin.error }}
          </p>
        </div>
      </main>
    </div>

    <!-- 新建域名 -->
    <AppDialog
      v-model:open="domainDialog"
      title="添加域名"
      description="添加后系统会生成 DKIM 密钥与完整的 DNS 记录清单。"
      width="420px"
    >
      <AppInput
        v-model="newDomain"
        label="域名"
        placeholder="example.com"
        :error="domainError"
        hint="不要带 mail. 前缀，那是服务器主机名"
        @enter="submitDomain"
      />
      <template #footer>
        <AppButton variant="ghost" @click="domainDialog = false">取消</AppButton>
        <AppButton variant="primary" :loading="admin.saving" @click="submitDomain">添加</AppButton>
      </template>
    </AppDialog>

    <!-- DNS 记录 -->
    <AppDrawer
      :open="Boolean(zoneDomain)"
      :title="zoneDomain ? `${zoneDomain.name} 的 DNS 记录` : 'DNS 记录'"
      description="把下面的记录逐条加到域名服务商，注意把 localhost 换成你的邮件服务器主机名。"
      width="560px"
      @update:open="(value) => !value && (zoneDomain = null)"
    >
      <div class="relative">
        <pre class="max-h-[60vh] overflow-auto rounded-lg border border-line bg-surface-2 p-3 text-[11.5px] leading-relaxed text-ink-2 scroll-slim">{{ zoneDomain?.dnsZoneFile || '（服务端暂未生成 zone 文件）' }}</pre>
        <button
          type="button"
          class="absolute right-2 top-2 flex cursor-pointer items-center gap-1 rounded-md border border-line bg-surface px-2 py-1 text-[11px] text-ink-2 shadow-soft transition-colors hover:text-ink"
          @click="copyZone"
        >
          <component :is="copied ? Check : Copy" class="h-3 w-3" :class="copied ? 'text-teal' : ''" />
          {{ copied ? '已复制' : '复制' }}
        </button>
      </div>
    </AppDrawer>

    <AccountDialog
      v-model:open="accountDialog"
      :mode="editingAccount ? 'edit' : 'create'"
      :account="editingAccount"
      :domains="enabledDomains"
      @saved="admin.load()"
    />
  </AppShell>
</template>
