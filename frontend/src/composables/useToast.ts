import { readonly, ref } from 'vue'

export type ToastTone = 'info' | 'success' | 'warn' | 'error'

export interface ToastItem {
  id: number
  title: string
  description?: string
  tone: ToastTone
  actionLabel?: string
  onAction?: () => void
}

const items = ref<ToastItem[]>([])
let seq = 0

function dismiss(id: number): void {
  items.value = items.value.filter((item) => item.id !== id)
}

function push(item: Omit<ToastItem, 'id'>): number {
  seq += 1
  const id = seq
  items.value = [...items.value, { ...item, id }]
  const ttl = item.tone === 'error' ? 6000 : 3600
  setTimeout(() => dismiss(id), ttl)
  return id
}

export function useToast() {
  return {
    items: readonly(items),
    dismiss,
    info: (title: string, description?: string) => push({ title, description, tone: 'info' }),
    success: (title: string, description?: string) => push({ title, description, tone: 'success' }),
    warn: (title: string, description?: string) => push({ title, description, tone: 'warn' }),
    error: (title: string, description?: string) => push({ title, description, tone: 'error' }),
    action: (
      title: string,
      actionLabel: string,
      onAction: () => void,
      tone: ToastTone = 'info',
      description?: string,
    ) => push({ title, description, tone, actionLabel, onAction }),
  }
}
