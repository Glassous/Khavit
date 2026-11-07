import { readonly, ref } from 'vue'

export interface ConfirmOptions {
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  tone?: 'primary' | 'danger'
}

interface ConfirmState extends ConfirmOptions {
  open: boolean
}

const state = ref<ConfirmState>({
  open: false,
  title: '',
  description: '',
  confirmLabel: '确定',
  cancelLabel: '取消',
  tone: 'primary',
})

let resolver: ((value: boolean) => void) | null = null

function settle(value: boolean): void {
  state.value = { ...state.value, open: false }
  resolver?.(value)
  resolver = null
}

export function useConfirm() {
  function confirm(options: ConfirmOptions): Promise<boolean> {
    // 上一次未结束的确认直接视为取消，避免悬挂 Promise
    resolver?.(false)
    state.value = {
      open: true,
      confirmLabel: '确定',
      cancelLabel: '取消',
      tone: 'primary',
      ...options,
    }
    return new Promise<boolean>((resolve) => {
      resolver = resolve
    })
  }

  return {
    state: readonly(state),
    confirm,
    accept: () => settle(true),
    cancel: () => settle(false),
  }
}
