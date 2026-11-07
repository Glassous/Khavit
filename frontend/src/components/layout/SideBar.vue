<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  Archive,
  ChevronLeft,
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
import type { Mailbox } from '../../jmap/types'

const props = withDefaults(defineProps<{ open?: boolean }>(), { open: false })
const emit = defineEmits<{ close: [] }>()

const auth = useAuthStore()
const mail = useMailStore()
const composer = useComposerStore()
const router = useRouter()
const route = useRoute()

const ROLE_ORDER = ['inbox', 'drafts', 'sent', 'junk', 'trash', 'archive']

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
    const ai = ROLE_ORDER.indexOf(a.role ?? '')
    const bi = ROLE_ORDER.indexOf(b.role ?? '')
    if (ai !== -1 && bi !== -1) return ai - bi
    if (ai !== -1) return -1
    if (bi !== -1) return 1
    return a.name.localeCompare(b.name, 'zh-CN')
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
    class="z-40 flex h-full w-[248px] shrink-0 flex-col border-r border-line bg-canvas-deep/60 transition-transform duration-200 ease-[cubic-bezier(0.2,0.8,0.2,1)] max-lg:fixed max-lg:inset-y-0 max-lg:left-0 max-lg:bg-canvas"
    :class="open ? 'max-lg:translate-x-0' : 'max-lg:-translate-x-full'"
  >
    <div class="px-3 pb-2 pt-3">
      <button
        type="button"
        class="group flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-[10px] bg-brand text-[13.5px] font-medium text-white shadow-[0_1px_2px_rgb(47_91_234/0.28),0_10px_24px_-14px_rgb(47_91_234/0.9)] transition-all duration-150 hover:bg-brand-strong active:translate-y-[0.5px] dark:hover:bg-brand-soft"
        @click="compose"
      >
        <PenLine class="h-4 w-4 transition-transform duration-200 group-hover:-rotate-6" />
        撰写邮件
        <span class="ml-1 rounded border border-white/25 px-1 text-[10px] text-white/70">C</span>
      </button>
    </div>

    <nav class="flex-1 overflow-y-auto px-2 py-1 scroll-slim" aria-label="邮箱文件夹">
      <p class="px-2 pb-1.5 pt-2 text-[11px] font-medium uppercase tracking-wider text-ink-4">文件夹</p>

      <button
        v-for="box in boxes"
        :key="box.id"
        type="button"
        class="group relative flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-left text-[13.5px] transition-colors duration-150"
        :class="
          isActive(box)
            ? 'bg-surface font-medium text-ink shadow-[0_1px_2px_rgb(15_21_32/0.04)]'
            : 'text-ink-2 hover:bg-surface/70 hover:text-ink'
        "
        @click="select(box)"
      >
        <span
          v-if="isActive(box)"
          class="absolute left-0 top-1/2 h-4 w-[2.5px] -translate-y-1/2 rounded-r-full bg-brand"
        />
        <component
          :is="roleIcons[box.role ?? ''] ?? FileText"
          class="h-4 w-4 shrink-0"
          :class="isActive(box) ? 'text-brand' : 'text-ink-3 group-hover:text-ink-2'"
        />
        <span class="flex-1 truncate">{{ box.name }}</span>
        <span
          v-if="box.unreadEmails > 0"
          class="rounded-full px-1.5 py-[1px] text-[11px] font-semibold leading-4"
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

    <div class="border-t border-line px-2 py-2">
      <button
        type="button"
        class="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-left text-[13px] text-ink-2 transition-colors hover:bg-surface/70 hover:text-ink"
        @click="go('/settings')"
      >
        <Settings class="h-4 w-4 text-ink-3" /> 设置
      </button>
      <button
        v-if="auth.admin"
        type="button"
        class="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-left text-[13px] text-ink-2 transition-colors hover:bg-surface/70 hover:text-ink"
        @click="go('/admin/domains')"
      >
        <ShieldCheck class="h-4 w-4 text-ink-3" /> 管理后台
      </button>

      <div class="mt-1 flex items-center gap-2 rounded-lg px-2.5 py-2">
        <span class="h-1.5 w-1.5 shrink-0 rounded-full bg-teal" />
        <span class="min-w-0 flex-1 truncate text-[11.5px] text-ink-3">{{ auth.user }}</span>
        <button
          type="button"
          class="cursor-pointer rounded p-0.5 text-ink-4 hover:text-ink lg:hidden"
          aria-label="收起菜单"
          @click="emit('close')"
        >
          <ChevronLeft class="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  </aside>
</template>
