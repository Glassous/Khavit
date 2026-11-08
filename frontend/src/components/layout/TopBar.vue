<script setup lang="ts">
import { computed, nextTick, onMounted, onBeforeUnmount, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  ChevronDown,
  LogOut,
  Menu,
  Moon,
  Search,
  Settings,
  ShieldCheck,
  Sun,
  X,
} from 'lucide-vue-next'
import BrandMark from '../ui/BrandMark.vue'
import { useAuthStore } from '../../stores/auth'
import { useMailStore } from '../../stores/mail'
import { useTheme } from '../../composables/useTheme'
import { useConfirm } from '../../composables/useConfirm'
import { initialOf, avatarColor } from '../../utils/format'

withDefaults(
  defineProps<{ searchable?: boolean; showSidebarToggle?: boolean; sidebarCollapsed?: boolean }>(),
  { searchable: true, showSidebarToggle: false, sidebarCollapsed: false },
)
const emit = defineEmits<{ 'toggle-sidebar': [] }>()

const auth = useAuthStore()
const mail = useMailStore()
const router = useRouter()
const { isDark, toggle } = useTheme()
const { confirm } = useConfirm()

const searchRef = ref<HTMLInputElement | null>(null)
const menuOpen = ref(false)
const searching = ref(false)
/** 搜索框默认收起成图标，点击后向右展开 */
const searchOpen = ref(false)

const accountEmail = computed(() => auth.user)
const initial = computed(() => initialOf(auth.displayName))
const color = computed(() => avatarColor(auth.user || 'postal'))

async function openSearch(): Promise<void> {
  searchOpen.value = true
  await nextTick()
  searchRef.value?.focus()
}

function focusInput(): void {
  searchRef.value?.focus()
}

/** 收起搜索框；若正在搜索则一并清空，避免列表停在过滤状态却看不到输入框 */
async function closeSearch(): Promise<void> {
  // 先主动失焦：某些浏览器在父元素 display:none 后仍保留焦点，
  // 继续输入会悄悄触发搜索（表现为“收起了但还在搜”）
  searchRef.value?.blur()
  searchOpen.value = false
  if (searching.value || mail.searchText) await clearSearch()
}

async function onSearchInput(event: Event): Promise<void> {
  // 折叠状态下不再响应输入
  if (!searchOpen.value) return

  const value = (event.target as HTMLInputElement).value
  mail.searchText = value
  searching.value = Boolean(value.trim())
  if (!value.trim()) {
    await mail.clearSearch()
    return
  }
  if (router.currentRoute.value.name !== 'mail') {
    await router.push('/mail')
  }
  await mail.runSearch(value)
}

async function clearSearch(): Promise<void> {
  mail.searchText = ''
  searching.value = false
  await mail.clearSearch()
}

async function logout(): Promise<void> {
  const ok = await confirm({
    title: '退出登录？',
    description: '会话凭据会从本标签页清除，草稿保存在服务器上不会丢失。',
    confirmLabel: '退出',
    tone: 'danger',
  })
  if (!ok) return
  auth.logout()
  mail.reset()
  await router.replace('/login')
}

function onGlobalKey(event: KeyboardEvent): void {
  const target = event.target
  const typing =
    target instanceof HTMLElement &&
    (['INPUT', 'TEXTAREA'].includes(target.tagName) || target.isContentEditable)

  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault()
    void openSearch()
    return
  }
  if (event.key === '/' && !typing) {
    event.preventDefault()
    void openSearch()
    return
  }
  if (event.key === 'Escape' && searchOpen.value && !typing) {
    void closeSearch()
  }
}

onMounted(() => window.addEventListener('keydown', onGlobalKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onGlobalKey))
</script>

<template>
  <header
    class="relative z-30 flex h-14 shrink-0 items-center gap-3 bg-canvas-deep px-3 sm:px-4"
  >
    <!-- 最左侧：品牌标记（纯图标） -->
    <RouterLink
      to="/mail"
      class="ml-1 flex shrink-0 items-center rounded-lg p-1"
      aria-label="Khavit 邮箱"
    >
      <BrandMark class="h-7 w-7 text-brand" />
    </RouterLink>

    <!-- 侧栏开关（移动端打开抽屉，桌面端折叠/展开） -->
    <button
      v-if="showSidebarToggle"
      type="button"
      class="-ml-3 cursor-pointer rounded-lg p-2 text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink active:scale-95 lg:hidden"
      aria-label="打开菜单"
      @click="emit('toggle-sidebar')"
    >
      <Menu class="h-6 w-6" :stroke-width="2.1" />
    </button>
    <button
      v-if="showSidebarToggle"
      type="button"
      class="-ml-3 hidden cursor-pointer items-center justify-center rounded-lg p-2 text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink active:scale-95 lg:flex"
      :aria-label="sidebarCollapsed ? '展开侧栏' : '收起侧栏'"
      :title="sidebarCollapsed ? '展开侧栏' : '收起侧栏'"
      @click="emit('toggle-sidebar')"
    >
      <Menu class="h-[26px] w-[26px]" :stroke-width="2.2" />
    </button>

    <!--
      搜索：收起时是「图标 + 展开快捷键」的小框，点击后向右平滑展开成大框。
      两个状态的内容直接切换（display），由容器宽度的过渡把内容"拉"出来/收回去，
      避免交叉淡入时两套内容叠在一起。
    -->
    <div
      v-if="searchable"
      class="relative -ml-2 h-10 shrink-0 overflow-hidden border transition-all duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)]"
      :class="
        searchOpen
          ? 'w-[360px] max-w-[52vw] rounded-[20px] border-line bg-surface focus-within:border-brand'
          : 'w-[62px] rounded-[20px] border-line bg-surface/70 hover:border-line-strong'
      "
    >
      <!-- 收起态：图标 + 展开快捷键 -->
      <button
        v-show="!searchOpen"
        type="button"
        class="absolute inset-0 flex cursor-pointer items-center justify-start gap-1.5 px-3 transition-colors"
        aria-label="搜索邮件"
        title="搜索邮件（/ 或 Ctrl+K）"
        @click="openSearch"
      >
        <Search class="h-4 w-4 shrink-0 text-ink-3" :stroke-width="2.1" />
        <kbd class="rounded border border-line px-1 text-[10.5px] leading-4 text-ink-4">/</kbd>
      </button>

      <!-- 展开态：左侧关闭图标 + 输入框 + Esc 提示（点击与点输入框一致，只聚焦不关闭） -->
      <div
        v-show="searchOpen"
        class="absolute inset-0 flex items-center gap-2 pl-4 pr-4"
        @click="focusInput"
      >
        <button
          type="button"
          class="shrink-0 cursor-pointer rounded p-0.5 text-ink-3 transition-colors hover:text-ink"
          aria-label="关闭搜索"
          title="关闭搜索"
          @click.stop="closeSearch"
        >
          <X class="h-4 w-4" :stroke-width="2.1" />
        </button>
        <input
          ref="searchRef"
          :value="mail.searchText"
          type="search"
          placeholder="搜索主题、发件人或正文…"
          class="h-full w-full min-w-0 border-0 bg-transparent p-0 text-[13.5px] text-ink outline-none ring-0 placeholder:text-ink-4 focus:outline-none"
          aria-label="搜索邮件"
          @input="onSearchInput"
          @keydown.escape.stop.prevent="closeSearch"
        />
        <kbd
          class="shrink-0 select-none rounded border border-line px-1.5 py-0.5 text-[10.5px] leading-4 text-ink-4"
        >Esc</kbd>
      </div>
    </div>

    <div class="ml-auto flex shrink-0 items-center gap-1">
      <button
        type="button"
        class="cursor-pointer rounded-lg p-2 text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
        :aria-label="isDark ? '切换到浅色' : '切换到深色'"
        @click="toggle"
      >
        <component :is="isDark ? Sun : Moon" class="h-4.5 w-4.5" />
      </button>

      <div class="relative">
        <button
          type="button"
          class="flex cursor-pointer items-center gap-2 rounded-[10px] py-1 pl-1 pr-2 transition-colors hover:bg-surface-2"
          :aria-label="'账号菜单：' + accountEmail"
          @click="menuOpen = !menuOpen"
        >
          <span
            class="flex h-7 w-7 items-center justify-center rounded-full text-[12px] font-semibold text-white"
            :class="color"
          >
            {{ initial }}
          </span>
          <span class="hidden max-w-[140px] truncate text-[13px] text-ink-2 md:block">{{ accountEmail }}</span>
          <ChevronDown class="hidden h-3.5 w-3.5 text-ink-4 md:block" />
        </button>

        <transition
          enter-active-class="transition duration-150 ease-[cubic-bezier(0.2,0.8,0.2,1)]"
          enter-from-class="opacity-0 -translate-y-1"
          leave-active-class="transition duration-100"
          leave-to-class="opacity-0"
        >
          <div
            v-if="menuOpen"
            class="absolute right-0 top-[calc(100%+8px)] w-[228px] overflow-hidden rounded-xl border border-line bg-surface p-1.5 shadow-pop"
          >
            <div class="border-b border-line px-2.5 py-2">
              <p class="truncate text-[13px] font-medium text-ink">{{ accountEmail }}</p>
              <p class="mt-0.5 text-[11.5px] text-ink-3">
                {{ auth.admin ? '管理员账号' : '普通账号' }}
              </p>
            </div>

            <RouterLink
              to="/settings"
              class="mt-1 flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
              @click="menuOpen = false"
            >
              <Settings class="h-4 w-4" /> 设置
            </RouterLink>

            <RouterLink
              v-if="auth.admin"
              to="/admin/domains"
              class="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
              @click="menuOpen = false"
            >
              <ShieldCheck class="h-4 w-4" /> 管理后台
            </RouterLink>

            <div class="my-1 h-px bg-line" />

            <button
              type="button"
              class="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] text-ink-2 transition-colors hover:bg-danger/8 hover:text-danger"
              @click="menuOpen = false; logout()"
            >
              <LogOut class="h-4 w-4" /> 退出登录
            </button>
          </div>
        </transition>

        <div v-if="menuOpen" class="fixed inset-0 z-[-1]" @click="menuOpen = false" />
      </div>
    </div>
  </header>
</template>
