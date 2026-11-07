<script setup lang="ts">
withDefaults(
  defineProps<{
    title: string
    description?: string
    compact?: boolean
  }>(),
  { description: undefined, compact: false },
)
</script>

<template>
  <div
    class="flex flex-col items-center justify-center text-center"
    :class="compact ? 'gap-2 py-10' : 'gap-3 py-16'"
  >
    <div
      class="flex items-center justify-center rounded-2xl border border-line bg-surface-2 text-ink-4"
      :class="compact ? 'h-10 w-10' : 'h-14 w-14'"
    >
      <slot name="icon" />
    </div>
    <p class="text-[14px] font-medium text-ink">{{ title }}</p>
    <p v-if="description" class="max-w-[280px] text-[12.5px] leading-relaxed text-ink-3">
      {{ description }}
    </p>
    <div v-if="$slots.action" class="mt-1">
      <slot name="action" />
    </div>
  </div>
</template>
