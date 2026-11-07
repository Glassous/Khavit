<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { CheckCircle2, ChevronDown, ChevronUp, Cloud, CloudOff, Loader2, Paperclip, Send, Trash2, X } from 'lucide-vue-next'
import { useComposerStore } from '../../stores/composer'
import { formatBytes } from '../../utils/format'
import RecipientInput from './RecipientInput.vue'
import AttachmentPicker from './AttachmentPicker.vue'
import AppButton from '../ui/AppButton.vue'

const composer = useComposerStore()
const bodyRef = ref<HTMLTextAreaElement | null>(null)
const toRef = ref<InstanceType<typeof RecipientInput> | null>(null)

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
    <Transition
      enter-active-class="transition duration-200 ease-[cubic-bezier(0.2,0.8,0.2,1)]"
      enter-from-class="opacity-0 translate-y-4"
      leave-active-class="transition duration-150"
      leave-to-class="opacity-0 translate-y-3"
    >
      <div
        v-if="composer.visible"
        class="fixed z-50 flex flex-col overflow-hidden border border-line bg-surface shadow-[0_32px_96px_-32px_rgb(15_21_32/0.55)]"
        :class="
          composer.expanded
            ? 'inset-3 rounded-2xl sm:inset-6'
            : 'bottom-0 right-0 h-[560px] w-full rounded-t-2xl sm:bottom-4 sm:right-6 sm:w-[600px] sm:rounded-2xl'
        "
        role="dialog"
        aria-modal="false"
        aria-label="撰写邮件"
      >
        <header class="flex h-11 shrink-0 items-center gap-2 border-b border-line bg-surface-2/70 px-3">
          <span class="flex-1 truncate text-[13px] font-medium text-ink">{{ composer.title }}</span>

          <span class="hidden items-center gap-1 text-[11px] text-ink-3 sm:flex">
            <Loader2 v-if="composer.autoSaveState === 'saving'" class="h-3 w-3 animate-spin" />
            <CheckCircle2 v-else-if="composer.autoSaveState === 'saved'" class="h-3 w-3 text-teal" />
            <CloudOff v-else-if="composer.autoSaveState === 'error'" class="h-3 w-3 text-danger" />
            <Cloud v-else class="h-3 w-3" />
            {{ draftLabel }}
          </span>

          <button
            type="button"
            class="cursor-pointer rounded-md p-1.5 text-ink-3 transition-colors hover:bg-surface-3 hover:text-ink"
            :aria-label="composer.expanded ? '还原窗口' : '最大化'"
            @click="composer.expanded = !composer.expanded"
          >
            <component :is="composer.expanded ? ChevronDown : ChevronUp" class="h-4 w-4" />
          </button>
          <button
            type="button"
            class="cursor-pointer rounded-md p-1.5 text-ink-3 transition-colors hover:bg-surface-3 hover:text-ink"
            aria-label="关闭并保存草稿"
            @click="composer.close()"
          >
            <X class="h-4 w-4" />
          </button>
        </header>

        <div class="flex min-h-0 flex-1 flex-col px-3">
          <RecipientInput ref="toRef" v-model="composer.to" label="收件人" />

          <div class="flex items-center gap-3 border-b border-line py-1">
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
            class="h-10 shrink-0 border-b border-line bg-transparent text-[13.5px] font-medium text-ink outline-none ring-0 placeholder:font-normal placeholder:text-ink-4 focus:outline-none"
            aria-label="邮件主题"
          />

          <textarea
            ref="bodyRef"
            v-model="composer.text"
            class="min-h-0 flex-1 resize-none border-0 bg-transparent py-3 text-[13.5px] leading-relaxed text-ink outline-none ring-0 placeholder:text-ink-4 focus:outline-none"
            placeholder="写点什么…"
            aria-label="邮件正文"
          />
        </div>

        <div v-if="composer.attachments.length" class="max-h-[104px] shrink-0 overflow-y-auto border-t border-line px-3 py-2 scroll-slim">
          <div class="flex flex-wrap gap-1.5">
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
                @click="composer.removeAttachment(item.blobId)"
              >
                <Trash2 class="h-3 w-3" />
              </button>
            </span>
          </div>
        </div>

        <footer class="flex h-14 shrink-0 items-center gap-2 border-t border-line px-3">
          <AttachmentPicker :uploading="composer.uploading" @pick="onPick" @drop="onPick" />

          <span class="ml-auto hidden text-[11px] text-ink-4 sm:block">
            {{ composer.to.length === 0 ? '至少填一个收件人' : `共 ${composer.to.length + composer.cc.length + composer.bcc.length} 位收件人` }}
          </span>

          <AppButton
            variant="primary"
            :disabled="!composer.canSend"
            :loading="composer.sending"
            @click="send"
          >
            <template #icon>
              <Send class="h-3.5 w-3.5" />
            </template>
            发送
          </AppButton>
        </footer>
      </div>
    </Transition>
  </Teleport>
</template>
