<script setup lang="ts">
import { computed, ref } from 'vue'
import { CheckCheck, Inbox, Loader2, RefreshCw, Star, Trash2 } from 'lucide-vue-next'
import { useMailStore } from '../../stores/mail'
import { useAuthStore } from '../../stores/auth'
import { useToast } from '../../composables/useToast'
import { useConfirm } from '../../composables/useConfirm'
import { formatNumber, mailboxLabel } from '../../utils/i18n'
import MailListItem from './MailListItem.vue'
import AppSkeleton from '../ui/AppSkeleton.vue'
import AppEmpty from '../ui/AppEmpty.vue'

const mail = useMailStore()
const auth = useAuthStore()
const toast = useToast()
const { confirm } = useConfirm()

const emit = defineEmits<{ select: [id: string] }>()

const listRef = ref<HTMLElement | null>(null)
const selected = ref<Set<string>>(new Set())

const filters = [
  { key: 'all', label: '全部' },
  { key: 'unread', label: '未读' },
  { key: 'starred', label: '星标' },
] as const

const title = computed(() => {
  if (mail.activeSearch) return `搜索「${mail.activeSearch}」`
  return mailboxLabel(mail.currentMailbox)
})

const checkedAll = computed(
  () => mail.emails.length > 0 && mail.emails.every((item) => selected.value.has(item.id)),
)

function toggleCheck(id: string, checked: boolean): void {
  const next = new Set(selected.value)
  if (checked) next.add(id)
  else next.delete(id)
  selected.value = next
}

function toggleAll(): void {
  selected.value = checkedAll.value ? new Set() : new Set(mail.emails.map((item) => item.id))
}

function clearSelection(): void {
  selected.value = new Set()
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

async function bulkMarkRead(): Promise<void> {
  const ids = [...selected.value]
  if (ids.length === 0) return
  await mail.bulkRead(ids, true)
  clearSelection()
  toast.success(`已将 ${ids.length} 封标记为已读`)
}

async function bulkDelete(): Promise<void> {
  const ids = [...selected.value]
  if (ids.length === 0) return
  const ok = await confirm({
    title: `删除 ${ids.length} 封邮件？`,
    description: '在收件箱中删除会移入回收站；在回收站中删除则永久清除，无法恢复。',
    confirmLabel: '删除',
    tone: 'danger',
  })
  if (!ok) return

  const trash = auth.mailboxByRole('trash')
  const inTrash = Boolean(trash && mail.currentMailboxId === trash.id)

  // remove() 内部按所在文件夹决定「移入回收站」还是「永久删除」
  for (const id of ids) {
    await mail.remove(id)
  }
  clearSelection()
  toast.success(inTrash ? '已永久删除' : '已移入回收站')
}
</script>

<template>
  <section class="flex h-full w-[372px] shrink-0 flex-col border-r border-line bg-surface/40 max-xl:w-[330px] max-lg:w-full">
    <!-- 列表头 -->
    <header class="flex h-12 shrink-0 items-center gap-2 border-b border-line px-3">
      <input
        type="checkbox"
        :checked="checkedAll"
        class="h-3.5 w-3.5 cursor-pointer rounded border-line-strong accent-brand"
        aria-label="全选"
        @change="toggleAll"
      />
      <h2 class="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-ink">{{ title }}</h2>
      <span class="shrink-0 text-[11.5px] tabular-nums text-ink-3">{{ formatNumber(mail.total) }} 封</span>
      <button
        type="button"
        class="cursor-pointer rounded-lg p-1.5 text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
        aria-label="刷新"
        @click="refresh"
      >
        <RefreshCw class="h-3.5 w-3.5" :class="mail.loading ? 'animate-spin' : ''" />
      </button>
    </header>

    <!-- 筛选 / 批量操作 -->
    <div class="flex h-10 shrink-0 items-center gap-1 border-b border-line px-2">
      <template v-if="selected.size === 0">
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
        <span class="px-1 text-[12px] font-medium text-ink">已选 {{ selected.size }} 封</span>
        <button
          type="button"
          class="ml-auto cursor-pointer rounded-md p-1.5 text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
          aria-label="标记为已读"
          @click="bulkMarkRead"
        >
          <CheckCheck class="h-4 w-4" />
        </button>
        <button
          type="button"
          class="cursor-pointer rounded-md p-1.5 text-ink-3 transition-colors hover:bg-danger/10 hover:text-danger"
          aria-label="删除所选"
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

    <!-- 列表 -->
    <div ref="listRef" class="min-h-0 flex-1 overflow-y-auto scroll-slim" @scroll="onScroll">
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
          :checked="selected.has(email.id)"
          @select="(id) => emit('select', id)"
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
