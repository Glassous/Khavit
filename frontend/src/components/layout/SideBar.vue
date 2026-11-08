<script setup lang="ts">
import { computed, ref, watch } from 'vue'
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
import BrandMark from '../ui/BrandMark.vue'
import { useSidebar } from '../../composables/useSidebar'
import { useIslandPanel } from '../../composables/useIslandPanel'
import type { IslandPanel } from '../../utils/panel'
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
const { isDesktop, drawerOpen, closeDrawer, drawerDragging, drawerDrag } = useSidebar()
const { panel, toggle: togglePanel } = useIslandPanel()

/* ---------------------------------- 手势 ---------------------------------- */

/**
 * 抽屉打开时可以用手指拖着收起：位置实时跟手，松手后按位移/速度决定关闭还是弹回。
 * 只在触屏、且抽屉已打开时生效；竖直方向的手势交还给页面滚动（见 touch-pan-y）。
 */
const asideRef = ref<HTMLElement | null>(null)
const dragging = ref(false)
/** 相对打开位置的横向位移，始终 <= 0（向左为负） */
const dragOffset = ref(0)

/**
 * 遮罩的明暗：抽屉完全打开时为 1，关闭动画把它滚回 0。
 * 放在内层元素上，跟手拖动时可以直接改透明度而不影响外层。
 */
const maskOpacity = ref(0)
/** 松手回弹 / 开关时给遮罩加过渡；跟手阶段不加，否则会拖不动 */
const maskSmooth = ref(false)

/** 实际显示的不透明度：右滑拉出时直接取手势进度，其余情况用上面的目标值 */
const maskLevel = computed(() => {
  if (!drawerDragging.value) return maskOpacity.value
  const width = asideRef.value?.offsetWidth ?? 320
  return Math.min(1, drawerDrag.value / width)
})

/** 抽屉的实时位移：右滑拉出从 -100% 开始跟手，左滑收起从 0 开始跟手 */
const asideStyle = computed(() => {
  if (drawerDragging.value) return { translate: `calc(-100% + ${drawerDrag.value}px) 0` }
  if (dragging.value) return { translate: `${dragOffset.value}px 0` }
  return undefined
})

watch(
  () => props.open,
  (open) => {
    // 手势提交时抽屉已经贴手到位，不需要再淡入
    maskSmooth.value = !drawerDragging.value
    maskOpacity.value = open ? 1 : 0
  },
)

watch(drawerDragging, (isDragging) => {
  if (isDragging) {
    maskSmooth.value = false
    return
  }
  // 没拉到位就松手：抽屉缩回去，遮罩跟着淡出
  if (!props.open) maskSmooth.value = true
})

const AXIS_LOCK = 6
let startX = 0
let startY = 0
let startedAt = 0
let movedX = 0
let axis: 'none' | 'x' | 'y' = 'none'

function onDragStart(event: PointerEvent): void {
  if (isDesktop.value || !props.open || event.pointerType === 'mouse') return
  dragging.value = true
  dragOffset.value = 0
  maskSmooth.value = false
  startX = event.clientX
  startY = event.clientY
  startedAt = performance.now()
  movedX = 0
  axis = 'none'
  // 捕获指针，手指滑出抽屉范围也能继续跟手
  try {
    asideRef.value?.setPointerCapture(event.pointerId)
  } catch {
    /* 个别浏览器/合成事件不支持捕获，退化为普通监听即可 */
  }
}

function onDragMove(event: PointerEvent): void {
  if (!dragging.value) return
  const dx = event.clientX - startX
  const dy = event.clientY - startY

  // 先判定主轴：横向意图优先（斜着划也能拖起来），只有明显竖向时才放弃、交还页面滚动
  if (axis === 'none') {
    if (Math.abs(dx) < AXIS_LOCK) return
    axis = Math.abs(dx) >= Math.abs(dy) * 0.6 ? 'x' : 'y'
    if (axis === 'y') {
      dragging.value = false
      dragOffset.value = 0
      return
    }
  }
  if (axis !== 'x') return

  movedX = Math.max(movedX, Math.abs(dx))
  // 只允许往左拖（收起方向）
  dragOffset.value = Math.min(0, dx)
  // 遮罩跟着抽屉位置一起变淡：抽屉移出多少，背景就露出多少
  const width = asideRef.value?.offsetWidth ?? 320
  maskOpacity.value = Math.max(0, 1 + dragOffset.value / width)
}

function onDragEnd(): void {
  if (!dragging.value) return
  dragging.value = false

  const offset = dragOffset.value
  const elapsed = Math.max(1, performance.now() - startedAt)
  // 速度按「向左为正」算，快速甩一下也能关闭
  const velocity = -offset / elapsed
  const width = asideRef.value?.offsetWidth ?? 320
  dragOffset.value = 0

  // 阈值放低一点：轻扫一下就够关，不必拖满半个抽屉
  const shouldClose = -offset > Math.min(width * 0.22, 48) || velocity > 0.3
  if (shouldClose) {
    // 遮罩保持松手时的透明度，由 open → false 的监听接着淡出
    emit('close')
    return
  }

  // 没到阈值：抽屉弹回原位，遮罩平滑恢复全暗
  maskSmooth.value = true
  maskOpacity.value = 1
}

/** 拖拽结束时浏览器还会补一次 click，这里拦掉，避免误触侧栏里的按钮 */
function onClickCapture(event: MouseEvent): void {
  if (movedX > 8) {
    event.stopPropagation()
    event.preventDefault()
    movedX = 0
  }
}

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
  // 面板盖在邮件列表上时，文件夹不再算「当前在看」，避免两处同时高亮
  if (route.name !== 'mail' || panel.value) return false
  const current = route.params.mailbox as string | undefined
  if (!current) return box.role === 'inbox'
  return current === slugOf(box)
}

/**
 * 抽屉是移动端的返回键守卫层：导航前必须先把抽屉（连同守卫记录）关干净，
 * 否则历史里会留下一条「假记录」，之后按返回会退回旧文件夹。
 * 面板打开时用 replace 换文件夹，避免在历史里留下可回退的面板记录。
 */
async function select(box: Mailbox): Promise<void> {
  if (drawerOpen.value) await closeDrawer()
  const path = `/mail/${slugOf(box)}`
  if (panel.value) await router.replace(path)
  else await router.push(path)
  await mail.selectMailbox(box.id)
}

/** 回邮箱首页：与选文件夹同理，先收抽屉再导航 */
async function goHome(): Promise<void> {
  if (drawerOpen.value) await closeDrawer()
  if (panel.value) await router.replace('/mail')
  else await router.push('/mail')
}

async function compose(): Promise<void> {
  if (drawerOpen.value) await closeDrawer()
  composer.openNew()
}

/** 设置与管理后台是岛内面板：在这里打开/收起，不跳页 */
async function openPanel(next: IslandPanel): Promise<void> {
  if (drawerOpen.value) await closeDrawer()
  await togglePanel(next)
}
</script>

<template>
  <!--
    移动端遮罩：常驻一层，透明度跟着抽屉位置走——
    点击遮罩 / 返回键开关时 200ms 淡入淡出；右滑拉出、左滑收起时跟手变化，不加过渡。
  -->
  <div
    class="fixed inset-0 z-30 lg:hidden"
    :class="maskLevel > 0 ? 'pointer-events-auto' : 'pointer-events-none'"
    @click="emit('close')"
  >
    <div
      class="absolute inset-0 bg-ink/30 dark:bg-black/60"
      :class="[
        maskLevel > 0 ? 'backdrop-blur-[1px]' : '',
        maskSmooth ? 'transition-opacity duration-200 ease-[cubic-bezier(0.2,0.8,0.2,1)]' : '',
      ]"
      :style="{ opacity: maskLevel }"
    />
  </div>

  <!--
    宽度与文字同步过渡：文字用更短的时长淡出/淡入（100ms），
    到宽度动画结束时文字早已消失，不会出现被挤压的中间态。
    响应式下抽屉从左侧滑入/滑出（300ms），宽度放宽到 320px（窄屏按 86vw 收窄）；
    手指拖动时临时关掉过渡直接跟手，松手后再恢复过渡做收尾动画。

    注意：Tailwind v4 的 translate-* 生成的是 `translate` 属性而不是 `transform`，
    过渡属性里必须带上 translate，否则抽屉是「瞬移」而不是滑动。
  -->
  <aside
    ref="asideRef"
    class="z-40 flex h-full shrink-0 flex-col bg-canvas-deep pl-[var(--app-safe-left)] pr-[var(--app-safe-right)] pt-[var(--app-safe-top)] pb-[var(--app-safe-bottom)] transition-[width,transform,translate] duration-200 ease-[cubic-bezier(0.2,0.8,0.2,1)] max-lg:fixed max-lg:inset-y-0 max-lg:left-0 max-lg:w-[min(320px,86vw)] max-lg:touch-pan-y max-lg:duration-300 max-lg:ease-[cubic-bezier(0.32,0.72,0,1)]"
    :class="[
      collapsed ? 'w-[80px]' : 'w-[264px]',
      open ? 'max-lg:translate-x-0' : 'max-lg:-translate-x-full',
      dragging || drawerDragging ? 'max-lg:transition-none' : '',
    ]"
    :style="asideStyle"
    @pointerdown="onDragStart"
    @pointermove="onDragMove"
    @pointerup="onDragEnd"
    @pointercancel="onDragEnd"
    @click.capture="onClickCapture"
  >
    <!--
      响应式下顶栏不再显示品牌图标，图标挪到抽屉的第一行（只留标记，不放文字）；
      桌面端仍由顶栏承担，这里只在抽屉里出现。
    -->
    <div class="flex items-center px-3 pt-3 lg:hidden">
      <button
        type="button"
        class="flex cursor-pointer items-center rounded-[10px] p-1"
        aria-label="Khavit 邮箱"
        @click="goHome"
      >
        <BrandMark class="h-7 w-7 text-brand" />
      </button>
    </div>

    <div class="px-3 pb-1 pt-4 max-lg:pt-2">
      <button
        type="button"
        class="group flex h-12 w-full cursor-pointer items-center justify-start gap-3 rounded-xl bg-brand text-[15px] font-medium text-white transition-all duration-150 hover:bg-brand-strong active:translate-y-[0.5px] dark:hover:bg-brand-soft"
        :class="collapsed ? 'pl-[14px]' : 'pl-2 pr-3'"
        v-tooltip="collapsed ? '撰写邮件' : undefined"
        @click="compose"
      >
        <span class="flex w-7 shrink-0 items-center justify-center">
          <PenLine
            class="transition-[width,height] duration-200"
            :class="collapsed ? 'h-[22px] w-[22px]' : 'h-[19px] w-[19px]'"
            :stroke-width="2.1"
          />
        </span>
        <!--
          文字始终贴左，图标位置固定，不会因为文字收起/展开而漂移。
          文字宽度一起过渡：收起瞬间直接消失会留下一个宽度跳变。
        -->
        <span
          class="flex items-center overflow-hidden whitespace-nowrap transition-[max-width,opacity] duration-200 ease-[cubic-bezier(0.2,0.8,0.2,1)]"
          :class="collapsed ? 'max-w-0 opacity-0' : 'max-w-[96px] opacity-100'"
        >
          <span>撰写邮件</span>
          <!-- 快捷键只在桌面端显示：响应式下没有实体键盘 -->
          <span class="ml-2 rounded border border-white/25 px-1 text-[10px] text-white/70 max-lg:hidden">C</span>
        </span>
      </button>
    </div>

    <!--
      touch-pan-y 必须也加在滚动容器上：浏览器计算 touch-action 时只向上找「最近的滚动祖先」，
      抽屉本身不在链上，所以只给 aside 写是不够的，横向拖动会被当成页面平移而触发 pointercancel。
    -->
    <nav class="flex-1 overflow-y-auto px-3 py-2 scroll-slim max-lg:touch-pan-y" aria-label="邮箱文件夹">
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
        v-tooltip="collapsed ? mailboxLabel(box) : undefined"
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

    <!--
      底部操作：设置固定在最下方。
      两个入口打开的都是「岛内面板」（?panel=…），当前打开的那一项就地高亮。
    -->
    <div class="px-3 pb-3 pt-1">
      <button
        v-if="auth.admin"
        type="button"
        class="mb-1 flex w-full cursor-pointer items-center rounded-[10px] text-left text-[15px] transition-all duration-200 ease-[cubic-bezier(0.2,0.8,0.2,1)]"
        :class="[
          collapsed ? 'gap-0 py-2.5 pl-[14px]' : 'gap-3 py-2.5 pl-2 pr-3',
          panel === 'admin'
            ? 'bg-surface font-medium text-ink'
            : 'text-ink-2 hover:bg-surface/70 hover:text-ink',
        ]"
        :aria-pressed="panel === 'admin'"
        v-tooltip="collapsed ? '管理后台' : undefined"
        @click="openPanel('admin')"
      >
        <span class="flex w-7 shrink-0 items-center justify-center">
          <ShieldCheck
            class="transition-[width,height] duration-200"
            :class="[collapsed ? 'h-6 w-6' : 'h-5 w-5', panel === 'admin' ? 'text-brand' : 'text-ink-3']"
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
        class="flex w-full cursor-pointer items-center rounded-[10px] text-left text-[16px] font-medium transition-all duration-200 ease-[cubic-bezier(0.2,0.8,0.2,1)]"
        :class="[
          collapsed ? 'gap-0 py-3 pl-[14px]' : 'gap-3 py-3 pl-2 pr-3',
          panel === 'settings'
            ? 'bg-surface text-ink'
            : 'text-ink-2 hover:bg-surface/70 hover:text-ink',
        ]"
        :aria-pressed="panel === 'settings'"
        v-tooltip="collapsed ? '设置' : undefined"
        @click="openPanel('settings')"
      >
        <span class="flex w-7 shrink-0 items-center justify-center">
          <Settings
            class="transition-[width,height] duration-200"
            :class="[
              collapsed ? 'h-[26px] w-[26px]' : 'h-[22px] w-[22px]',
              panel === 'settings' ? 'text-brand' : 'text-ink-3',
            ]"
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
