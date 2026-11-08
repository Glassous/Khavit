<script setup lang="ts">
import { computed, nextTick, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Check, CheckCheck, Menu, MoreVertical, Search, Trash2, X } from 'lucide-vue-next'
import BrandMark from '../ui/BrandMark.vue'
import { useMailStore } from '../../stores/mail'
import { useIslandPanel } from '../../composables/useIslandPanel'
import { useMailSelection } from '../../composables/useMailSelection'
import { useSidebar } from '../../composables/useSidebar'
import { useTopBarAutoHide } from '../../composables/useTopBarAutoHide'

withDefaults(
  defineProps<{ searchable?: boolean; showSidebarToggle?: boolean; sidebarCollapsed?: boolean }>(),
  { searchable: true, showSidebarToggle: false, sidebarCollapsed: false },
)
const emit = defineEmits<{ 'toggle-sidebar': [] }>()

const mail = useMailStore()
const router = useRouter()
/** 设置/管理后台是岛内面板，不再切换顶栏形态；搜索时先把面板收起来 */
const { open: panelOpen, hide: closePanel } = useIslandPanel()

/** 响应式顶栏的「更多」菜单：用列表筛选替代被隐藏的第二行 */
const {
  count: selectedCount,
  checkedAll,
  toggleAll,
  clear: clearSelection,
  markRead: markSelectedRead,
  removeSelected,
} = useMailSelection()
const { isDesktop } = useSidebar()
/** 响应式顶栏随列表下滑收起、上滑原地恢复 */
const { hidden: topBarHidden, show: showTopBar } = useTopBarAutoHide()

/** 响应式多选态：桌面端列表自带批量条，这里只在窄屏接管顶栏 */
const selecting = computed(() => !isDesktop.value && selectedCount.value > 0)

const filterOptions = [
  { key: 'all', label: '全部' },
  { key: 'unread', label: '未读' },
  { key: 'starred', label: '星标' },
] as const

const filterMenu = ref(false)

function toggleFilterMenu(): void {
  filterMenu.value = !filterMenu.value
}

function pickFilter(key: 'all' | 'unread' | 'starred'): void {
  mail.setFilter(key)
  filterMenu.value = false
}

function onDocumentClick(event: MouseEvent): void {
  const target = event.target as HTMLElement | null
  if (!target?.closest('[data-filter-menu]')) filterMenu.value = false
}

watch(filterMenu, (open) => {
  if (open) document.addEventListener('click', onDocumentClick)
  else document.removeEventListener('click', onDocumentClick)
})

// 进入多选态时收起搜索与筛选卡片，把空间让给「已选 n 封」和批量按钮
watch(selecting, (active) => {
  if (!active) return
  filterMenu.value = false
  searchOpen.value = false
  // 批量操作都在顶栏，先把可能收起的顶栏拉回来
  showTopBar()
})

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
  // 设置/管理后台盖在邮件列表上，开始搜索时先把面板收起来，否则看不到结果
  if (panelOpen.value) await closePanel()
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
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onGlobalKey)
  document.removeEventListener('click', onDocumentClick)
})
</script>

<template>
  <!--
    响应式（< lg）：顶栏透明、绝对定位悬浮，宽高包含刘海安全区，内容从它下方穿过；
    品牌图标交给侧栏第一行显示（见 SideBar），这里只留菜单与搜索，自然贴到最左侧。
  -->
  <!--
    响应式下还会随列表滚动收起/恢复：下滑整体上移出屏幕，上滑原地滑回，
    位移只走 transform，不会引起重排，动画是平滑的。
  -->
  <header
    class="relative z-30 flex h-14 shrink-0 items-center gap-3 bg-canvas-deep px-3 sm:px-4 max-lg:absolute max-lg:inset-x-0 max-lg:top-0 max-lg:h-[var(--topbar-safe)] max-lg:gap-3 max-lg:bg-transparent max-lg:px-4 max-lg:pt-[env(safe-area-inset-top,0px)] max-lg:transition-transform max-lg:duration-300 max-lg:ease-[cubic-bezier(0.32,0.72,0,1)]"
    :class="topBarHidden ? 'max-lg:-translate-y-full' : 'max-lg:translate-y-0'"
  >
    <!-- 响应式顶栏遮罩：顶部完全不透明、向下渐隐到几乎透明（强度与模糊见 .topbar-veil） -->
    <div class="topbar-veil max-lg:block" aria-hidden="true" />
    <!-- 主页面：品牌标记 + 侧栏开关（设置、管理后台改用岛内面板，顶栏形态不再变化） -->
    <!-- 最左侧：品牌标记（纯图标）；响应式下隐藏，位置让给侧栏内的第一行 -->
    <RouterLink
      to="/mail"
      class="ml-1 flex shrink-0 items-center rounded-lg p-1 max-lg:hidden"
      aria-label="Khavit 邮箱"
    >
      <BrandMark class="h-7 w-7 text-brand" />
    </RouterLink>

    <!-- 侧栏开关（移动端打开抽屉，桌面端折叠/展开） -->
    <button
      v-if="showSidebarToggle"
      type="button"
      class="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full bg-canvas-deep text-ink-2 transition-colors duration-150 hover:bg-surface-2 hover:text-ink active:scale-95 lg:hidden"
      aria-label="打开菜单"
      v-tooltip="'打开菜单'"
      @click="emit('toggle-sidebar')"
    >
      <Menu class="h-[22px] w-[22px]" :stroke-width="2.2" />
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

    <!-- 响应式多选态：搜索的位置换成「已选 n 封」，右侧是批量操作 -->
    <span v-if="selecting" class="min-w-0 truncate text-[14.5px] font-medium text-ink">
      已选 {{ selectedCount }} 封
    </span>
    <!-- 全选 / 取消全选：颜色与旁边按钮一致，高度也对齐到 44px -->
    <button
      v-if="selecting"
      type="button"
      class="inline-flex h-11 shrink-0 cursor-pointer items-center justify-center whitespace-nowrap rounded-full px-2 text-[13px] font-medium text-ink-2 transition-colors hover:text-ink active:scale-95"
      :aria-label="checkedAll ? '取消全选' : '全选'"
      @click="toggleAll"
    >
      {{ checkedAll ? '取消全选' : '全选' }}
    </button>
    <div v-if="selecting" class="ml-auto flex shrink-0 items-center gap-1">
      <button
        type="button"
        class="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full bg-canvas-deep text-ink-2 transition-colors duration-150 hover:bg-surface-2 hover:text-ink active:scale-95"
        aria-label="标记为已读"
        @click="markSelectedRead"
      >
        <CheckCheck class="h-[21px] w-[21px]" :stroke-width="2.2" />
      </button>
      <button
        type="button"
        class="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full bg-canvas-deep text-ink-2 transition-colors duration-150 hover:bg-danger/10 hover:text-danger active:scale-95"
        aria-label="删除所选"
        @click="removeSelected"
      >
        <Trash2 class="h-[21px] w-[21px]" :stroke-width="2.2" />
      </button>
      <button
        type="button"
        class="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full bg-canvas-deep text-ink-2 transition-colors duration-150 hover:bg-surface-2 hover:text-ink active:scale-95"
        aria-label="取消选择"
        @click="clearSelection"
      >
        <X class="h-[21px] w-[21px]" :stroke-width="2.2" />
      </button>
    </div>

    <!--
      搜索：收起时是「图标 + 展开快捷键」的小框，点击后向右平滑展开成大框。
      两个状态的内容直接切换（display），由容器宽度的过渡把内容"拉"出来/收回去，
      避免交叉淡入时两套内容叠在一起。
    -->
    <!--
      宽度只由 width 决定（用 min() 收口，而不是 max-width）：
      若展开态用 max-width 收口、收起态又没写 max-width，收起瞬间 max-width 会跳到
      none，元素先弹回完整宽度（视觉上「向右展开、漂移」）再收缩，很难看。
      背景用不透明底色：顶栏本身透明，控件必须挡住从下方穿过的列表文字；
      响应式下底色取列表卡片同款 surface（浅色即白、深色即近黑），去掉边框与快捷键提示。
      展开宽度按「左右内边距 16×2 + 汉堡 44 + 更多 44 + 两个间距 12×2」扣掉，
      留 4px 余量，保证不会把右侧的更多按钮挤出屏幕。
    -->
    <div
      v-if="searchable && !selecting"
      class="relative -ml-2 h-10 shrink-0 overflow-hidden border transition-all duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] max-lg:ml-0 max-lg:h-11 max-lg:rounded-full max-lg:border-transparent max-lg:bg-surface max-lg:focus-within:border-transparent"
      :class="
        searchOpen
          ? 'w-[min(360px,52vw)] rounded-[20px] border-line bg-surface focus-within:border-brand max-lg:w-[calc(100vw-9.25rem)]'
          : 'w-[62px] rounded-[20px] border-line bg-surface hover:border-line-strong max-lg:w-[88px]'
      "
    >
      <!-- 收起态：图标 + 展开快捷键（响应式下把快捷键换成「搜索」二字） -->
      <button
        v-show="!searchOpen"
        type="button"
        class="absolute inset-0 flex cursor-pointer items-center justify-start gap-1.5 px-3 transition-colors max-lg:gap-2"
        aria-label="搜索邮件"
        v-tooltip="'搜索邮件（/ 或 Ctrl+K）'"
        @click="openSearch"
      >
        <Search
          class="h-4 w-4 shrink-0 text-ink-3 max-lg:h-[18px] max-lg:w-[18px]"
          :stroke-width="2.1"
        />
        <span class="hidden text-[13.5px] leading-none text-ink-3 max-lg:inline">搜索</span>
        <kbd
          class="rounded border border-line px-1 text-[10.5px] leading-4 text-ink-4 max-lg:hidden"
        >/</kbd>
      </button>

      <!-- 展开态：左侧关闭图标 + 输入框 + Esc 提示（点击与点输入框一致，只聚焦不关闭） -->
      <div
        v-show="searchOpen"
        class="absolute inset-0 flex items-center gap-2 pl-4 pr-4"
        @click="focusInput"
      >
        <button
          type="button"
          class="shrink-0 cursor-pointer rounded p-0.5 text-ink-3 transition-colors hover:text-ink max-lg:p-1"
          aria-label="关闭搜索"
          v-tooltip="'关闭搜索（Esc）'"
          @click.stop="closeSearch"
        >
          <X class="h-4 w-4 max-lg:h-[18px] max-lg:w-[18px]" :stroke-width="2.1" />
        </button>
        <input
          ref="searchRef"
          :value="mail.searchText"
          type="search"
          placeholder="搜索主题、发件人或正文…"
          class="h-full w-full min-w-0 border-0 bg-transparent p-0 text-[13.5px] text-ink outline-none ring-0 placeholder:text-ink-4 focus:outline-none max-lg:text-[14.5px]"
          aria-label="搜索邮件"
          @input="onSearchInput"
          @keydown.escape.stop.prevent="closeSearch"
        />
        <kbd
          class="shrink-0 select-none rounded border border-line px-1.5 py-0.5 text-[10.5px] leading-4 text-ink-4 max-lg:hidden"
        >Esc</kbd>
      </div>
    </div>

    <!--
      响应式「更多」：呼出卡片筛选 全部 / 未读 / 星标，
      替代被隐藏的列表第二行；桌面端不渲染（列表里自带）。
    -->
    <div v-if="searchable && !isDesktop && !selecting" class="relative ml-auto" data-filter-menu>
      <button
        type="button"
        class="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full bg-canvas-deep text-ink-2 transition-colors duration-150 hover:bg-surface-2 hover:text-ink active:scale-95"
        aria-label="更多"
        :aria-expanded="filterMenu"
        @click.stop="toggleFilterMenu"
      >
        <MoreVertical class="h-[22px] w-[22px]" :stroke-width="2.2" />
      </button>

      <Transition
        enter-active-class="transition duration-150 ease-[cubic-bezier(0.2,0.8,0.2,1)]"
        enter-from-class="opacity-0 -translate-y-1 scale-95"
        leave-active-class="transition duration-100 ease-in"
        leave-to-class="opacity-0 -translate-y-1 scale-95"
      >
        <div
          v-if="filterMenu"
          class="absolute right-0 top-[calc(100%+10px)] z-50 w-[172px] rounded-[14px] border border-line bg-surface p-1.5 shadow-pop"
        >
          <button
            v-for="item in filterOptions"
            :key="item.key"
            type="button"
            class="flex w-full cursor-pointer items-center gap-2 rounded-[10px] px-2.5 py-2 text-left text-[13.5px] transition-colors"
            :class="
              mail.filter === item.key
                ? 'bg-brand-ghost font-medium text-brand'
                : 'text-ink-2 hover:bg-surface-2 hover:text-ink'
            "
            @click="pickFilter(item.key)"
          >
            <span class="flex-1">{{ item.label }}</span>
            <Check v-if="mail.filter === item.key" class="h-4 w-4" :stroke-width="2.4" />
          </button>
        </div>
      </Transition>
    </div>

    <!-- 顶栏只放导航相关控件：深浅色与账号区已移出（主题在设置页、退出在设置页底部） -->
  </header>
</template>
