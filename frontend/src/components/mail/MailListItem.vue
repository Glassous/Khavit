<script setup lang="ts">
import { computed } from 'vue'
import { Paperclip, Star } from 'lucide-vue-next'
import type { Email } from '../../jmap/types'
import { avatarColor, formatAddress, formatListTime, initialOf, truncate } from '../../utils/format'

const props = withDefaults(
  defineProps<{
    email: Email
    active?: boolean
    checked?: boolean
    compact?: boolean
  }>(),
  { active: false, checked: false, compact: false },
)

const emit = defineEmits<{
  select: [id: string]
  star: [id: string, starred: boolean]
  check: [id: string, checked: boolean]
}>()

const sender = computed(() => props.email.from?.[0] ?? null)
const senderLabel = computed(() => formatAddress(sender.value) || '未知发件人')
const initial = computed(() => initialOf(sender.value?.name || sender.value?.email))
const color = computed(() => avatarColor(props.email.from?.[0]?.email ?? 'unknown'))
const unread = computed(() => !props.email.keywords?.$seen)
const starred = computed(() => Boolean(props.email.keywords?.$flagged))
const isDraft = computed(() => Boolean(props.email.keywords?.$draft))
const subject = computed(() => props.email.subject?.trim() || '(无主题)')
const preview = computed(() => truncate(props.email.preview ?? '', 96))
const time = computed(() => formatListTime(props.email.receivedAt ?? props.email.sentAt))
const recipients = computed(() => {
  const list = props.email.to ?? []
  if (list.length === 0) return ''
  return list.length > 1 ? `${formatAddress(list[0])} 等 ${list.length} 人` : formatAddress(list[0])
})
</script>

<template>
  <div
    class="unread-bar group relative flex cursor-pointer gap-2.5 border-b border-line/70 px-3 transition-colors duration-150"
    :class="[
      active ? 'bg-brand-ghost' : 'hover:bg-surface-2/70',
      unread ? 'is-unread' : '',
      compact ? 'py-2' : 'py-2.5',
    ]"
    @click="emit('select', email.id)"
  >
    <div class="flex shrink-0 items-start pt-0.5">
      <input
        type="checkbox"
        :checked="checked"
        class="h-3.5 w-3.5 cursor-pointer rounded border-line-strong text-brand accent-brand opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
        :class="checked ? 'opacity-100' : ''"
        :aria-label="`选择邮件：${subject}`"
        @click.stop
        @change="emit('check', email.id, ($event.target as HTMLInputElement).checked)"
      />
    </div>

    <span
      class="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold text-white/95"
      :class="color"
    >
      {{ initial }}
    </span>

    <div class="min-w-0 flex-1">
      <div class="flex items-baseline gap-2">
        <span
          class="min-w-0 flex-1 truncate text-[13px]"
          :class="unread ? 'font-semibold text-ink' : 'font-medium text-ink-2'"
        >
          {{ senderLabel }}
        </span>
        <span class="shrink-0 text-[11.5px] tabular-nums text-ink-3">{{ time }}</span>
      </div>

      <div class="mt-0.5 flex items-center gap-1.5">
        <span
          class="min-w-0 flex-1 truncate text-[13px]"
          :class="unread ? 'font-medium text-ink' : 'text-ink-2'"
        >
          {{ subject }}
        </span>
        <span
          v-if="isDraft"
          class="shrink-0 rounded border border-amber/30 bg-amber/10 px-1 text-[10px] leading-4 text-amber"
        >
          草稿
        </span>
        <Paperclip v-if="email.hasAttachment" class="h-3.5 w-3.5 shrink-0 text-ink-4" />
        <button
          type="button"
          class="shrink-0 cursor-pointer rounded p-0.5 transition-colors"
          :class="starred ? 'text-gold' : 'text-ink-4 opacity-0 hover:text-gold group-hover:opacity-100'"
          :aria-label="starred ? '取消星标' : '加星标'"
          v-tooltip="starred ? '取消星标' : '加星标'"
          @click.stop="emit('star', email.id, !starred)"
        >
          <Star class="h-3.5 w-3.5" :fill="starred ? 'currentColor' : 'none'" />
        </button>
      </div>

      <p class="mt-0.5 truncate text-[12px] leading-relaxed text-ink-3">
        <span v-if="email.mailboxIds && Object.keys(email.mailboxIds).length > 1" class="mr-1 text-ink-4">·</span>
        <span v-if="recipients" class="text-ink-4">致 {{ recipients }} · </span>{{ preview || '（无内容摘要）' }}
      </p>
    </div>
  </div>
</template>
