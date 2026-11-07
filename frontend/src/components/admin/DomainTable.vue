<script setup lang="ts">
import { computed } from 'vue'
import { FileCode2, Globe, Power, ShieldCheck } from 'lucide-vue-next'
import type { AccountRecord, DomainRecord } from '../../jmap/types'

const props = defineProps<{ domains: DomainRecord[]; accounts: AccountRecord[] }>()
const emit = defineEmits<{ toggle: [domain: DomainRecord]; zone: [domain: DomainRecord] }>()

const rows = computed(() => props.domains.slice().sort((a, b) => a.name.localeCompare(b.name)))

function accountCount(domainId: string): number {
  return props.accounts.filter((item) => item.domainId === domainId && item['@type'] === 'User').length
}

function managementLabel(value?: { '@type': string }): string {
  return value?.['@type'] === 'Automatic' ? '自动' : '手动'
}
</script>

<template>
  <div class="overflow-hidden rounded-[14px] border border-line bg-surface">
    <div class="overflow-x-auto scroll-slim">
      <table class="w-full min-w-[700px] border-collapse text-left">
        <thead>
          <tr class="border-b border-line bg-surface-2/60 text-[11.5px] uppercase tracking-wide text-ink-4">
            <th class="px-4 py-2.5 font-medium">域名</th>
            <th class="px-4 py-2.5 font-medium">状态</th>
            <th class="px-4 py-2.5 font-medium">账号数</th>
            <th class="px-4 py-2.5 font-medium">DKIM / 证书</th>
            <th class="px-4 py-2.5 text-right font-medium">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="rows.length === 0">
            <td colspan="5" class="px-4 py-10 text-center text-[13px] text-ink-3">
              还没有域名。先添加一个域名，再创建邮箱账号。
            </td>
          </tr>

          <tr
            v-for="domain in rows"
            :key="domain.id"
            class="border-b border-line/70 transition-colors last:border-0 hover:bg-surface-2/50"
          >
            <td class="px-4 py-3">
              <div class="flex items-center gap-2.5">
                <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink-2">
                  <Globe class="h-4 w-4" />
                </span>
                <div class="min-w-0">
                  <p class="truncate text-[13px] font-medium text-ink">{{ domain.name }}</p>
                  <p class="mt-0.5 truncate text-[11.5px] text-ink-4">
                    {{ domain.description || '未填写备注' }}
                  </p>
                </div>
              </div>
            </td>

            <td class="px-4 py-3">
              <span
                class="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium"
                :class="
                  domain.enable
                    ? 'border-teal/25 bg-teal/10 text-teal'
                    : 'border-line bg-surface-2 text-ink-3'
                "
              >
                <span class="h-1.5 w-1.5 rounded-full bg-current" />
                {{ domain.enable ? '已启用' : '已停用' }}
              </span>
            </td>

            <td class="px-4 py-3 text-[12.5px] tabular-nums text-ink-2">{{ accountCount(domain.id) }}</td>

            <td class="px-4 py-3">
              <div class="flex items-center gap-2 text-[11.5px] text-ink-3">
                <span class="flex items-center gap-1">
                  <ShieldCheck class="h-3 w-3 text-teal" />
                  DKIM {{ managementLabel(domain.dkimManagement) }}
                </span>
                <span class="text-ink-4">·</span>
                <span>证书 {{ managementLabel(domain.certificateManagement) }}</span>
              </div>
            </td>

            <td class="px-4 py-3">
              <div class="flex items-center justify-end gap-1">
                <button
                  type="button"
                  class="cursor-pointer rounded-lg p-1.5 text-ink-3 transition-colors hover:bg-surface-3 hover:text-ink"
                  aria-label="查看 DNS 记录"
                  @click="emit('zone', domain)"
                >
                  <FileCode2 class="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  class="cursor-pointer rounded-lg p-1.5 transition-colors"
                  :class="
                    domain.enable
                      ? 'text-ink-3 hover:bg-amber/10 hover:text-amber'
                      : 'text-ink-3 hover:bg-teal/10 hover:text-teal'
                  "
                  :aria-label="domain.enable ? '停用域名' : '启用域名'"
                  @click="emit('toggle', domain)"
                >
                  <Power class="h-3.5 w-3.5" />
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
