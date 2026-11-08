<script setup lang="ts">
import { Archive, CornerUpLeft, CornerUpRight, MailOpen, Star, Trash2 } from 'lucide-vue-next'

withDefaults(defineProps<{ starred?: boolean }>(), { starred: false })

const emit = defineEmits<{
  star: []
  unread: []
  reply: []
  forward: []
  archive: []
  remove: []
}>()
</script>

<template>
  <!--
    桌面端工具条。响应式下整条隐藏：
    星标/未读/归档/删除移到顶栏，回复/转发换成正文底部的两个悬浮胶囊。
  -->
  <div class="flex h-12 shrink-0 items-center gap-0.5 border-b border-line px-2 max-lg:hidden">
    <button
      type="button"
      class="cursor-pointer rounded-lg p-2 text-ink-2 transition-colors hover:bg-surface-2 hover:text-gold"
      :class="starred ? 'text-gold' : ''"
      :aria-label="starred ? '取消星标' : '加星标'"
      v-tooltip="starred ? '取消星标' : '加星标'"
      @click="emit('star')"
    >
      <Star class="h-4 w-4" :fill="starred ? 'currentColor' : 'none'" />
    </button>

    <button
      type="button"
      class="cursor-pointer rounded-lg p-2 text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
      aria-label="标记为未读"
      v-tooltip="'标记为未读'"
      @click="emit('unread')"
    >
      <MailOpen class="h-4 w-4" />
    </button>

    <button
      type="button"
      class="cursor-pointer rounded-lg p-2 text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
      aria-label="归档"
      v-tooltip="'归档'"
      @click="emit('archive')"
    >
      <Archive class="h-4 w-4" />
    </button>

    <button
      type="button"
      class="cursor-pointer rounded-lg p-2 text-ink-2 transition-colors hover:bg-danger/10 hover:text-danger"
      aria-label="删除"
      v-tooltip="'删除'"
      @click="emit('remove')"
    >
      <Trash2 class="h-4 w-4" />
    </button>

    <div class="mx-1 h-5 w-px bg-line" />

    <button
      type="button"
      class="flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12.5px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
      @click="emit('reply')"
    >
      <CornerUpLeft class="h-4 w-4" /> 回复
    </button>
    <button
      type="button"
      class="flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12.5px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
      @click="emit('forward')"
    >
      <CornerUpRight class="h-4 w-4" /> 转发
    </button>
  </div>
</template>
