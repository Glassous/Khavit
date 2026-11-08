<script setup lang="ts">
import { computed } from 'vue'
import { Check, Paperclip, Star } from 'lucide-vue-next'
import type { Email } from '../../jmap/types'
import { avatarColor, formatAddress, formatListTime, initialOf, truncate } from '../../utils/format'

const props = withDefaults(
  defineProps<{
    email: Email
    active?: boolean
    checked?: boolean
    /** 是否已被选中（响应式下由翻牌的头像表示） */
    selected?: boolean
    /** 多选态：点击整行改为切换选中，而不是打开邮件 */
    selectionMode?: boolean
    compact?: boolean
  }>(),
  { active: false, checked: false, selected: false, selectionMode: false, compact: false },
)

const emit = defineEmits<{
  select: [id: string]
  'toggle-select': [id: string]
  star: [id: string, starred: boolean]
  check: [id: string, checked: boolean]
}>()

/** 长按选中的计时器：触屏长按 420ms 进入选中 */
const LONG_PRESS_MS = 420
let pressTimer: number | undefined
/** 本次按压已经触发过长按：松手后那一次 click 必须吞掉，否则会误开详情/误取消选中 */
let longPressFired = false

function clearPressTimer(): void {
  if (pressTimer !== undefined) {
    window.clearTimeout(pressTimer)
    pressTimer = undefined
  }
}

function onPointerDown(event: PointerEvent): void {
  // 鼠标有勾选框与头像可点，不需要长按
  if (event.pointerType === 'mouse') return
  clearPressTimer()
  longPressFired = false
  pressTimer = window.setTimeout(() => {
    longPressFired = true
    emit('toggle-select', props.email.id)
    navigator.vibrate?.(12)
  }, LONG_PRESS_MS)
}

function onRowClick(): void {
  // 长按已经切换过选中，随后的 click 直接吞掉（按住越久越容易漏，所以按标记判断而不是时间差）
  if (longPressFired) {
    longPressFired = false
    return
  }
  // 多选态下整行点击只切换选中，绝不进入详情
  if (props.selectionMode) {
    emit('toggle-select', props.email.id)
    return
  }
  emit('select', props.email.id)
}

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
  <!--
    桌面端是列表行；响应式下每条邮件各自成岛（圆角 + 边框 + 间距）。
    选中时换成品牌浅底、去掉描边、圆角收小，和未选中拉开差距。
    底色/边框色都写在状态分支里——基础类里的 max-lg: 变体优先级更高，会盖掉状态色。
  -->
  <div
    class="unread-bar group relative flex cursor-pointer border-b border-line/70 px-3 transition-[background-color,border-color,border-radius] duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] max-lg:mb-px max-lg:border max-lg:border-solid max-lg:shadow-[0_1px_2px_rgb(15_21_32/0.05)]"
    :class="[
      active || selected
        ? 'bg-brand-ghost max-lg:rounded-[20px] max-lg:border-transparent'
        : 'hover:bg-surface-2/70 max-lg:rounded-[14px] max-lg:border-line max-lg:bg-surface',
      unread ? 'is-unread' : '',
      compact ? 'gap-2 py-1.5' : 'gap-2.5 py-2.5',
    ]"
    @click="onRowClick"
    @pointerdown="onPointerDown"
    @pointerup="clearPressTimer"
    @pointercancel="clearPressTimer"
    @pointermove="clearPressTimer"
    @pointerleave="clearPressTimer"
  >
    <!--
      勾选框只在 hover 时显形，触屏上既看不见也点不准，
      响应式下直接让出这一列，头像才能贴近左侧边缘。
    -->
    <div class="flex shrink-0 items-start max-lg:hidden" :class="compact ? 'pt-0' : 'pt-0.5'">
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

    <!--
      头像：点一下即切换选中；选中时绕 Y 轴翻牌到背面（对号）。
      正反两面都是圆，preserve-3d + backface-visibility:hidden 保证同一时刻只看到一面。
    -->
    <button
      type="button"
      class="relative shrink-0 cursor-pointer rounded-full"
      :class="compact ? 'h-6 w-6 self-center' : 'mt-0.5 h-8 w-8'"
      :aria-label="selected ? '取消选择这封邮件' : '选择这封邮件'"
      :aria-pressed="selected"
      @click.stop="emit('toggle-select', email.id)"
    >
      <span class="block h-full w-full [perspective:220px]">
        <span
          class="relative block h-full w-full transition-transform duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] [transform-style:preserve-3d]"
          :class="selected ? '[transform:rotateY(180deg)]' : ''"
        >
          <span
            class="absolute inset-0 flex items-center justify-center rounded-full font-semibold text-white/95 [backface-visibility:hidden]"
            :class="[color, compact ? 'text-[11px]' : 'text-[12px]']"
          >
            {{ initial }}
          </span>
          <span
            class="absolute inset-0 flex items-center justify-center rounded-full bg-brand text-white [backface-visibility:hidden] [transform:rotateY(180deg)]"
          >
            <Check :class="compact ? 'h-3.5 w-3.5' : 'h-[18px] w-[18px]'" :stroke-width="3" />
          </span>
        </span>
      </span>
    </button>

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

      <div class="flex items-center gap-1.5" :class="compact ? 'mt-0' : 'mt-0.5'">
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

      <!-- 紧凑模式只留发件人 + 主题两行，一屏能多看近一倍 -->
      <p v-if="!compact" class="mt-0.5 truncate text-[12px] leading-relaxed text-ink-3">
        <span v-if="email.mailboxIds && Object.keys(email.mailboxIds).length > 1" class="mr-1 text-ink-4">·</span>
        <span v-if="recipients" class="text-ink-4">致 {{ recipients }} · </span>{{ preview || '（无内容摘要）' }}
      </p>
    </div>
  </div>
</template>
