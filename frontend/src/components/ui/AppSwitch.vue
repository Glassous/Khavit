<script setup lang="ts">
withDefaults(
  defineProps<{
    modelValue: boolean
    disabled?: boolean
    label?: string
    description?: string
  }>(),
  { disabled: false, label: undefined, description: undefined },
)

const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
</script>

<template>
  <div class="flex items-center justify-between gap-4">
    <div v-if="label" class="min-w-0">
      <p class="text-[13.5px] font-medium text-ink">{{ label }}</p>
      <p v-if="description" class="mt-0.5 text-[12.5px] leading-relaxed text-ink-3">{{ description }}</p>
    </div>
    <button
      type="button"
      role="switch"
      :aria-checked="modelValue"
      :aria-label="label ?? '切换'"
      :disabled="disabled"
      class="relative h-6 w-11 shrink-0 cursor-pointer rounded-full border transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-50"
      :class="modelValue ? 'border-brand bg-brand' : 'border-line-strong bg-surface-3'"
      @click="emit('update:modelValue', !modelValue)"
    >
      <span
        class="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-[0_1px_3px_rgb(15_21_32/0.3)] transition-all duration-200 ease-[cubic-bezier(0.2,0.8,0.2,1)]"
        :class="modelValue ? 'left-[22px]' : 'left-0.5'"
      />
    </button>
  </div>
</template>
