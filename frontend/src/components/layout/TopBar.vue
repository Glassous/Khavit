<script setup lang="ts">
import { nextTick, onMounted, onBeforeUnmount, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowLeft, Menu, Search, X } from 'lucide-vue-next'
import BrandMark from '../ui/BrandMark.vue'
import { useMailStore } from '../../stores/mail'
import { usePageChrome } from '../../composables/usePageChrome'

withDefaults(
  defineProps<{ searchable?: boolean; showSidebarToggle?: boolean; sidebarCollapsed?: boolean }>(),
  { searchable: true, showSidebarToggle: false, sidebarCollapsed: false },
)
const emit = defineEmits<{ 'toggle-sidebar': [] }>()

const mail = useMailStore()
const router = useRouter()
/** 次级页面（设置、管理等）在顶栏显示返回键 + 标题，主页面显示品牌 logo */
const { secondary, title: pageTitle } = usePageChrome()

const searchRef = ref<HTMLInputElement | null>(null)
const searching = ref(false)
/** 搜索框默认收起成图标，点击后向右展开 */
const searchOpen = ref(false)

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

/**
 * 二级页面的返回：优先退回到上一页；直接打开深链接（没有历史记录）时回邮件首页，
 * 而不是把用户留在原地。
 */
function goBack(): void {
  const back = window.history.state?.back
  if (typeof back === 'string' && back) router.back()
  else void router.replace('/mail')
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
    <!--
      次级页面（设置、管理等）：返回键 + 页面标题，不再占用空间放 logo。
      主页面：品牌标记 + 侧栏开关。
    -->
    <template v-if="secondary">
      <button
        type="button"
        class="-ml-1 flex shrink-0 cursor-pointer items-center justify-center rounded-lg p-2 text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink active:scale-95"
        aria-label="返回"
        v-tooltip="'返回'"
        @click="goBack"
      >
        <ArrowLeft class="h-[18px] w-[18px]" :stroke-width="2.1" />
      </button>
      <h1 class="min-w-0 truncate text-[15.5px] font-semibold tracking-tight text-ink">
        {{ pageTitle }}
      </h1>
    </template>

    <template v-else>
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
        v-tooltip="'打开菜单'"
        @click="emit('toggle-sidebar')"
      >
        <Menu class="h-6 w-6" :stroke-width="2.1" />
      </button>
      <button
        v-if="showSidebarToggle"
        type="button"
        class="-ml-3 hidden cursor-pointer items-center justify-center rounded-lg p-2 text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink active:scale-95 lg:flex"
        :aria-label="sidebarCollapsed ? '展开侧栏' : '收起侧栏'"
        v-tooltip="sidebarCollapsed ? '展开侧栏' : '收起侧栏'"
        @click="emit('toggle-sidebar')"
      >
        <Menu class="h-[26px] w-[26px]" :stroke-width="2.2" />
      </button>
    </template>

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
        v-tooltip="'搜索邮件（/ 或 Ctrl+K）'"
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
          v-tooltip="'关闭搜索（Esc）'"
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

    <!-- 顶栏只放导航相关控件：深浅色与账号区已移出（主题在设置页、退出在设置页底部） -->
  </header>
</template>
