<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import gsap from 'gsap'
import { Flip } from 'gsap/Flip'
import {
  CheckCircle2,
  Cloud,
  CloudOff,
  Loader2,
  Maximize2,
  Minimize2,
  Paperclip,
  Send,
  Trash2,
  X,
} from 'lucide-vue-next'
import { useComposerStore } from '../../stores/composer'
import { formatBytes } from '../../utils/format'
import RecipientInput from './RecipientInput.vue'
import AttachmentPicker from './AttachmentPicker.vue'
import AppButton from '../ui/AppButton.vue'

gsap.registerPlugin(Flip)

const composer = useComposerStore()
const bodyRef = ref<HTMLTextAreaElement | null>(null)
const toRef = ref<InstanceType<typeof RecipientInput> | null>(null)
/** 抽屉本体：进出场与最大化都由 GSAP 驱动，与列表中卡片展开保持同一套动效语言 */
const sheetRef = ref<HTMLElement | null>(null)

const draftLabel = computed(() => {
  switch (composer.autoSaveState) {
    case 'saving':
      return '正在保存草稿…'
    case 'saved':
      return '草稿已保存'
    case 'error':
      return '草稿保存失败'
    default:
      return '自动保存已开启'
  }
})

/**
 * 两种形态的尺寸：
 * - 收起：贴底的抽屉，桌面端 840×680（原来只有 600×560），移动端接近整屏；
 * - 最大化：铺满整个可视区，只在与屏幕边缘之间留 16px 的缝，内容跟着一起铺满；
 *   移动端整屏（顶部让出安全区）。
 * 两种形态之间用 Flip 补间，宽高与位置都是连续变化的。
 */
const sheetClass = computed(() =>
  composer.expanded
    ? ['h-full w-full rounded-none max-lg:pt-[var(--app-safe-top)]', 'sm:rounded-[18px]']
    : [
        'h-[86vh] max-h-[820px] rounded-t-[22px]',
        'sm:h-[min(680px,calc(100vh_-_4rem))] sm:w-[min(840px,calc(100vw_-_3rem))]',
      ],
)

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function sheetOf(el: Element): HTMLElement | null {
  return sheetRef.value ?? (el.firstElementChild as HTMLElement | null)
}

/** 从底部升起；结束后清掉内联样式，避免和后面的 Flip 抢 transform */
function onEnter(el: Element, done: () => void): void {
  const sheet = sheetOf(el)
  if (!sheet || prefersReducedMotion()) {
    done()
    return
  }
  gsap.fromTo(
    sheet,
    { yPercent: 100, opacity: 0 },
    {
      yPercent: 0,
      opacity: 1,
      duration: 0.46,
      ease: 'power3.out',
      onComplete: () => {
        gsap.set(sheet, { clearProps: 'transform,opacity' })
        done()
      },
    },
  )
}

function onLeave(el: Element, done: () => void): void {
  const sheet = sheetOf(el)
  if (!sheet || prefersReducedMotion()) {
    done()
    return
  }
  gsap.to(sheet, { yPercent: 100, opacity: 0, duration: 0.26, ease: 'power2.in', onComplete: done })
}

/** 收起 ⇄ 最大化：Flip 记录切换前后的矩形，宽度、高度、位置一起补间 */
async function toggleExpanded(): Promise<void> {
  const sheet = sheetRef.value
  if (!sheet) return

  gsap.killTweensOf(sheet)
  gsap.set(sheet, { clearProps: 'transform,opacity' })
  const state = prefersReducedMotion() ? null : Flip.getState(sheet)

  composer.toggleExpanded()
  await nextTick()

  if (!state) return
  Flip.from(state, {
    duration: 0.42,
    ease: 'power3.inOut',
    scale: false,
    onComplete: () => gsap.set(sheet, { clearProps: 'transform,width,height' }),
  })
}

watch(
  () => [composer.to, composer.cc, composer.bcc, composer.subject, composer.text],
  () => {
    if (composer.visible) composer.scheduleAutoSave()
  },
  { deep: true },
)

watch(
  () => composer.visible,
  (open) => {
    if (!open) return
    // 抽屉是 Teleport 渲染的，等一帧再聚焦，否则会落到顶栏搜索框
    nextTick(() => {
      setTimeout(() => {
        if (composer.to.length === 0) toRef.value?.focus()
        else bodyRef.value?.focus()
      }, 60)
    })
  },
)

async function send(): Promise<void> {
  await composer.send()
}

function onPick(files: FileList): void {
  void composer.uploadFiles(files)
}
</script>

<template>
  <Teleport to="body">
    <Transition :css="false" @enter="onEnter" @leave="onLeave">
      <div
        v-if="composer.visible"
        class="pointer-events-none fixed inset-0 z-50 flex items-end justify-center"
        :class="composer.expanded ? 'sm:p-4' : 'sm:px-5'"
      >
        <div
          ref="sheetRef"
          class="pointer-events-auto relative flex w-full flex-col overflow-hidden border border-line bg-surface shadow-[0_-20px_64px_-28px_rgb(15_21_32/0.4)] max-lg:pb-[var(--app-safe-bottom)] max-lg:pl-[var(--app-safe-left)] max-lg:pr-[var(--app-safe-right)]"
          :class="sheetClass"
          role="dialog"
          aria-modal="false"
          aria-label="撰写邮件"
        >
          <!-- 底部抽屉的抓手，最大化后不再需要 -->
          <span
            v-if="!composer.expanded"
            class="pointer-events-none absolute left-1/2 top-2 h-1 w-9 -translate-x-1/2 rounded-full bg-line-strong"
            aria-hidden="true"
          />

          <header class="shrink-0">
            <div class="flex h-[54px] w-full items-center gap-1.5 px-4 sm:px-5">
              <span class="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-ink">
                {{ composer.title }}
              </span>

              <span
                class="mr-1 hidden items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-1 text-[11px] text-ink-3 sm:flex"
              >
                <Loader2 v-if="composer.autoSaveState === 'saving'" class="h-3 w-3 animate-spin" />
                <CheckCircle2 v-else-if="composer.autoSaveState === 'saved'" class="h-3 w-3 text-teal" />
                <CloudOff v-else-if="composer.autoSaveState === 'error'" class="h-3 w-3 text-danger" />
                <Cloud v-else class="h-3 w-3" />
                {{ draftLabel }}
              </span>

              <button
                type="button"
                class="cursor-pointer rounded-lg p-2 text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
                :aria-label="composer.expanded ? '还原窗口' : '最大化'"
                v-tooltip="composer.expanded ? '还原窗口' : '最大化'"
                @click="toggleExpanded"
              >
                <component :is="composer.expanded ? Minimize2 : Maximize2" class="h-4 w-4" />
              </button>
              <button
                type="button"
                class="cursor-pointer rounded-lg p-2 text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
                aria-label="关闭并保存草稿"
                v-tooltip="'关闭并保存草稿'"
                @click="composer.close()"
              >
                <X class="h-4 w-4" />
              </button>
            </div>
          </header>

          <div class="flex min-h-0 w-full flex-1 flex-col px-4 sm:px-5">
            <RecipientInput ref="toRef" v-model="composer.to" label="收件人" />

            <div class="flex items-center gap-3 border-b border-line py-1.5">
              <button
                type="button"
                class="cursor-pointer text-[12px] text-ink-3 transition-colors hover:text-brand"
                @click="composer.showCc = !composer.showCc"
              >
                抄送 / 密送
              </button>
              <span v-if="composer.from" class="ml-auto truncate text-[11.5px] text-ink-4">
                发件人 {{ composer.from.email }}
              </span>
            </div>

            <template v-if="composer.showCc">
              <RecipientInput v-model="composer.cc" label="抄送" placeholder="可选" />
              <RecipientInput v-model="composer.bcc" label="密送" placeholder="可选" />
            </template>

            <input
              v-model="composer.subject"
              type="text"
              placeholder="邮件主题"
              class="h-11 shrink-0 border-b border-line bg-transparent text-[14px] font-medium text-ink outline-none ring-0 placeholder:font-normal placeholder:text-ink-4 focus:outline-none"
              aria-label="邮件主题"
            />

            <textarea
              ref="bodyRef"
              v-model="composer.text"
              class="min-h-[140px] flex-1 resize-none border-0 bg-transparent py-3.5 text-[14px] leading-7 text-ink outline-none ring-0 placeholder:text-ink-4 focus:outline-none"
              placeholder="写点什么…"
              aria-label="邮件正文"
            />
          </div>

          <div v-if="composer.attachments.length" class="shrink-0 border-t border-line">
            <div
              class="flex max-h-[112px] w-full flex-wrap gap-1.5 overflow-y-auto px-4 py-2.5 scroll-slim sm:px-5"
            >
              <span
                v-for="item in composer.attachments"
                :key="item.blobId"
                class="flex items-center gap-1.5 rounded-md border border-line bg-surface-2 px-2 py-1 text-[11.5px] text-ink-2"
              >
                <Paperclip class="h-3 w-3 shrink-0 text-ink-4" />
                <span class="max-w-[180px] truncate">{{ item.name }}</span>
                <span class="tabular-nums text-ink-4">{{ formatBytes(item.size) }}</span>
                <button
                  type="button"
                  class="cursor-pointer rounded p-0.5 text-ink-4 transition-colors hover:text-danger"
                  :aria-label="`移除附件 ${item.name}`"
                  v-tooltip="`移除附件 ${item.name}`"
                  @click="composer.removeAttachment(item.blobId)"
                >
                  <Trash2 class="h-3 w-3" />
                </button>
              </span>
            </div>
          </div>

          <footer class="shrink-0 border-t border-line bg-surface-2/40">
            <div class="flex h-16 w-full items-center gap-2 px-4 sm:px-5">
              <AttachmentPicker :uploading="composer.uploading" @pick="onPick" @drop="onPick" />

              <span class="ml-auto hidden text-[11.5px] text-ink-4 sm:block">
                {{ composer.to.length === 0 ? '至少填一个收件人' : `共 ${composer.to.length + composer.cc.length + composer.bcc.length} 位收件人` }}
              </span>

              <AppButton
                variant="primary"
                size="lg"
                :disabled="!composer.canSend"
                :loading="composer.sending"
                @click="send"
              >
                <template #icon>
                  <Send class="h-4 w-4" />
                </template>
                发送
              </AppButton>
            </div>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
