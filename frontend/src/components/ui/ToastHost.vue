<script setup lang="ts">
import { AlertCircle, CheckCircle2, Info, TriangleAlert, X } from 'lucide-vue-next'
import { useToast, type ToastTone } from '../../composables/useToast'

const { items, dismiss } = useToast()

const icons: Record<ToastTone, unknown> = {
  info: Info,
  success: CheckCircle2,
  warn: TriangleAlert,
  error: AlertCircle,
}

const tones: Record<ToastTone, string> = {
  info: 'text-brand',
  success: 'text-teal',
  warn: 'text-amber',
  error: 'text-danger',
}
</script>

<template>
  <Teleport to="body">
    <div class="pointer-events-none fixed bottom-[calc(1.25rem+var(--app-safe-bottom))] right-[calc(1.25rem+var(--app-safe-right))] z-[60] flex w-[330px] flex-col gap-2">
      <TransitionGroup
        enter-active-class="transition duration-200 ease-[cubic-bezier(0.2,0.8,0.2,1)]"
        enter-from-class="opacity-0 translate-y-2"
        leave-active-class="transition duration-150"
        leave-to-class="opacity-0 translate-x-4"
      >
        <div
          v-for="item in items"
          :key="item.id"
          class="glass pointer-events-auto flex items-start gap-3 rounded-xl border border-line px-3.5 py-3 shadow-soft"
        >
          <component :is="icons[item.tone]" class="mt-0.5 h-4 w-4 shrink-0" :class="tones[item.tone]" />
          <div class="min-w-0 flex-1">
            <p class="text-[13px] font-medium leading-snug text-ink">{{ item.title }}</p>
            <p v-if="item.description" class="mt-0.5 break-words text-[12px] leading-relaxed text-ink-3">
              {{ item.description }}
            </p>
            <button
              v-if="item.actionLabel"
              type="button"
              class="mt-1.5 cursor-pointer text-[12px] font-medium text-brand hover:underline"
              @click="item.onAction?.()"
            >
              {{ item.actionLabel }}
            </button>
          </div>
          <button
            type="button"
            class="cursor-pointer rounded p-0.5 text-ink-4 transition-colors hover:text-ink"
            aria-label="关闭提示"
            v-tooltip="'关闭提示'"
            @click="dismiss(item.id)"
          >
            <X class="h-3.5 w-3.5" />
          </button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>
