<script setup lang="ts">
import TopBar from './TopBar.vue'
import ConfirmDialog from '../ui/ConfirmDialog.vue'

withDefaults(
  defineProps<{ searchable?: boolean; showSidebarToggle?: boolean; sidebarCollapsed?: boolean }>(),
  {
    searchable: true,
    showSidebarToggle: false,
    sidebarCollapsed: false,
  },
)
const emit = defineEmits<{ 'toggle-sidebar': [] }>()
</script>

<template>
  <div class="relative flex h-dvh flex-col overflow-hidden bg-canvas-deep max-lg:bg-surface">
    <!--
      响应式（< lg）：顶栏脱离文档流，绝对定位悬浮在内容之上并且完全透明，
      内容可以一直延伸到屏幕顶端、从其下方穿过；各页面用 --topbar-safe 自行让出安全距离。
      桌面端仍然是「顶栏 + 侧栏 + 圆角岛」的三段式结构。
    -->
    <TopBar
      :searchable="searchable"
      :show-sidebar-toggle="showSidebarToggle"
      :sidebar-collapsed="sidebarCollapsed"
      @toggle-sidebar="emit('toggle-sidebar')"
    />
    <div class="flex min-h-0 flex-1">
      <!-- 侧栏由布局通过具名插槽提供，不在岛内 -->
      <slot name="sidebar" />

      <!-- 主体内容：桌面端是四周留白的圆角岛；响应式下贯穿整屏，不再使用岛 -->
      <div
        class="m-2 flex min-h-0 min-w-0 flex-1 overflow-hidden rounded-[16px] border border-line bg-surface max-lg:m-0 max-lg:rounded-none max-lg:border-0"
      >
        <slot />
      </div>
    </div>
    <ConfirmDialog />
  </div>
</template>
