import { onBeforeUnmount, onMounted } from 'vue'

type Handler = (event: KeyboardEvent) => void

interface Binding {
  key: string
  handler: Handler
  when?: () => boolean
  /** 允许在输入框内触发（默认不允许） */
  allowInInput?: boolean
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName.toLowerCase()
  return tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable
}

/** 全局键盘快捷键：c 写信、/ 搜索、j/k 上下选择、Esc 关闭 */
export function useHotkeys(bindings: Binding[]): void {
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return

    for (const binding of bindings) {
      if (event.key !== binding.key) continue
      if (!binding.allowInInput && isTyping(event.target)) return
      if (binding.when && !binding.when()) continue
      event.preventDefault()
      binding.handler(event)
      return
    }
  }

  onMounted(() => window.addEventListener('keydown', onKeyDown))
  onBeforeUnmount(() => window.removeEventListener('keydown', onKeyDown))
}
