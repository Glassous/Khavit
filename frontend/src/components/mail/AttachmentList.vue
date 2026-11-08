<script setup lang="ts">
import { ref } from 'vue'
import { Download, FileText, Image as ImageIcon, Loader2 } from 'lucide-vue-next'
import type { Attachment } from '../../jmap/types'
import { jmap } from '../../jmap/client'
import { formatBytes } from '../../utils/format'
import { useToast } from '../../composables/useToast'

const props = defineProps<{ attachments: Attachment[] }>()

const toast = useToast()
const downloading = ref<string | null>(null)

function iconOf(type: string): unknown {
  return type?.startsWith('image/') ? ImageIcon : FileText
}

async function download(item: Attachment): Promise<void> {
  downloading.value = item.blobId
  const name = item.name?.trim() || `附件-${item.partId}`

  try {
    const blob = await jmap.downloadBlob(item.blobId, name, item.type)
    const objectUrl = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = objectUrl
    link.download = name
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(objectUrl), 2000)
  } catch (err) {
    console.error('[attachment] 下载失败', err)
    toast.error('附件下载失败', name)
  } finally {
    downloading.value = null
  }
}
</script>

<template>
  <div v-if="attachments.length" class="flex flex-wrap gap-1.5 border-b border-line px-4 py-2.5 sm:px-6">
    <button
      v-for="item in attachments"
      :key="item.partId"
      type="button"
      class="group flex cursor-pointer items-center gap-2 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-left transition-colors hover:border-brand/40 hover:bg-brand-ghost/40"
      v-tooltip="`下载 ${item.name ?? ''}`"
      @click="download(item)"
    >
      <component :is="iconOf(item.type)" class="h-3.5 w-3.5 shrink-0 text-ink-3" />
      <span class="max-w-[160px] truncate text-[12px] text-ink-2">{{ item.name?.trim() || '未命名附件' }}</span>
      <span class="shrink-0 text-[11px] tabular-nums text-ink-4">{{ formatBytes(item.size) }}</span>
      <Loader2 v-if="downloading === item.blobId" class="h-3.5 w-3.5 animate-spin text-brand" />
      <Download v-else class="h-3.5 w-3.5 text-ink-4 transition-colors group-hover:text-brand" />
    </button>
  </div>
</template>
