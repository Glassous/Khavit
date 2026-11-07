<script setup lang="ts">
import { ref } from 'vue'
import { Loader2, Paperclip } from 'lucide-vue-next'

defineProps<{ uploading: boolean }>()
const emit = defineEmits<{ pick: [files: FileList]; drop: [files: FileList] }>()

const inputRef = ref<HTMLInputElement | null>(null)
const dragging = ref(false)

function open(): void {
  inputRef.value?.click()
}

function onChange(event: Event): void {
  const input = event.target as HTMLInputElement
  if (input.files?.length) emit('pick', input.files)
  input.value = ''
}

function onDrop(event: DragEvent): void {
  dragging.value = false
  const files = event.dataTransfer?.files
  if (files?.length) emit('drop', files)
}
</script>

<template>
  <div
    class="relative"
    @dragover.prevent="dragging = true"
    @dragleave.prevent="dragging = false"
    @drop.prevent="onDrop"
  >
    <button
      type="button"
      class="flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1.5 text-[12.5px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
      :disabled="uploading"
      @click="open"
    >
      <Loader2 v-if="uploading" class="h-4 w-4 animate-spin text-brand" />
      <Paperclip v-else class="h-4 w-4" />
      {{ uploading ? '上传中…' : '添加附件' }}
    </button>

    <input ref="inputRef" type="file" multiple class="hidden" @change="onChange" />

    <div
      v-if="dragging"
      class="pointer-events-none absolute -inset-x-3 -inset-y-2 flex items-center justify-center rounded-lg border border-dashed border-brand bg-brand-ghost/80 text-[12px] font-medium text-brand"
    >
      松开即可添加附件
    </div>
  </div>
</template>
