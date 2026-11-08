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
  <div class="relative flex h-dvh flex-col overflow-hidden bg-canvas-deep">
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

      <!--
        主体内容：桌面端是四周留白的圆角岛；响应式下外壳铺满整屏且透明，
        页面各自决定要不要「岛」——邮件列表自带一个贯穿顶栏的浅色岛。

        #panel：设置/管理后台这类「不换页」的视图就地盖在岛内（绝对定位铺满），
        邮件页在下面保持挂载，关掉面板就是原来的列表，不会重新加载。
      -->
      <div
        class="relative m-2 flex min-h-0 min-w-0 flex-1 overflow-hidden rounded-[16px] border border-line bg-surface max-lg:m-0 max-lg:rounded-none max-lg:border-0 max-lg:bg-transparent lg:mb-[calc(0.5rem+var(--app-safe-bottom))] lg:mr-[calc(0.5rem+var(--app-safe-right))]"
      >
        <slot />
        <slot name="panel" />
      </div>
    </div>
    <ConfirmDialog />
  </div>
</template>
