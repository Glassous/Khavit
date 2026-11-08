<script setup lang="ts">
import { computed, ref } from 'vue'
import { Eye, EyeOff } from 'lucide-vue-next'
import { cn } from '../../utils/cn'

const props = withDefaults(
  defineProps<{
    modelValue: string
    type?: string
    label?: string
    placeholder?: string
    hint?: string
    error?: string
    autocomplete?: string
    disabled?: boolean
    size?: 'md' | 'lg'
    spellcheck?: boolean
  }>(),
  {
    type: 'text',
    label: undefined,
    placeholder: undefined,
    hint: undefined,
    error: undefined,
    autocomplete: 'off',
    disabled: false,
    size: 'md',
    spellcheck: false,
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
  enter: []
}>()

const revealed = ref(false)
const isPassword = computed(() => props.type === 'password')
const actualType = computed(() => (isPassword.value && revealed.value ? 'text' : props.type))

const wrapper = computed(() =>
  cn(
    'group flex items-center gap-2 rounded-[10px] border bg-surface px-3 transition-colors duration-150',
    props.size === 'lg' ? 'h-11' : 'h-10',
    props.error
      ? 'border-danger/60 focus-within:border-danger'
      : 'border-line focus-within:border-brand hover:border-line-strong',
    props.disabled && 'opacity-60',
  ),
)
</script>

<template>
  <label class="block">
    <span v-if="label" class="mb-1.5 block text-[13px] font-medium text-ink-2">{{ label }}</span>
    <div :class="wrapper">
      <slot name="leading" />
      <input
        :value="modelValue"
        :type="actualType"
        :placeholder="placeholder"
        :autocomplete="autocomplete"
        :disabled="disabled"
        :spellcheck="spellcheck"
        class="h-full w-full border-0 bg-transparent p-0 text-[14px] text-ink shadow-none outline-none ring-0 placeholder:text-ink-4 focus:outline-none"
        @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
        @keydown.enter="emit('enter')"
      />
      <button
        v-if="isPassword"
        type="button"
        class="cursor-pointer rounded p-1 text-ink-3 transition-colors hover:text-ink"
        :aria-label="revealed ? '隐藏密码' : '显示密码'"
        v-tooltip="revealed ? '隐藏密码' : '显示密码'"
        @click="revealed = !revealed"
      >
        <component :is="revealed ? EyeOff : Eye" class="h-4 w-4" />
      </button>
      <slot name="trailing" />
    </div>
    <span v-if="error" class="mt-1.5 block text-[12.5px] text-danger">{{ error }}</span>
    <span v-else-if="hint" class="mt-1.5 block text-[12.5px] text-ink-3">{{ hint }}</span>
  </label>
</template>
