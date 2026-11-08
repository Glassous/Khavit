<script setup lang="ts">
import { computed } from 'vue'
import { AtSign, Pencil, ShieldCheck, Trash2, UserRound } from 'lucide-vue-next'
import type { AccountRecord, DomainRecord } from '../../jmap/types'
import { formatBytes } from '../../utils/format'

const props = defineProps<{ accounts: AccountRecord[]; domains: DomainRecord[] }>()
const emit = defineEmits<{ edit: [account: AccountRecord]; remove: [account: AccountRecord] }>()

const rows = computed(() =>
  props.accounts
    .filter((item) => item['@type'] === 'User')
    .slice()
    .sort((a, b) => (a.emailAddress ?? '').localeCompare(b.emailAddress ?? '', 'zh-CN')),
)

function domainName(domainId: string): string {
  return props.domains.find((item) => item.id === domainId)?.name ?? '—'
}

function aliasList(account: AccountRecord): string[] {
  // 别名只存「@ 前面的部分 + domainId」，展示时补回完整地址
  return Object.values(account.aliases ?? {})
    .map((item) => {
      const name = item.name?.trim() ?? ''
      if (!name) return ''
      if (name.includes('@')) return name
      const domainId = item.domainId ?? account.domainId
      const domain = props.domains.find((record) => record.id === domainId)?.name ?? ''
      return domain ? `${name}@${domain}` : name
    })
    .filter(Boolean)
}

function quotaText(account: AccountRecord): string {
  const quota = account.quotas?.maxDiskQuota ?? 0
  const used = account.usedDiskQuota ?? 0
  if (!quota) return `${formatBytes(used)} / 不限`
  return `${formatBytes(used)} / ${formatBytes(quota)}`
}

function percent(account: AccountRecord): number {
  const quota = account.quotas?.maxDiskQuota ?? 0
  if (!quota) return 0
  return Math.min(100, Math.round(((account.usedDiskQuota ?? 0) / quota) * 100))
}

function isAdmin(account: AccountRecord): boolean {
  return account.roles?.['@type'] === 'Admin'
}
</script>

<template>
  <div class="overflow-hidden rounded-[14px] border border-line bg-surface">
    <div class="overflow-x-auto scroll-slim">
      <table class="w-full min-w-[720px] border-collapse text-left">
        <thead>
          <tr class="border-b border-line bg-surface-2/60 text-[11.5px] uppercase tracking-wide text-ink-4">
            <th class="px-4 py-2.5 font-medium">账号</th>
            <th class="px-4 py-2.5 font-medium">域名</th>
            <th class="px-4 py-2.5 font-medium">角色</th>
            <th class="px-4 py-2.5 font-medium">磁盘用量</th>
            <th class="px-4 py-2.5 text-right font-medium">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="rows.length === 0">
            <td colspan="5" class="px-4 py-10 text-center text-[13px] text-ink-3">
              还没有邮箱账号，点右上角「新建账号」创建第一个。
            </td>
          </tr>

          <tr
            v-for="account in rows"
            :key="account.id"
            class="group border-b border-line/70 transition-colors last:border-0 hover:bg-surface-2/50"
          >
            <td class="px-4 py-3">
              <div class="flex items-center gap-2.5">
                <span
                  class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                  :class="isAdmin(account) ? 'bg-brand-ghost text-brand' : 'bg-surface-2 text-ink-2'"
                >
                  <component :is="isAdmin(account) ? ShieldCheck : UserRound" class="h-4 w-4" />
                </span>
                <div class="min-w-0">
                  <p class="truncate text-[13px] font-medium text-ink">
                    {{ account.emailAddress ?? account.name }}
                  </p>
                  <p class="mt-0.5 flex items-center gap-1 text-[11.5px] text-ink-4">
                    <AtSign class="h-3 w-3" />
                    <span v-if="aliasList(account).length" class="truncate">
                      {{ aliasList(account).join(', ') }}
                    </span>
                    <span v-else>无别名</span>
                  </p>
                </div>
              </div>
            </td>

            <td class="px-4 py-3 text-[12.5px] text-ink-2">{{ domainName(account.domainId) }}</td>

            <td class="px-4 py-3">
              <span
                class="rounded-full border px-2 py-0.5 text-[11px] font-medium"
                :class="
                  isAdmin(account)
                    ? 'border-brand/25 bg-brand-ghost text-brand'
                    : 'border-line bg-surface-2 text-ink-2'
                "
              >
                {{ isAdmin(account) ? '管理员' : '普通' }}
              </span>
            </td>

            <td class="px-4 py-3">
              <div class="flex items-center gap-2">
                <div class="h-1.5 w-[92px] overflow-hidden rounded-full bg-surface-3">
                  <div
                    class="h-full rounded-full transition-all"
                    :class="percent(account) > 85 ? 'bg-danger' : 'bg-brand'"
                    :style="{ width: `${percent(account)}%` }"
                  />
                </div>
                <span class="text-[11.5px] tabular-nums text-ink-3">{{ quotaText(account) }}</span>
              </div>
            </td>

            <td class="px-4 py-3">
              <div class="flex items-center justify-end gap-1">
                <button
                  type="button"
                  class="cursor-pointer rounded-lg p-1.5 text-ink-3 transition-colors hover:bg-surface-3 hover:text-ink"
                  aria-label="编辑账号"
                  v-tooltip="'编辑账号'"
                  @click="emit('edit', account)"
                >
                  <Pencil class="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  class="cursor-pointer rounded-lg p-1.5 text-ink-3 transition-colors hover:bg-danger/10 hover:text-danger"
                  aria-label="删除账号"
                  v-tooltip="'删除账号'"
                  @click="emit('remove', account)"
                >
                  <Trash2 class="h-3.5 w-3.5" />
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
