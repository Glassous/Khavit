<script setup lang="ts">
import { computed, defineAsyncComponent, watch } from 'vue'
import { useRoute } from 'vue-router'
import AppShell from './AppShell.vue'
import SideBar from './SideBar.vue'
import { useSidebar } from '../../composables/useSidebar'
import { useIslandPanel } from '../../composables/useIslandPanel'
import { useAuthStore } from '../../stores/auth'

/**
 * 常驻布局：顶栏、侧栏只在登录后的首次进入时挂载一次。
 * 页面切换只替换内容区的 RouterView，因此顶栏不会跟着重建/淡出（之前整页
 * Transition 造成的“顶栏闪一下”）。顶栏形态由路由 meta 决定：
 * - sidebar：需要邮箱侧栏（仅邮件页）
 * - searchable：顶栏显示搜索框（仅邮件页）
 *
 * 设置与管理后台不再是路由页面：它们作为面板盖在岛内（见 useIslandPanel），
 * 因此切到设置时邮件列表依然挂载，关掉面板回到原来的位置。
 */
const route = useRoute()
const auth = useAuthStore()
const { collapsed, isDesktop, drawerOpen, toggle, toggleDrawer, closeDrawer } = useSidebar()
const { panel, hide: closePanel } = useIslandPanel()

const sidebarRail = computed(() => collapsed.value && isDesktop.value)
const hasSidebar = computed(() => Boolean(route.meta.sidebar))

/**
 * 面板按需加载：邮件页首屏不需要设置/管理后台的代码。
 * 加载期间邮件列表继续显示，面板准备好后才盖上来。
 */
const SettingsPanel = defineAsyncComponent(() => import('../panel/SettingsPanel.vue'))
const AdminPanel = defineAsyncComponent(() => import('../panel/AdminPanel.vue'))

/** 当前要盖在岛内的面板（非管理员看不到管理后台） */
const panelComponent = computed(() => {
  if (panel.value === 'settings') return SettingsPanel
  if (panel.value === 'admin') return auth.admin ? AdminPanel : null
  return null
})

function onToggleSidebar(): void {
  if (isDesktop.value) toggle()
  else toggleDrawer()
}

// 换页时收起移动端抽屉，否则新页面会压在遮罩下面
watch(
  () => route.fullPath,
  () => closeDrawer(),
)

// 打开面板时一并收起移动端抽屉：抽屉是整屏浮层，开着会挡住面板
watch(panel, (value) => {
  if (value) closeDrawer()
})
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

    <!-- 岛内面板：盖在邮件页之上，淡入淡出，关掉即回到列表 -->
    <template #panel>
      <Transition
        enter-active-class="transition-opacity duration-200 ease-[cubic-bezier(0.2,0.8,0.2,1)]"
        enter-from-class="opacity-0"
        leave-active-class="transition-opacity duration-150 ease-in"
        leave-to-class="opacity-0"
      >
        <component :is="panelComponent" v-if="panelComponent" @close="closePanel" />
      </Transition>
    </template>
  </AppShell>
</template>
