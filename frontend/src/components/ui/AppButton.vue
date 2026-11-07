<script setup lang="ts">
import { computed } from 'vue'
import { Loader2 } from 'lucide-vue-next'
import { cn } from '../../utils/cn'

type Variant = 'primary' | 'secondary' | 'ghost' | 'quiet' | 'danger'
type Size = 'sm' | 'md' | 'lg' | 'icon'

const props = withDefaults(
  defineProps<{
    variant?: Variant
    size?: Size
    loading?: boolean
    disabled?: boolean
    block?: boolean
    type?: 'button' | 'submit' | 'reset'
    title?: string
  }>(),
  {
    variant: 'secondary',
    size: 'md',
    loading: false,
    disabled: false,
    block: false,
    type: 'button',
    title: undefined,
  },
)

const base =
  'relative inline-flex items-center justify-center gap-2 font-medium select-none whitespace-nowrap ' +
  'transition-all duration-150 ease-[cubic-bezier(0.2,0.8,0.2,1)] ' +
  'disabled:cursor-not-allowed disabled:opacity-50 active:translate-y-[0.5px]'

const variants: Record<Variant, string> = {
  primary:
    'bg-brand text-white shadow-[0_1px_2px_rgb(47_91_234/0.28),0_8px_20px_-12px_rgb(47_91_234/0.7)] hover:bg-brand-strong dark:hover:bg-brand-soft',
  secondary:
    'bg-surface text-ink border border-line hover:border-line-strong hover:bg-surface-2',
  ghost: 'text-ink-2 hover:bg-surface-2 hover:text-ink',
  quiet: 'text-ink-3 hover:text-ink hover:bg-surface-2',
  danger:
    'bg-danger text-white shadow-[0_1px_2px_rgb(200_57_43/0.3)] hover:brightness-110 active:brightness-95',
}

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-[13px] rounded-lg',
  md: 'h-9 px-3.5 text-[13.5px] rounded-[10px]',
  lg: 'h-11 px-5 text-sm rounded-xl',
  icon: 'h-9 w-9 rounded-[10px] p-0',
}

const classes = computed(() =>
  cn(base, variants[props.variant], sizes[props.size], props.block && 'w-full'),
)
</script>

<template>
  <button :type="type" :class="classes" :disabled="disabled || loading" :title="title">
    <Loader2 v-if="loading" class="h-4 w-4 animate-spin" />
    <slot v-else name="icon" />
    <slot />
    <slot name="trailing" />
  </button>
</template>
