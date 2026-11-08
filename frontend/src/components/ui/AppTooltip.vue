<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import { TOOLTIP_ID, hideTooltip, tooltipState } from '../../composables/useTooltip'

/** 滚动/缩放时提示层的锚点会失效，直接收起 */
function dismiss(): void {
  hideTooltip()
}

onMounted(() => {
  window.addEventListener('scroll', dismiss, true)
  window.addEventListener('resize', dismiss)
})

onBeforeUnmount(() => {
  window.removeEventListener('scroll', dismiss, true)
  window.removeEventListener('resize', dismiss)
})
</script>

<template>
  <Teleport to="body">
    <div
      :id="TOOLTIP_ID"
      role="tooltip"
      aria-hidden="true"
      class="pointer-events-none fixed left-0 top-0 z-[999] max-w-[280px] rounded-lg bg-ink px-2 py-1 text-[11.5px] font-medium leading-4 text-canvas transition-opacity duration-150"
      :class="tooltipState.visible ? 'opacity-100' : 'opacity-0'"
      :style="{ transform: `translate3d(${tooltipState.x}px, ${tooltipState.y}px, 0)` }"
    >
      {{ tooltipState.text }}
    </div>
  </Teleport>
</template>
