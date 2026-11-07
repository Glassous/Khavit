<script setup lang="ts">
withDefaults(
  defineProps<{
    tone?: 'brand' | 'neutral' | 'success' | 'warn' | 'danger'
    dot?: boolean
  }>(),
  { tone: 'neutral', dot: false },
)

const tones: Record<string, string> = {
  brand: 'bg-brand-ghost text-brand border-brand/20',
  neutral: 'bg-surface-2 text-ink-2 border-line',
  success: 'bg-teal/10 text-teal border-teal/20',
  warn: 'bg-amber/10 text-amber border-amber/20',
  danger: 'bg-danger/10 text-danger border-danger/20',
}
</script>

<template>
  <span
    class="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11.5px] font-medium leading-4"
    :class="tones[tone]"
  >
    <span v-if="dot" class="h-1.5 w-1.5 rounded-full bg-current" />
    <slot />
  </span>
</template>
