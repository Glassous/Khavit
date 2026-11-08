<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { CornerUpLeft, CornerUpRight } from 'lucide-vue-next'
import MailList from '../components/mail/MailList.vue'
import MailReader from '../components/mail/MailReader.vue'
import Composer from '../components/compose/Composer.vue'
import { useAuthStore } from '../stores/auth'
import { useMailStore } from '../stores/mail'
import { useComposerStore } from '../stores/composer'
import { useHotkeys } from '../composables/useHotkeys'
import { useMailSelection } from '../composables/useMailSelection'
import { useSidebar } from '../composables/useSidebar'
import { useIslandPanel } from '../composables/useIslandPanel'
import { useMailExpand } from '../composables/useMailExpand'
import { useMailActions } from '../composables/useMailActions'
import { useTopBarAutoHide } from '../composables/useTopBarAutoHide'
import type { Mailbox } from '../jmap/types'

const auth = useAuthStore()
const mail = useMailStore()
const composer = useComposerStore()
const route = useRoute()
const router = useRouter()
const { count: selectedCount } = useMailSelection()
const { isDesktop } = useSidebar()
const { open: panelOpen } = useIslandPanel()
/**
 * 响应式正文：列表里的卡片就地展开成正文页（同一个节点，见 useMailExpand）。
 * reading 同时决定顶栏形态，expandedId 决定哪一行展开。
 */
const { expandedId, reading, open: expandMail, close: collapseMail, collapse } = useMailExpand()
const { markUnread, archive: archiveSelected, remove: removeSelected } = useMailActions()
/** 顶栏与底部胶囊共用同一个收起状态 */
const { hidden: topBarHidden } = useTopBarAutoHide()

/**
 * 设置/管理后台盖在邮件页之上时，邮件页的快捷键全部让位：
 * Esc 归面板关闭，c/j/k/r 不该在被挡住的时候还生效。
 */
const hotkeysActive = (): boolean => !panelOpen.value

/** 桌面端直接看右侧阅读区；响应式走卡片展开 */
const readingOnMobile = computed(() => !isDesktop.value && reading.value)

function resolveMailbox(slug?: string): Mailbox | undefined {
  if (!slug) return auth.mailboxes.find((item) => item.role === 'inbox') ?? auth.mailboxes[0]
  return auth.mailboxes.find((item) => item.role === slug) ?? auth.mailboxes.find((item) => item.id === slug)
}

async function syncFromRoute(): Promise<void> {
  const slug = route.params.mailbox as string | undefined
  const target = resolveMailbox(slug)
  if (!target) return
  if (target.id === mail.currentMailboxId) return
  await mail.selectMailbox(target.id)
}

onMounted(async () => {
  if (!auth.isLoggedIn) {
    const ok = await auth.bootstrap()
    if (!ok) {
      await router.replace({ name: 'login' })
      return
    }
  }
  if (auth.mailboxes.length === 0) {
    await auth.refreshMailboxes()
  }
  await syncFromRoute()
  if (!route.params.mailbox) {
    const inbox = auth.mailboxes.find((item) => item.role === 'inbox')
    // 带上查询串：从 ?panel=… 进来时补全文件夹不能把面板丢掉
    if (inbox) {
      await router.replace({
        name: 'mail',
        params: { mailbox: inbox.role ?? inbox.id },
        query: route.query,
      })
    }
  }
})

watch(
  () => route.params.mailbox,
  () => {
    void syncFromRoute()
  },
)

// 换到桌面形态时收起展开的卡片：那边右侧阅读区接手，别留一张全屏卡
watch(isDesktop, (desktop) => {
  if (desktop) collapse()
})

async function openEmail(id: string): Promise<void> {
  if (!isDesktop.value) {
    // 响应式多选态下锁住详情：有选中项时点击列表只做选择，不跳阅读页
    if (selectedCount.value > 0) return
    await expandMail(id, () => mail.openEmail(id))
    return
  }
  await mail.openEmail(id)
}

/** 收起展开的卡片并清掉当前邮件（数据清理放在 Flip 切换之后，目标态即最终态） */
async function backToList(): Promise<void> {
  await collapseMail(() => mail.closeEmail())
}

function reply(): void {
  if (mail.selectedEmail) composer.openReply(mail.selectedEmail, false)
}

function forward(): void {
  if (mail.selectedEmail) composer.openForward(mail.selectedEmail)
}

useHotkeys([
  { key: 'c', handler: () => composer.openNew(), when: hotkeysActive },
  {
    key: 'j',
    handler: () => mail.moveSelection(1),
    when: () => hotkeysActive() && Boolean(mail.selectedId) && !reading.value,
  },
  {
    key: 'k',
    handler: () => mail.moveSelection(-1),
    when: () => hotkeysActive() && Boolean(mail.selectedId) && !reading.value,
  },
  {
    key: 'r',
    handler: () => {
      if (mail.selectedEmail) composer.openReply(mail.selectedEmail, false)
    },
    when: () => hotkeysActive() && Boolean(mail.selectedEmail),
  },
  {
    key: 'Escape',
    handler: () => {
      if (reading.value) void backToList()
      else mail.closeEmail()
    },
    when: hotkeysActive,
    allowInInput: true,
  },
])
</script>

<template>
  <main class="flex min-w-0 flex-1">
    <MailList
      :expanded-id="expandedId"
      @select="openEmail"
    />

    <!-- 桌面端右侧阅读区；响应式下正文由列表卡片就地展开承担 -->
    <MailReader
      :email="mail.selectedEmail"
      :loading="mail.loadingEmail"
      class="max-lg:hidden"
      @star="(value) => mail.setStarred(mail.selectedId, value)"
      @unread="markUnread"
      @archive="archiveSelected"
      @remove="removeSelected"
    />

    <!--
      响应式正文的两个大悬浮胶囊（回复 / 转发）。
      与顶栏共用同一个收起状态：下滑正文时一起沉下去，上滑一起浮回来。
    -->
    <div
      v-if="readingOnMobile"
      class="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex gap-2 pl-[calc(0.75rem+var(--app-safe-left))] pr-[calc(0.75rem+var(--app-safe-right))] pb-[max(12px,var(--app-safe-bottom))] transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] lg:hidden"
      :class="topBarHidden ? 'translate-y-[calc(100%+16px)]' : 'translate-y-0'"
    >
      <button
        type="button"
        class="pointer-events-auto flex h-12 flex-1 cursor-pointer items-center justify-center gap-2 rounded-full bg-brand text-[15px] font-medium text-white shadow-pop transition-transform duration-150 hover:bg-brand-strong active:scale-[0.98]"
        @click="reply"
      >
        <CornerUpLeft class="h-[17px] w-[17px]" :stroke-width="2.2" />
        回复
      </button>
      <button
        type="button"
        class="pointer-events-auto flex h-12 flex-1 cursor-pointer items-center justify-center gap-2 rounded-full border border-line bg-surface text-[15px] font-medium text-ink shadow-pop transition-transform duration-150 active:scale-[0.98]"
        @click="forward"
      >
        <CornerUpRight class="h-[17px] w-[17px]" :stroke-width="2.2" />
        转发
      </button>
    </div>

    <!-- 写信浮层自身 Teleport 到 body，挂在这里只是为了跟随邮件页生命周期 -->
    <Composer />
  </main>
</template>
