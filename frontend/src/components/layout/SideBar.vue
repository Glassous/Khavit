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

const props = withDefaults(defineProps<{ open?: boolean; collapsed?: boolean }>(), {
  open: false,
  collapsed: false,
})
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

  <!--
    宽度与文字同步过渡：文字用更短的时长淡出/淡入（100ms），
    到宽度动画结束时文字早已消失，不会出现被挤压的中间态。
  -->
  <aside
    class="z-40 flex h-full shrink-0 flex-col bg-canvas-deep transition-[width,transform] duration-200 ease-[cubic-bezier(0.2,0.8,0.2,1)] max-lg:fixed max-lg:inset-y-0 max-lg:left-0 max-lg:w-[264px]"
    :class="[
      collapsed ? 'w-[80px]' : 'w-[264px]',
      open ? 'max-lg:translate-x-0' : 'max-lg:-translate-x-full',
    ]"
  >
    <div class="px-3 pb-1 pt-4">
      <button
        type="button"
        class="group flex h-12 w-full cursor-pointer items-center justify-center rounded-xl bg-brand text-[15px] font-medium text-white transition-all duration-150 hover:bg-brand-strong active:translate-y-[0.5px] dark:hover:bg-brand-soft"
        :title="collapsed ? '撰写邮件' : undefined"
        @click="compose"
      >
        <PenLine
          class="shrink-0 transition-[width,height] duration-200"
          :class="collapsed ? 'h-[22px] w-[22px]' : 'h-[19px] w-[19px]'"
          :stroke-width="2.1"
        />
        <!--
          文字宽度必须一起过渡：若展开瞬间文字整块插入，内容宽度突然变大，
          居中排布会把图标顶到左侧，随后又被拉回中间，看起来就是图标先漂移。
        -->
        <span
          class="flex items-center overflow-hidden whitespace-nowrap transition-[max-width,opacity,margin-left] duration-200 ease-[cubic-bezier(0.2,0.8,0.2,1)]"
          :class="collapsed ? 'ml-0 max-w-0 opacity-0' : 'ml-2 max-w-[96px] opacity-100'"
        >
          <span>撰写邮件</span>
          <span class="ml-2 rounded border border-white/25 px-1 text-[10px] text-white/70">C</span>
        </span>
      </button>
    </div>

    <nav class="flex-1 overflow-y-auto px-3 py-2 scroll-slim" aria-label="邮箱文件夹">
      <button
        v-for="box in boxes"
        :key="box.id"
        type="button"
        class="group relative mb-1 flex w-full cursor-pointer items-center rounded-[10px] text-left text-[15px] transition-all duration-200 ease-[cubic-bezier(0.2,0.8,0.2,1)]"
        :class="[
          collapsed ? 'gap-0 py-3 pl-[14px]' : 'gap-3 py-3 pl-2 pr-3',
          isActive(box)
            ? 'bg-surface font-medium text-ink'
            : 'text-ink-2 hover:bg-surface/70 hover:text-ink',
        ]"
        :title="mailboxLabel(box)"
        @click="select(box)"
      >
        <!-- 图标盒宽度固定，折叠时只放大图标本身，居中位置由行内边距带动 -->
        <span class="relative flex w-7 shrink-0 items-center justify-center">
          <component
            :is="roleIcons[box.role ?? ''] ?? FileText"
            class="transition-[width,height] duration-200"
            :class="[
              collapsed ? 'h-6 w-6' : 'h-5 w-5',
              isActive(box) ? 'text-brand' : 'text-ink-3 group-hover:text-ink-2',
            ]"
            :stroke-width="2.1"
          />
          <span
            v-if="collapsed && box.unreadEmails > 0"
            class="absolute right-0 top-0 h-2 w-2 rounded-full ring-2 ring-canvas-deep"
            :class="box.role === 'junk' ? 'bg-amber' : 'bg-brand'"
          />
        </span>

        <span
          class="flex min-w-0 items-center transition-opacity"
          :class="
            collapsed
              ? 'w-0 flex-none overflow-hidden opacity-0 duration-100'
              : 'flex-1 opacity-100 duration-200'
          "
        >
          <span class="flex-1 truncate">{{ mailboxLabel(box) }}</span>
          <span
            v-if="box.unreadEmails > 0"
            class="ml-2 rounded-full px-2 py-0.5 text-[11.5px] font-semibold leading-4"
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
        </span>
      </button>
    </nav>

    <!-- 底部操作：设置固定在最下方 -->
    <div class="px-3 pb-3 pt-1">
      <button
        v-if="auth.admin"
        type="button"
        class="mb-1 flex w-full cursor-pointer items-center rounded-[10px] text-left text-[15px] text-ink-2 transition-all duration-200 ease-[cubic-bezier(0.2,0.8,0.2,1)] hover:bg-surface/70 hover:text-ink"
        :class="collapsed ? 'gap-0 py-2.5 pl-[14px]' : 'gap-3 py-2.5 pl-2 pr-3'"
        title="管理后台"
        @click="go('/admin/domains')"
      >
        <span class="flex w-7 shrink-0 items-center justify-center">
          <ShieldCheck
            class="text-ink-3 transition-[width,height] duration-200"
            :class="collapsed ? 'h-6 w-6' : 'h-5 w-5'"
            :stroke-width="2.1"
          />
        </span>
        <span
          class="min-w-0 overflow-hidden transition-opacity"
          :class="
            collapsed
              ? 'w-0 flex-none opacity-0 duration-100'
              : 'flex-1 opacity-100 duration-200'
          "
        >
          <span class="truncate">管理后台</span>
        </span>
      </button>

      <button
        type="button"
        class="flex w-full cursor-pointer items-center rounded-[10px] text-left text-[16px] font-medium text-ink-2 transition-all duration-200 ease-[cubic-bezier(0.2,0.8,0.2,1)] hover:bg-surface/70 hover:text-ink"
        :class="collapsed ? 'gap-0 py-3 pl-[14px]' : 'gap-3 py-3 pl-2 pr-3'"
        title="设置"
        @click="go('/settings')"
      >
        <span class="flex w-7 shrink-0 items-center justify-center">
          <Settings
            class="text-ink-3 transition-[width,height] duration-200"
            :class="collapsed ? 'h-[26px] w-[26px]' : 'h-[22px] w-[22px]'"
            :stroke-width="2.3"
          />
        </span>
        <span
          class="min-w-0 overflow-hidden transition-opacity"
          :class="
            collapsed
              ? 'w-0 flex-none opacity-0 duration-100'
              : 'flex-1 opacity-100 duration-200'
          "
        >
          设置
        </span>
      </button>
    </div>
  </aside>
</template>
