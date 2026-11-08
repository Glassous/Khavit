<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  Archive,
  FileText,
  Inbox,
  PenLine,
  Send,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Trash2,
} from 'lucide-vue-next'
import { useAuthStore } from '../../stores/auth'
import { useMailStore } from '../../stores/mail'
import { useComposerStore } from '../../stores/composer'
import { mailboxLabel, roleOrder } from '../../utils/i18n'
import type { Mailbox } from '../../jmap/types'

const props = withDefaults(defineProps<{ open?: boolean }>(), { open: false })
const emit = defineEmits<{ close: [] }>()

const auth = useAuthStore()
const mail = useMailStore()
const composer = useComposerStore()
const router = useRouter()
const route = useRoute()

const roleIcons: Record<string, unknown> = {
  inbox: Inbox,
  drafts: FileText,
  sent: Send,
  junk: ShieldAlert,
  trash: Trash2,
  archive: Archive,
}

const boxes = computed(() => {
  const list = [...auth.mailboxes]
  return list.sort((a, b) => {
    const diff = roleOrder(a.role) - roleOrder(b.role)
    if (diff !== 0) return diff
    // 中文界面下按中文排序规则比较文件夹名
    return mailboxLabel(a).localeCompare(mailboxLabel(b), 'zh-CN')
  })
})

function slugOf(box: Mailbox): string {
  return box.role ?? box.id
}

function isActive(box: Mailbox): boolean {
  if (route.name !== 'mail') return false
  const current = route.params.mailbox as string | undefined
  if (!current) return box.role === 'inbox'
  return current === slugOf(box)
}

async function select(box: Mailbox): Promise<void> {
  await router.push(`/mail/${slugOf(box)}`)
  await mail.selectMailbox(box.id)
  emit('close')
}

function compose(): void {
  composer.openNew()
  emit('close')
}

async function go(path: string): Promise<void> {
  await router.push(path)
  emit('close')
}
</script>

<template>
  <!-- 移动端遮罩 -->
  <div
    v-if="open"
    class="fixed inset-0 z-30 bg-ink/30 backdrop-blur-[1px] lg:hidden"
    @click="emit('close')"
  />

  <aside
    class="z-40 flex h-full w-[264px] shrink-0 flex-col bg-canvas-deep transition-transform duration-200 ease-[cubic-bezier(0.2,0.8,0.2,1)] max-lg:fixed max-lg:inset-y-0 max-lg:left-0"
    :class="open ? 'max-lg:translate-x-0' : 'max-lg:-translate-x-full'"
  >
    <div class="px-3 pb-1 pt-4">
      <button
        type="button"
        class="group flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-brand text-[14px] font-medium text-white shadow-[0_1px_2px_rgb(47_91_234/0.28),0_10px_24px_-14px_rgb(47_91_234/0.9)] transition-all duration-150 hover:bg-brand-strong active:translate-y-[0.5px] dark:hover:bg-brand-soft"
        @click="compose"
      >
        <PenLine
          class="h-[18px] w-[18px] transition-transform duration-200 group-hover:-rotate-6"
          :stroke-width="2.1"
        />
        撰写邮件
        <span class="ml-1 rounded border border-white/25 px-1 text-[10px] text-white/70">C</span>
      </button>
    </div>

    <nav class="flex-1 overflow-y-auto px-3 py-2 scroll-slim" aria-label="邮箱文件夹">
      <button
        v-for="box in boxes"
        :key="box.id"
        type="button"
        class="group relative mb-1 flex w-full cursor-pointer items-center gap-3.5 rounded-[10px] px-3 py-2.5 text-left text-[14px] transition-colors duration-150"
        :class="
          isActive(box)
            ? 'bg-surface font-medium text-ink shadow-[0_1px_2px_rgb(15_21_32/0.06)]'
            : 'text-ink-2 hover:bg-surface/70 hover:text-ink'
        "
        @click="select(box)"
      >
        <span
          v-if="isActive(box)"
          class="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-brand"
        />
        <component
          :is="roleIcons[box.role ?? ''] ?? FileText"
          class="h-[18px] w-[18px] shrink-0"
          :stroke-width="2.1"
          :class="isActive(box) ? 'text-brand' : 'text-ink-3 group-hover:text-ink-2'"
        />
        <span class="flex-1 truncate" :title="mailboxLabel(box)">{{ mailboxLabel(box) }}</span>
        <span
          v-if="box.unreadEmails > 0"
          class="rounded-full px-2 py-0.5 text-[11.5px] font-semibold leading-4"
          :class="
            box.role === 'junk'
              ? 'bg-amber/12 text-amber'
              : isActive(box)
                ? 'bg-brand text-white'
                : 'bg-surface-3 text-ink-2'
          "
        >
          {{ box.unreadEmails > 99 ? '99+' : box.unreadEmails }}
        </span>
      </button>
    </nav>

    <!-- 底部操作：设置固定在最下方 -->
    <div class="px-3 pb-3 pt-1">
      <button
        v-if="auth.admin"
        type="button"
        class="mb-1 flex w-full cursor-pointer items-center gap-3.5 rounded-[10px] px-3 py-2.5 text-left text-[14px] text-ink-2 transition-colors hover:bg-surface/70 hover:text-ink"
        @click="go('/admin/domains')"
      >
        <ShieldCheck class="h-[19px] w-[19px] text-ink-3" :stroke-width="2.1" /> 管理后台
      </button>
      <button
        type="button"
        class="flex w-full cursor-pointer items-center gap-3.5 rounded-[10px] px-3 py-3 text-left text-[15px] font-medium text-ink-2 transition-colors hover:bg-surface/70 hover:text-ink"
        @click="go('/settings')"
      >
        <Settings class="h-[22px] w-[22px] text-ink-3" :stroke-width="2.3" /> 设置
      </button>
    </div>
  </aside>
</template>
