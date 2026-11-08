<script setup lang="ts">
import { ref } from 'vue'
import { X } from 'lucide-vue-next'
import type { EmailAddress } from '../../jmap/types'

const props = withDefaults(
  defineProps<{
    modelValue: EmailAddress[]
    label: string
    placeholder?: string
    autofocus?: boolean
  }>(),
  { placeholder: '输入邮箱地址后回车', autofocus: false },
)

const emit = defineEmits<{ 'update:modelValue': [value: EmailAddress[]] }>()

const draft = ref('')
const inputRef = ref<HTMLInputElement | null>(null)

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function commit(raw?: string): void {
  const text = (raw ?? draft.value).trim()
  if (!text) return

  const parts = text
    .split(/[,;，；\s]+/)
    .map((item) => item.trim())
    .filter(Boolean)

  const next = [...props.modelValue]
  parts.forEach((part) => {
    // 支持 "张三 <a@b.com>" 形式
    const match = part.match(/^(.*?)<([^>]+)>$/)
    const email = (match ? match[2] : part).trim()
    const name = match ? match[1].trim().replace(/^"|"$/g, '') : ''
    if (!EMAIL_RE.test(email)) return
    if (next.some((item) => item.email.toLowerCase() === email.toLowerCase())) return
    next.push(name ? { name, email } : { email })
  })

  emit('update:modelValue', next)
  draft.value = ''
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Enter' || event.key === ',' || event.key === ';' || event.key === 'Tab') {
    if (!draft.value.trim()) return
    event.preventDefault()
    commit()
    return
  }
  if (event.key === 'Backspace' && !draft.value && props.modelValue.length > 0) {
    emit('update:modelValue', props.modelValue.slice(0, -1))
  }
}

function onBlur(): void {
  if (draft.value.trim()) commit()
}

function remove(index: number): void {
  emit(
    'update:modelValue',
    props.modelValue.filter((_, i) => i !== index),
  )
  inputRef.value?.focus()
}

function focus(): void {
  inputRef.value?.focus()
}

defineExpose({ focus })
</script>

<template>
  <div class="flex min-h-10 flex-wrap items-center gap-1.5 border-b border-line py-1.5">
    <span class="mr-1 shrink-0 text-[12.5px] text-ink-3">{{ label }}</span>

    <span
      v-for="(item, index) in modelValue"
      :key="item.email"
      class="flex max-w-full items-center gap-1 rounded-md bg-brand-ghost px-1.5 py-0.5 text-[12px] text-brand"
    >
      <span class="max-w-[180px] truncate">{{ item.name || item.email }}</span>
      <button
        type="button"
        class="cursor-pointer rounded p-0.5 transition-colors hover:bg-brand/15"
        :aria-label="`移除 ${item.email}`"
        v-tooltip="`移除 ${item.email}`"
        @click="remove(index)"
      >
        <X class="h-3 w-3" />
      </button>
    </span>

    <input
      ref="inputRef"
      v-model="draft"
      type="text"
      :placeholder="modelValue.length === 0 ? placeholder : ''"
      class="h-6 min-w-[140px] flex-1 border-0 bg-transparent p-0 text-[13px] text-ink outline-none ring-0 placeholder:text-ink-4 focus:outline-none"
      :autofocus="autofocus"
      @keydown="onKeydown"
      @blur="onBlur"
      @paste="
        (event) => {
          const text = event.clipboardData?.getData('text') ?? ''
          if (text.includes(',') || text.includes(';')) {
            event.preventDefault()
            commit(text)
          }
        }
      "
    />
  </div>
</template>
