import { nextTick, reactive } from 'vue'
import type { Directive } from 'vue'

/**
 * 全局自定义提示器。
 *
 * 用法：`v-tooltip="'文案'"`，值为空则不显示。
 * - 提示层由 <AppTooltip /> 渲染在 body 下（fixed 定位），
 *   避免被顶栏/侧栏的 overflow 裁切；
 * - 颜色用 `bg-ink / text-canvas` 反色令牌，深浅色模式自动跟随；
 * - 移出、失焦、滚动、点击都会立即隐藏。
 */
export const TOOLTIP_ID = 'app-tooltip'

const SHOW_DELAY = 220
const GAP = 8
const EDGE = 8

export interface TooltipState {
  text: string
  visible: boolean
  x: number
  y: number
}

export const tooltipState = reactive<TooltipState>({
  text: '',
  visible: false,
  x: 0,
  y: 0,
})

let timer: number | undefined
let currentEl: HTMLElement | null = null

function clearTimer(): void {
  if (timer !== undefined) {
    window.clearTimeout(timer)
    timer = undefined
  }
}

export function hideTooltip(): void {
  clearTimer()
  currentEl = null
  tooltipState.visible = false
}

/** 依据触发元素位置摆放提示层：优先下方，空间不够则翻到上方，并做左右边界收敛 */
function place(el: HTMLElement, tip: HTMLElement | null): void {
  const rect = el.getBoundingClientRect()
  const width = tip?.offsetWidth ?? 0
  const height = tip?.offsetHeight ?? 0

  const centered = rect.left + rect.width / 2 - width / 2
  const maxX = window.innerWidth - width - EDGE
  tooltipState.x = Math.round(Math.min(Math.max(EDGE, centered), Math.max(EDGE, maxX)))

  const below = rect.bottom + GAP
  const above = rect.top - height - GAP
  const fitsBelow = below + height <= window.innerHeight - EDGE
  tooltipState.y = Math.round(fitsBelow || above < EDGE ? below : above)
}

async function showTooltip(el: HTMLElement, text: string): Promise<void> {
  tooltipState.text = text
  tooltipState.visible = true
  // 等文案渲染完再测量宽高，避免第一帧位置跳动
  await nextTick()
  if (currentEl !== el) return
  place(el, document.getElementById(TOOLTIP_ID))
}

interface TipMeta {
  text: string
  enter: () => void
  leave: () => void
}

const metas = new WeakMap<HTMLElement, TipMeta>()

function normalize(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export const vTooltip: Directive<HTMLElement, string | null | undefined> = {
  mounted(el, binding) {
    const meta: TipMeta = {
      text: normalize(binding.value),
      enter: () => {
        if (!meta.text) return
        clearTimer()
        currentEl = el
        timer = window.setTimeout(() => {
          void showTooltip(el, meta.text)
        }, SHOW_DELAY)
      },
      leave: () => {
        if (currentEl === el) hideTooltip()
      },
    }
    metas.set(el, meta)
    el.addEventListener('mouseenter', meta.enter)
    el.addEventListener('mouseleave', meta.leave)
    el.addEventListener('focus', meta.enter)
    el.addEventListener('blur', meta.leave)
  },

  updated(el, binding) {
    const meta = metas.get(el)
    if (!meta) return
    meta.text = normalize(binding.value)
    if (currentEl === el) {
      if (meta.text) {
        tooltipState.text = meta.text
      } else {
        hideTooltip()
      }
    }
  },

  unmounted(el) {
    const meta = metas.get(el)
    if (meta) {
      el.removeEventListener('mouseenter', meta.enter)
      el.removeEventListener('mouseleave', meta.leave)
      el.removeEventListener('focus', meta.enter)
      el.removeEventListener('blur', meta.leave)
      metas.delete(el)
    }
    if (currentEl === el) hideTooltip()
  },
}
