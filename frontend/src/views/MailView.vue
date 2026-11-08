<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
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
import { useMobileReader } from '../composables/useMobileReader'
import { useMailActions } from '../composables/useMailActions'
import type { Mailbox } from '../jmap/types'

const auth = useAuthStore()
const mail = useMailStore()
const composer = useComposerStore()
const route = useRoute()
const router = useRouter()
const { count: selectedCount } = useMailSelection()
const { isDesktop } = useSidebar()
const { open: panelOpen } = useIslandPanel()
/** 响应式正文页的开关与顶栏共享，顶栏据此切换成「返回 + 邮件操作」 */
const { reading } = useMobileReader()
const { markUnread, archive: archiveSelected, remove: removeSelected } = useMailActions()

/**
 * 设置/管理后台盖在邮件页之上时，邮件页的快捷键全部让位：
 * Esc 归面板关闭，c/j/k/r 不该在被挡住的时候还生效。
 */
const hotkeysActive = (): boolean => !panelOpen.value

const readingOnMobile = computed(() => reading.value && Boolean(mail.selectedId))

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

async function openEmail(id: string): Promise<void> {
  // 响应式多选态下锁住详情：有选中项时点击列表只做选择，不跳阅读页
  if (!isDesktop.value && selectedCount.value > 0) return
  reading.value = true
  await mail.openEmail(id)
}

function backToList(): void {
  reading.value = false
  mail.closeEmail()
}

useHotkeys([
  { key: 'c', handler: () => composer.openNew(), when: hotkeysActive },
  {
    key: 'j',
    handler: () => mail.moveSelection(1),
    when: () => hotkeysActive() && Boolean(mail.selectedId),
  },
  {
    key: 'k',
    handler: () => mail.moveSelection(-1),
    when: () => hotkeysActive() && Boolean(mail.selectedId),
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
      if (reading.value) backToList()
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
      :class="readingOnMobile ? 'max-lg:hidden' : ''"
      @select="openEmail"
    />

    <MailReader
      :email="mail.selectedEmail"
      :loading="mail.loadingEmail"
      :class="readingOnMobile ? '' : 'max-lg:hidden'"
      @star="(value) => mail.setStarred(mail.selectedId, value)"
      @unread="markUnread"
      @archive="archiveSelected"
      @remove="removeSelected"
    />

    <!-- 写信浮层自身 Teleport 到 body，挂在这里只是为了跟随邮件页生命周期 -->
    <Composer />
  </main>
</template>
