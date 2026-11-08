<script setup lang="ts">
import { computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import AppShell from './AppShell.vue'
import SideBar from './SideBar.vue'
import { useSidebar } from '../../composables/useSidebar'

/**
 * 常驻布局：顶栏、侧栏只在登录后的首次进入时挂载一次。
 * 页面切换只替换内容区的 RouterView，因此顶栏不会跟着重建/淡出（之前整页
 * Transition 造成的“顶栏闪一下”）。顶栏形态由路由 meta 决定：
 * - secondary：次级页面（设置、管理），显示返回键 + 标题，不显示 logo
 * - sidebar：需要邮箱侧栏（仅邮件页）
 * - searchable：顶栏显示搜索框（仅邮件页）
 */
const route = useRoute()
const { collapsed, isDesktop, drawerOpen, toggle, toggleDrawer, closeDrawer } = useSidebar()

const sidebarRail = computed(() => collapsed.value && isDesktop.value)
const hasSidebar = computed(() => Boolean(route.meta.sidebar))

function onToggleSidebar(): void {
  if (isDesktop.value) toggle()
  else toggleDrawer()
}

// 换页时收起移动端抽屉，否则新页面会压在遮罩下面
watch(
  () => route.fullPath,
  () => closeDrawer(),
)
</script>

<template>
  <AppShell
    :searchable="Boolean(route.meta.searchable)"
    :show-sidebar-toggle="hasSidebar"
    :sidebar-collapsed="sidebarRail"
    @toggle-sidebar="onToggleSidebar"
  >
    <template v-if="hasSidebar" #sidebar>
      <SideBar :open="drawerOpen" :collapsed="sidebarRail" @close="closeDrawer" />
    </template>

    <!-- 只有内容区做淡入淡出，外壳保持不动 -->
    <RouterView v-slot="{ Component }">
      <Transition
        enter-active-class="transition-opacity duration-200 ease-[cubic-bezier(0.2,0.8,0.2,1)]"
        enter-from-class="opacity-0"
        mode="out-in"
      >
        <component :is="Component" />
      </Transition>
    </RouterView>
  </AppShell>
</template>
