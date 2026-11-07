<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { KeyRound } from 'lucide-vue-next'
import type { AccountRecord, DomainRecord } from '../../jmap/types'
import { useAdminStore } from '../../stores/admin'
import { useToast } from '../../composables/useToast'
import AppDrawer from '../ui/AppDrawer.vue'
import AppButton from '../ui/AppButton.vue'
import AppInput from '../ui/AppInput.vue'

const props = withDefaults(
  defineProps<{
    open: boolean
    mode?: 'create' | 'edit'
    account?: AccountRecord | null
    domains: DomainRecord[]
  }>(),
  { mode: 'create', account: null },
)

const emit = defineEmits<{ 'update:open': [value: boolean]; saved: [] }>()

const admin = useAdminStore()
const toast = useToast()

const localPart = ref('')
const domainId = ref('')
const password = ref('')
const quotaGb = ref('5')
const description = ref('')
const aliasText = ref('')
const error = ref('')

const editing = computed(() => props.mode === 'edit' && Boolean(props.account))
const title = computed(() => (editing.value ? `编辑 ${props.account?.emailAddress ?? ''}` : '新建邮箱账号'))
const fullAddress = computed(() => {
  const domain = props.domains.find((item) => item.id === domainId.value)?.name ?? ''
  return localPart.value ? `${localPart.value}@${domain}` : ''
})

const passwordHint = computed(() =>
  password.value.length >= 12 ? '长度符合要求，服务端仍会做强度校验' : '至少 12 位，避免常见词',
)

watch(
  () => props.open,
  (open) => {
    if (!open) return
    error.value = ''
    password.value = ''
    aliasText.value = ''

    if (editing.value && props.account) {
      localPart.value = props.account.name
      domainId.value = props.account.domainId
      quotaGb.value = props.account.quotas?.maxDiskQuota
        ? String(Math.round(props.account.quotas.maxDiskQuota / 1024 ** 3))
        : '5'
      description.value = props.account.description ?? ''
      aliasText.value = Object.values(props.account.aliases ?? {})
        .map((item) => item.name)
        .join(', ')
    } else {
      localPart.value = ''
      domainId.value = props.domains[0]?.id ?? ''
      quotaGb.value = '5'
      description.value = ''
    }
  },
)

async function submit(): Promise<void> {
  error.value = ''

  if (!domainId.value) {
    error.value = '请先在域名页添加一个域名'
    return
  }

  if (!editing.value) {
    if (!/^[a-z0-9][a-z0-9._-]*$/i.test(localPart.value)) {
      error.value = '账号名只能包含字母、数字、点、下划线与短横线'
      return
    }
    if (password.value.length < 12) {
      error.value = '密码至少 12 位'
      return
    }

    const ok = await admin.addAccount({
      name: localPart.value.trim(),
      domainId: domainId.value,
      password: password.value,
      quotaBytes: Math.max(0, Number(quotaGb.value) || 0) * 1024 ** 3,
      description: description.value.trim() || undefined,
      aliases: aliasText.value
        .split(/[,，\s]+/)
        .map((item) => item.trim())
        .filter(Boolean),
    })

    if (!ok) {
      error.value = admin.error || '创建失败'
      return
    }
    toast.success('账号已创建', fullAddress.value)
    emit('update:open', false)
    emit('saved')
    return
  }

  const account = props.account
  if (!account) return

  try {
    if (password.value) {
      if (password.value.length < 12) {
        error.value = '密码至少 12 位'
        return
      }
      const ok = await admin.changePassword(account.id, password.value)
      if (!ok) {
        error.value = admin.error || '密码修改失败'
        return
      }
    }

    const quotaBytes = Math.max(0, Number(quotaGb.value) || 0) * 1024 ** 3
    if (quotaBytes !== (account.quotas?.maxDiskQuota ?? 0)) {
      await admin.changeQuota(account.id, quotaBytes)
    }

    const aliases = aliasText.value
      .split(/[,，\s]+/)
      .map((item) => item.trim())
      .filter(Boolean)
    const currentAliases = Object.values(account.aliases ?? {}).map((item) => item.name)
    if (aliases.join(',') !== currentAliases.join(',')) {
      await admin.changeAliases(account.id, aliases, account.domainId)
    }

    if (description.value.trim() !== (account.description ?? '')) {
      await admin.changeDescription(account.id, description.value.trim())
    }

    toast.success('已保存')
    emit('update:open', false)
    emit('saved')
  } catch (err) {
    const message = err instanceof Error ? err.message : '保存失败'
    error.value = message
    console.error('[admin] 保存账号失败', err)
  }
}

function close(): void {
  emit('update:open', false)
}
</script>

<template>
  <AppDrawer :open="open" :title="title" width="480px" @update:open="(value) => !value && close()">
    <div class="flex flex-col gap-4">
      <div v-if="!editing" class="grid grid-cols-2 gap-3">
        <AppInput v-model="localPart" label="账号名" placeholder="例如 alice" />
        <label class="block">
          <span class="mb-1.5 block text-[13px] font-medium text-ink-2">域名</span>
          <select
            v-model="domainId"
            class="h-10 w-full cursor-pointer rounded-[10px] border border-line bg-surface px-2.5 text-[13.5px] text-ink outline-none transition-colors hover:border-line-strong focus:border-brand"
          >
            <option v-for="domain in domains" :key="domain.id" :value="domain.id">
              {{ domain.name }}
            </option>
          </select>
        </label>
      </div>

      <div v-else class="rounded-lg border border-line bg-surface-2 px-3 py-2">
        <p class="text-[11.5px] text-ink-4">邮箱地址</p>
        <p class="mt-0.5 text-[13.5px] font-medium text-ink">{{ account?.emailAddress }}</p>
      </div>

      <div
        v-if="!editing && fullAddress"
        class="flex items-center gap-2 rounded-lg border border-brand/20 bg-brand-ghost px-3 py-2 text-[12.5px] text-brand"
      >
        将创建 <span class="font-semibold">{{ fullAddress }}</span>
      </div>

      <AppInput
        v-model="password"
        type="password"
        :label="editing ? '重置密码（留空表示不改）' : '初始密码'"
        placeholder="至少 12 位"
        autocomplete="new-password"
        :hint="passwordHint"
      />

      <AppInput v-model="quotaGb" label="容量上限（GB）" placeholder="0 表示不限" />
      <AppInput v-model="description" label="备注" placeholder="例如：主邮箱" />
      <AppInput
        v-model="aliasText"
        label="别名"
        placeholder="多个别名用逗号分隔，例如 contact, hi"
        hint="别名与主地址共用同一个邮箱，收信都进这里"
      />

      <div
        v-if="error"
        class="rounded-lg border border-danger/25 bg-danger/8 px-3 py-2 text-[12.5px] leading-relaxed text-danger"
      >
        {{ error }}
      </div>

      <p class="flex items-start gap-1.5 text-[11.5px] leading-relaxed text-ink-4">
        <KeyRound class="mt-0.5 h-3 w-3 shrink-0" />
        密码由服务端用 zxcvbn 风格校验强度，常见词与短密码会被拒绝。修改密码会替换该账号的密码凭证。
      </p>
    </div>

    <template #footer>
      <AppButton variant="ghost" @click="close">取消</AppButton>
      <AppButton variant="primary" :loading="admin.saving" @click="submit">
        {{ editing ? '保存' : '创建账号' }}
      </AppButton>
    </template>
  </AppDrawer>
</template>
