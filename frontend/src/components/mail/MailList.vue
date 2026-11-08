<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { CheckCheck, Inbox, Loader2, RefreshCw, Star, Trash2 } from 'lucide-vue-next'
import { useMailStore } from '../../stores/mail'
import { useAuthStore } from '../../stores/auth'
import { useToast } from '../../composables/useToast'
import { formatNumber, mailboxLabel } from '../../utils/i18n'
import MailListItem from './MailListItem.vue'
import AppSkeleton from '../ui/AppSkeleton.vue'
import AppEmpty from '../ui/AppEmpty.vue'
import { useDensity } from '../../composables/useDensity'
import { useMailSelection } from '../../composables/useMailSelection'

const mail = useMailStore()
const auth = useAuthStore()
const toast = useToast()
/** 紧凑/舒适密度由设置页控制，这里只负责把状态传下去 */
const { compact } = useDensity()

const emit = defineEmits<{ select: [id: string] }>()

const listRef = ref<HTMLElement | null>(null)

/**
 * 多选与批量操作放在共享的 composable 里：
 * 响应式下由顶栏接管（已选数量 + 按钮），桌面端仍用这里的勾选框与批量条。
 */
const {
  count: selectedCount,
  checkedAll,
  isSelected,
  toggle,
  setChecked,
  toggleAll,
  clear: clearSelection,
  markRead: markSelectedRead,
  removeSelected,
} = useMailSelection()

/** 有任何选中项时，点击邮件行不再打开邮件，而是切换选中 */
const selectionMode = computed(() => selectedCount.value > 0)

const filters = [
  { key: 'all', label: '全部' },
  { key: 'unread', label: '未读' },
  { key: 'starred', label: '星标' },
] as const

const title = computed(() => {
  if (mail.activeSearch) return `搜索「${mail.activeSearch}」`
  return mailboxLabel(mail.currentMailbox)
})

// 换文件夹或离开邮件页时清空选中，避免"已选 3 封"跟着跑到别的列表
watch(() => mail.currentMailboxId, () => clearSelection())
onBeforeUnmount(() => clearSelection())

function toggleCheck(id: string, checked: boolean): void {
  setChecked(id, checked)
}

async function bulkMarkRead(): Promise<void> {
  await markSelectedRead()
}

async function bulkDelete(): Promise<void> {
  await removeSelected()
}

async function onScroll(event: Event): Promise<void> {
  const el = event.target as HTMLElement
  if (el.scrollTop + el.clientHeight >= el.scrollHeight - 240) {
    await mail.loadMore()
  }
}

async function refresh(): Promise<void> {
  await Promise.all([mail.loadFirstPage(), auth.refreshMailboxes()])
  toast.success('已刷新')
}

</script>

<template>
  <!--
    响应式下不再套一层大「岛」：列表容器透明、铺满，邮件各自的小岛直接浮在页面上。
    顶部安全距离与左右留白都由滚动容器的 padding 给出，一滑动就让位。
  -->
  <section
    class="flex h-full w-[372px] shrink-0 flex-col border-r border-line bg-surface/40 max-xl:w-[330px] max-lg:h-auto max-lg:w-auto max-lg:min-w-0 max-lg:flex-1 max-lg:border-r-0 max-lg:bg-transparent"
  >
    <!-- 列表：桌面端吸顶表头 + 独立滚动；响应式下整页只有这一个滚动容器 -->
    <div
      ref="listRef"
      class="min-h-0 flex-1 overflow-y-auto scroll-slim max-lg:px-2 max-lg:pb-3 max-lg:pt-[var(--topbar-safe)]"
      @scroll="onScroll"
    >
      <!-- 响应式标题：跟着列表一起滚动，居左，文案取自当前文件夹（收件箱 / 搜索「…」等） -->
      <h2
        class="hidden truncate px-2 pb-2 pt-1 text-[17px] font-semibold tracking-tight text-ink max-lg:block"
      >
        {{ title }}
      </h2>

      <!-- 列表头：响应式下整行隐藏（标题/计数/刷新交给顶栏与侧栏） -->
      <header
        class="flex h-12 shrink-0 items-center gap-2 border-b border-line bg-surface px-3 max-lg:hidden lg:sticky lg:top-0 lg:z-10"
      >
        <input
          type="checkbox"
          :checked="checkedAll"
          class="h-3.5 w-3.5 cursor-pointer rounded border-line-strong accent-brand"
          aria-label="全选"
          @change="toggleAll"
        />
        <h2 class="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-ink">{{ title }}</h2>
        <span class="shrink-0 text-[11.5px] tabular-nums text-ink-3">
          {{ formatNumber(mail.total) }} 封
        </span>
        <button
          type="button"
          class="cursor-pointer rounded-lg p-1.5 text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
          aria-label="刷新"
          v-tooltip="'刷新'"
          @click="refresh"
        >
          <RefreshCw class="h-3.5 w-3.5" :class="mail.loading ? 'animate-spin' : ''" />
        </button>
      </header>

      <!-- 筛选 / 批量操作：响应式下隐藏，筛选改由顶栏「更多」卡片承担 -->
      <div
        class="flex h-10 shrink-0 items-center gap-1 border-b border-line bg-surface px-2 max-lg:hidden lg:sticky lg:top-12 lg:z-10"
      >
        <template v-if="selectedCount === 0">
          <button
            v-for="item in filters"
            :key="item.key"
            type="button"
            class="cursor-pointer rounded-md px-2 py-1 text-[12px] transition-colors"
            :class="
              mail.filter === item.key
                ? 'bg-brand-ghost font-medium text-brand'
                : 'text-ink-3 hover:bg-surface-2 hover:text-ink'
            "
            @click="mail.setFilter(item.key)"
          >
            {{ item.label }}
          </button>
          <span class="ml-auto pr-1 text-[11.5px] text-ink-4">
            {{ mail.unreadInView > 0 ? `${mail.unreadInView} 封未读` : '' }}
          </span>
        </template>

        <template v-else>
          <span class="px-1 text-[12px] font-medium text-ink">已选 {{ selectedCount }} 封</span>
          <button
            type="button"
            class="ml-auto cursor-pointer rounded-md p-1.5 text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
            aria-label="标记为已读"
            v-tooltip="'标记为已读'"
            @click="bulkMarkRead"
          >
            <CheckCheck class="h-4 w-4" />
          </button>
          <button
            type="button"
            class="cursor-pointer rounded-md p-1.5 text-ink-3 transition-colors hover:bg-danger/10 hover:text-danger"
            aria-label="删除所选"
            v-tooltip="'删除所选'"
            @click="bulkDelete"
          >
            <Trash2 class="h-4 w-4" />
          </button>
          <button
            type="button"
            class="cursor-pointer rounded-md px-2 py-1 text-[12px] text-ink-3 transition-colors hover:text-ink"
            @click="clearSelection"
          >
            取消
          </button>
        </template>
      </div>

      <!-- 邮件行 -->
      <div v-if="mail.loading" class="p-3">
        <div v-for="i in 6" :key="i" class="flex gap-3 border-b border-line/60 py-3">
          <div class="shimmer h-8 w-8 shrink-0 rounded-full" />
          <div class="flex-1">
            <AppSkeleton :rows="2" height="10px" />
          </div>
        </div>
      </div>

      <AppEmpty
        v-else-if="mail.emails.length === 0"
        :title="mail.activeSearch ? '没有匹配的邮件' : '这里还没有邮件'"
        :description="
          mail.activeSearch
            ? '换个关键词试试，搜索会同时匹配主题、发件人与正文。'
            : '新邮件到达后会出现在这里。也可以用顶部的搜索框检索历史邮件。'
        "
      >
        <template #icon>
          <component :is="mail.activeSearch ? Star : Inbox" class="h-5 w-5" />
        </template>
      </AppEmpty>

      <template v-else>
        <MailListItem
          v-for="email in mail.emails"
          :key="email.id"
          :email="email"
          :active="mail.selectedId === email.id"
          :checked="isSelected(email.id)"
          :selected="isSelected(email.id)"
          :selection-mode="selectionMode"
          :compact="compact"
          @select="(id) => emit('select', id)"
          @toggle-select="toggle"
          @star="(id, starred) => mail.setStarred(id, starred)"
          @check="toggleCheck"
        />

        <div v-if="mail.loadingMore" class="flex items-center justify-center gap-2 py-4 text-[12px] text-ink-3">
          <Loader2 class="h-3.5 w-3.5 animate-spin" /> 正在加载更多
        </div>
        <div
          v-else-if="!mail.hasMore && mail.emails.length > 8"
          class="py-4 text-center text-[11.5px] text-ink-4"
        >
          已经到底了 · 共 {{ formatNumber(mail.total) }} 封
        </div>
      </template>
    </div>
  </section>
</template>
