<script setup lang="ts">
import { onBeforeUnmount, watch } from 'vue'
import { X } from 'lucide-vue-next'

const props = withDefaults(
  defineProps<{
    open: boolean
    title?: string
    description?: string
    width?: string
    closeOnBackdrop?: boolean
  }>(),
  { title: undefined, description: undefined, width: '440px', closeOnBackdrop: true },
)

const emit = defineEmits<{ 'update:open': [value: boolean] }>()

function close(): void {
  emit('update:open', false)
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') close()
}

function lockScroll(locked: boolean): void {
  document.body.style.overflow = locked ? 'hidden' : ''
}

watch(
  () => props.open,
  (open) => {
    lockScroll(open)
    if (open) window.addEventListener('keydown', onKeydown)
    else window.removeEventListener('keydown', onKeydown)
  },
)

onBeforeUnmount(() => {
  lockScroll(false)
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-200 ease-[cubic-bezier(0.2,0.8,0.2,1)]"
      enter-from-class="opacity-0"
      leave-active-class="transition duration-150"
      leave-to-class="opacity-0"
    >
      <div v-if="open" class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          class="absolute inset-0 bg-ink/35 backdrop-blur-[2px] dark:bg-black/60"
          @click="closeOnBackdrop && close()"
        />
        <div
          class="animate-pop relative w-full overflow-hidden rounded-2xl border border-line bg-surface shadow-[0_24px_80px_-32px_rgb(15_21_32/0.5)]"
          :style="{ maxWidth: width }"
          role="dialog"
          aria-modal="true"
        >
          <header class="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
            <div class="min-w-0">
              <h2 class="text-[15px] font-semibold text-ink">{{ title }}</h2>
              <p v-if="description" class="mt-1 text-[12.5px] leading-relaxed text-ink-3">
                {{ description }}
              </p>
            </div>
            <button
              type="button"
              class="cursor-pointer rounded-lg p-1.5 text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
              aria-label="关闭"
              v-tooltip="'关闭'"
              @click="close"
            >
              <X class="h-4 w-4" />
            </button>
          </header>

          <div class="max-h-[70vh] overflow-y-auto px-5 py-4 scroll-slim">
            <slot />
          </div>

          <footer
            v-if="$slots.footer"
            class="flex items-center justify-end gap-2 border-t border-line bg-surface-2/60 px-5 py-3"
          >
            <slot name="footer" />
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
