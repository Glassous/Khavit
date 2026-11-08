<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import MailList from '../components/mail/MailList.vue'
import MailReader from '../components/mail/MailReader.vue'
import Composer from '../components/compose/Composer.vue'
import { useAuthStore } from '../stores/auth'
import { useMailStore } from '../stores/mail'
import { useComposerStore } from '../stores/composer'
import { useHotkeys } from '../composables/useHotkeys'
import { useToast } from '../composables/useToast'
import { useConfirm } from '../composables/useConfirm'
import type { Mailbox } from '../jmap/types'

const auth = useAuthStore()
const mail = useMailStore()
const composer = useComposerStore()
const route = useRoute()
const router = useRouter()
const toast = useToast()
const { confirm } = useConfirm()

const mobileReader = ref(false)

const readingOnMobile = computed(() => mobileReader.value && Boolean(mail.selectedId))

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
    if (inbox) await router.replace(`/mail/${inbox.role ?? inbox.id}`)
  }
})

watch(
  () => route.params.mailbox,
  () => {
    void syncFromRoute()
  },
)

async function openEmail(id: string): Promise<void> {
  mobileReader.value = true
  await mail.openEmail(id)
}

function backToList(): void {
  mobileReader.value = false
  mail.closeEmail()
}

async function removeSelected(): Promise<boolean> {
  const current = mail.selectedEmail
  if (!current) return false
  const ok = await confirm({
    title: '删除这封邮件？',
    description: '在收件箱中删除会移入回收站，在回收站中删除则永久清除。',
    confirmLabel: '删除',
    tone: 'danger',
  })
  if (!ok) return false

  const result = await mail.remove(current.id)
  mobileReader.value = false
  toast.action(result === 'moved' ? '已移入回收站' : '已永久删除', '撤销', () => {
    void mail.loadFirstPage()
  })
  return true
}

async function archiveSelected(): Promise<void> {
  const current = mail.selectedEmail
  if (!current) return
  await mail.archive(current.id)
  mobileReader.value = false
  toast.success('已归档')
}

async function markUnread(): Promise<void> {
  const current = mail.selectedEmail
  if (!current) return
  await mail.toggleRead(current.id, false)
  mail.closeEmail()
  mobileReader.value = false
  toast.success('已标记为未读')
}

useHotkeys([
  { key: 'c', handler: () => composer.openNew() },
  {
    key: 'j',
    handler: () => mail.moveSelection(1),
    when: () => Boolean(mail.selectedId),
  },
  {
    key: 'k',
    handler: () => mail.moveSelection(-1),
    when: () => Boolean(mail.selectedId),
  },
  {
    key: 'r',
    handler: () => {
      if (mail.selectedEmail) composer.openReply(mail.selectedEmail, false)
    },
    when: () => Boolean(mail.selectedEmail),
  },
  {
    key: 'Escape',
    handler: () => {
      if (mobileReader.value) backToList()
      else mail.closeEmail()
    },
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
      @back="backToList"
      @star="(value) => mail.setStarred(mail.selectedId, value)"
      @unread="markUnread"
      @archive="archiveSelected"
      @remove="removeSelected"
    />

    <!-- 写信浮层自身 Teleport 到 body，挂在这里只是为了跟随邮件页生命周期 -->
    <Composer />
  </main>
</template>
