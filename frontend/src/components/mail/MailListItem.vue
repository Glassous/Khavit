<script setup lang="ts">
import { computed } from 'vue'
import { Check, Paperclip, Star } from 'lucide-vue-next'
import type { Email } from '../../jmap/types'
import {
  avatarColor,
  formatAddress,
  formatFullTime,
  formatListTime,
  initialOf,
  truncate,
} from '../../utils/format'
import { useTopBarAutoHide } from '../../composables/useTopBarAutoHide'
import MailBody from './MailBody.vue'
import AttachmentList from './AttachmentList.vue'

const props = withDefaults(
  defineProps<{
    email: Email
    active?: boolean
    /** 是否已被选中（由翻牌的头像表示） */
    selected?: boolean
    /** 多选态：点击整行改为切换选中，而不是打开邮件 */
    selectionMode?: boolean
    compact?: boolean
    /**
     * 响应式：这一项是否就地展开成正文。
     * 展开时「标题岛」仍是列表里那一张小卡片本身（同一个组件、同一个节点），
     * 正文岛与附件岛是另外插进来的，不参与形变。
     */
    expanded?: boolean
    /** 展开时显示的完整邮件（正文可能还在加载） */
    bodyEmail?: Email | null
    bodyLoading?: boolean
    /** 别的卡片展开时，这一项先藏起来（保留占位，列表不会跳） */
    dimmed?: boolean
  }>(),
  {
    active: false,
    selected: false,
    selectionMode: false,
    compact: false,
    expanded: false,
    bodyEmail: null,
    bodyLoading: false,
    dimmed: false,
  },
)

const emit = defineEmits<{
  select: [id: string]
  'toggle-select': [id: string]
  star: [id: string, starred: boolean]
}>()

/** 展开后这一层就是滚动容器，用它的滚动量驱动顶栏与胶囊收起 */
const topBar = useTopBarAutoHide()

/** 长按选中的计时器：触屏长按 420ms 进入选中 */
const LONG_PRESS_MS = 420
/** 手指几乎不可能完全静止，抖动在这个范围内不算「移动」，否则长按永远触发不了 */
const MOVE_TOLERANCE = 10

let pressTimer: number | undefined
let startX = 0
let startY = 0
/** 本次按压已经触发过长按：松手后那一次 click 必须吞掉，否则会误开详情/误取消选中 */
let longPressFired = false

function clearPressTimer(): void {
  if (pressTimer !== undefined) {
    window.clearTimeout(pressTimer)
    pressTimer = undefined
  }
}

/** 真正进入选中，并记下标记给后面的 click 判断 */
function fireLongPress(): void {
  clearPressTimer()
  longPressFired = true
  emit('toggle-select', props.email.id)
  navigator.vibrate?.(12)
}

function onPointerDown(event: PointerEvent): void {
  // 展开态是正文页，别再进多选
  if (props.expanded) return
  // 鼠标点头像即可选中，不需要长按
  if (event.pointerType === 'mouse') return
  clearPressTimer()
  longPressFired = false
  startX = event.clientX
  startY = event.clientY
  pressTimer = window.setTimeout(fireLongPress, LONG_PRESS_MS)
}

/** 只有真的划走了才取消长按；轻微抖动不打断 */
function onPointerMove(event: PointerEvent): void {
  if (pressTimer === undefined) return
  const dx = event.clientX - startX
  const dy = event.clientY - startY
  if (Math.hypot(dx, dy) > MOVE_TOLERANCE) clearPressTimer()
}

function onPointerEnd(): void {
  clearPressTimer()
}

/**
 * 浏览器自己抢走手势（比如长按被识别成系统菜单/滚动）时会发 pointercancel。
 * 这时不能立刻放弃长按——手指往往还在原地按着，留给计时器继续跑。
 */
function onPointerCancel(event: PointerEvent): void {
  const dx = event.clientX - startX
  const dy = event.clientY - startY
  if (Math.hypot(dx, dy) > MOVE_TOLERANCE) clearPressTimer()
}

/** 系统把长按识别成菜单时也会走这里：屏蔽菜单，并当成一次长按 */
function onContextMenu(event: Event): void {
  event.preventDefault()
  if (props.expanded) return
  // 桌面端右键不参与多选
  if (window.matchMedia('(min-width: 1024px)').matches) return
  if (longPressFired) return
  fireLongPress()
}

function onRowClick(): void {
  // 展开态自己就是正文页，点正文不该再触发一次展开
  if (props.expanded) return
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

function onScroll(event: Event): void {
  if (!props.expanded) return
  topBar.handleScroll((event.target as HTMLElement).scrollTop)
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
const fullTime = computed(() => formatFullTime(props.email.receivedAt ?? props.email.sentAt))
const recipients = computed(() => {
  const list = props.email.to ?? []
  if (list.length === 0) return ''
  return list.length > 1 ? `${formatAddress(list[0])} 等 ${list.length} 人` : formatAddress(list[0])
})

/** 列表项只有 hasAttachment 标记，附件明细要等详情加载完 */
const attachments = computed(() => props.bodyEmail?.attachments ?? props.email.attachments ?? [])

/**
 * 外层：列表态只是一层普通容器（不影响列表布局），
 * 展开态变成铺满屏幕的滚动层——高度由 inset 定死，内容再多也只是滚，不会撑破屏幕。
 */
const layerClass = computed(() => {
  if (props.expanded) {
    return 'fixed inset-0 z-20 overflow-y-auto scroll-slim pl-[calc(0.5rem+var(--app-safe-left))] pr-[calc(0.5rem+var(--app-safe-right))] pb-[calc(7rem+var(--app-safe-bottom))] pt-[calc(var(--topbar-safe)+4px)]'
  }
  return props.dimmed ? 'invisible' : ''
})

/**
 * 标题岛：列表里的那一行小卡片，展开后变成正文顶部的大卡片头部。
 * 两态是同一个节点、同一套 class 的两个分支，Flip 记录的就是这两者之间的矩形差。
 */
const titleClass = computed(() => {
  if (props.expanded) {
    return [
      'grid grid-cols-[auto_1fr] content-start gap-x-3 gap-y-2 overflow-hidden',
      'rounded-[14px] bg-surface p-4 shadow-[0_1px_2px_rgb(15_21_32/0.05)]',
    ]
  }
  return [
    'relative flex cursor-pointer border-b border-line/70 px-3 transition-[background-color,border-color,border-radius] duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)]',
    'max-lg:mb-px max-lg:touch-pan-y max-lg:border max-lg:border-solid max-lg:shadow-[0_1px_2px_rgb(15_21_32/0.05)]',
    props.active || props.selected
      ? 'bg-brand-ghost max-lg:rounded-[20px] max-lg:border-transparent'
      : 'hover:bg-surface-2/70 max-lg:rounded-[14px] max-lg:border-line max-lg:bg-surface',
    unread.value ? 'is-unread' : '',
    props.compact ? 'gap-2 py-1.5' : 'gap-2.5 py-2.5',
  ]
})

const avatarClass = computed(() =>
  props.expanded
    ? 'relative mt-0.5 h-9 w-9 shrink-0 cursor-default rounded-full'
    : [
        'relative shrink-0 cursor-pointer rounded-full',
        props.compact ? 'h-6 w-6 self-center' : 'mt-0.5 h-8 w-8',
      ],
)

/** 正文岛 / 附件岛共用的卡片外观 */
const islandClass =
  'mt-2.5 rounded-[14px] bg-surface p-4 shadow-[0_1px_2px_rgb(15_21_32/0.05)]'
</script>

<template>
  <!--
    桌面端是列表行；响应式下每条邮件各自成岛（圆角 + 边框 + 间距）。
    展开时外层接管整屏滚动，标题岛本身从列表行变成正文头部的大卡片，
    正文与附件各自是独立的岛，只在末尾淡入、不参与形变。
  -->
  <div :class="layerClass" @scroll="onScroll">
    <div
      :data-mail-card="email.id"
      class="unread-bar group"
      :class="titleClass"
      @click="onRowClick"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerEnd"
      @pointercancel="onPointerCancel"
      @contextmenu="onContextMenu"
    >
      <!--
        头像：点一下即切换选中；选中时绕 Y 轴翻牌到背面（对号）。
        正反两面都是圆，preserve-3d + backface-visibility:hidden 保证同一时刻只看到一面。
        data-flip-inner：展开/收起时这块跟着一起补位移，视觉上是「同一个头像飘过去了」。
      -->
      <button
        type="button"
        data-flip-inner
        :class="avatarClass"
        :aria-label="expanded ? '邮件发件人' : selected ? '取消选择这封邮件' : '选择这封邮件'"
        :aria-pressed="selected"
        @click.stop="!expanded && emit('toggle-select', email.id)"
      >
        <span class="block h-full w-full [perspective:220px]">
          <span
            class="relative block h-full w-full transition-transform duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] [transform-style:preserve-3d]"
            :class="selected && !expanded ? '[transform:rotateY(180deg)]' : ''"
          >
            <span
              class="absolute inset-0 flex items-center justify-center rounded-full font-semibold text-white/95 [backface-visibility:hidden]"
              :class="[color, compact && !expanded ? 'text-[11px]' : 'text-[12px]']"
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
            :class="
              expanded
                ? 'text-[13.5px] font-medium text-ink'
                : unread
                  ? 'font-semibold text-ink'
                  : 'font-medium text-ink-2'
            "
          >
            {{ senderLabel }}
          </span>
          <span class="shrink-0 text-[11.5px] tabular-nums text-ink-3">{{ expanded ? fullTime : time }}</span>
        </div>

        <div class="flex items-start gap-1.5" :class="compact && !expanded ? 'mt-0' : 'mt-0.5'">
          <span
            class="min-w-0 flex-1 text-[13px]"
            :class="
              expanded
                ? 'text-[17px] font-semibold leading-snug tracking-tight text-ink'
                : ['truncate', unread ? 'font-medium text-ink' : 'text-ink-2']
            "
          >
            {{ subject }}
          </span>
          <span
            v-if="isDraft"
            class="shrink-0 rounded border border-amber/30 bg-amber/10 px-1 text-[10px] leading-4 text-amber"
          >
            草稿
          </span>
          <Paperclip v-if="email.hasAttachment" class="mt-1 h-3.5 w-3.5 shrink-0 text-ink-4" />
          <button
            type="button"
            class="shrink-0 cursor-pointer rounded p-0.5 transition-colors"
            :class="
              starred
                ? 'text-gold'
                : expanded
                  ? 'text-ink-4 hover:text-gold'
                  : 'text-ink-4 opacity-0 hover:text-gold group-hover:opacity-100'
            "
            :aria-label="starred ? '取消星标' : '加星标'"
            v-tooltip="starred ? '取消星标' : '加星标'"
            @click.stop="emit('star', email.id, !starred)"
          >
            <Star class="h-3.5 w-3.5" :fill="starred ? 'currentColor' : 'none'" />
          </button>
        </div>

        <!-- 紧凑模式只留发件人 + 主题两行，一屏能多看近一倍；展开时这两行也让位给正文 -->
        <p v-if="!compact && !expanded" class="mt-0.5 truncate text-[12px] leading-relaxed text-ink-3">
          <span v-if="email.mailboxIds && Object.keys(email.mailboxIds).length > 1" class="mr-1 text-ink-4">·</span>
          <span v-if="recipients" class="text-ink-4">致 {{ recipients }} · </span>{{ preview || '（无内容摘要）' }}
        </p>

        <p v-if="expanded" class="mt-1 text-[11.5px] text-ink-4">
          <span v-if="recipients">发送给 {{ recipients }}</span>
        </p>
      </div>
    </div>

    <!-- 正文岛：独立卡片，标题岛变形的过程中不可见，等形变结束再淡入 -->
    <section v-if="expanded" :class="[islandClass, 'animate-island-in']">
      <MailBody :email="bodyEmail" :loading="bodyLoading" />
    </section>

    <!-- 附件岛：有附件才出现，同样是独立卡片 -->
    <section v-if="expanded && attachments.length" :class="[islandClass, 'animate-island-in']">
      <p class="mb-2 flex items-center gap-1.5 text-[11.5px] text-ink-4">
        <Paperclip class="h-3 w-3" /> 附件 {{ attachments.length }} 个
      </p>
      <AttachmentList :attachments="attachments" flush />
    </section>
  </div>
</template>
