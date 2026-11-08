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
  <div class="flex h-dvh flex-col overflow-hidden bg-canvas-deep">
    <TopBar
      :searchable="searchable"
      :show-sidebar-toggle="showSidebarToggle"
      :sidebar-collapsed="sidebarCollapsed"
      @toggle-sidebar="emit('toggle-sidebar')"
    />
    <div class="flex min-h-0 flex-1">
      <!-- 侧栏由布局通过具名插槽提供，不在岛内 -->
      <slot name="sidebar" />

      <!-- 主体内容：四周留白的圆角岛，嵌在顶栏与侧栏构成的底色中 -->
      <div
        class="m-2 flex min-h-0 min-w-0 flex-1 overflow-hidden rounded-[16px] border border-line bg-surface"
      >
        <slot />
      </div>
    </div>
    <ConfirmDialog />
  </div>
</template>
