<script setup lang="ts">
import { computed, ref } from 'vue'
import { ChevronDown, Mail } from 'lucide-vue-next'
import type { Email } from '../../jmap/types'
import { useComposerStore } from '../../stores/composer'
import { avatarColor, formatAddress, formatBytes, formatFullTime, initialOf } from '../../utils/format'
import MailToolbar from './MailToolbar.vue'
import MailBody from './MailBody.vue'
import AttachmentList from './AttachmentList.vue'
import AppSkeleton from '../ui/AppSkeleton.vue'
import AppEmpty from '../ui/AppEmpty.vue'

/**
 * 桌面端右侧阅读区。
 * 响应式下这里不渲染：正文由列表里的卡片就地展开承担（见 MailListItem + useMailExpand），
 * 这样「小卡片 → 大卡片」才是同一个 DOM 节点的连续变形，而不是两套界面叠在一起。
 */
const props = withDefaults(
  defineProps<{ email: Email | null; loading?: boolean }>(),
  { loading: false },
)

const emit = defineEmits<{
  star: [starred: boolean]
  unread: []
  archive: []
  remove: []
}>()

const composer = useComposerStore()

const showDetails = ref(false)

const sender = computed(() => props.email?.from?.[0] ?? null)
const senderEmail = computed(() => sender.value?.email ?? '')
const starred = computed(() => Boolean(props.email?.keywords?.$flagged))
const subject = computed(() => props.email?.subject?.trim() || '(无主题)')

const recipients = computed(() => {
  const email = props.email
  if (!email) return [] as { label: string; value: string }[]
  const rows: { label: string; value: string }[] = []
  if (email.to?.length) rows.push({ label: '收件人', value: email.to.map(formatAddress).join('、') })
  if (email.cc?.length) rows.push({ label: '抄送', value: email.cc.map(formatAddress).join('、') })
  if (email.bcc?.length) rows.push({ label: '密送', value: email.bcc.map(formatAddress).join('、') })
  return rows
})
</script>

<template>
  <section class="flex h-full min-w-0 flex-1 flex-col bg-surface">
    <!-- 加载态 -->
    <div v-if="loading" class="flex-1 p-6">
      <div class="flex items-center gap-3">
        <div class="shimmer h-10 w-10 rounded-full" />
        <div class="flex-1">
          <AppSkeleton :rows="2" height="11px" />
        </div>
      </div>
      <div class="mt-8">
        <AppSkeleton :rows="6" height="12px" />
      </div>
    </div>

    <!-- 未选中 -->
    <AppEmpty
      v-else-if="!email"
      title="选择一封邮件开始阅读"
      description="用 j / k 上下切换邮件，按 c 撰写新邮件，按 / 搜索。"
      class="flex-1"
    >
      <template #icon>
        <Mail class="h-6 w-6" />
      </template>
    </AppEmpty>

    <template v-else>
      <MailToolbar
        :starred="starred"
        @star="emit('star', !starred)"
        @unread="emit('unread')"
        @archive="emit('archive')"
        @remove="emit('remove')"
        @reply="composer.openReply(email, false)"
        @forward="composer.openForward(email)"
      />

      <div class="min-h-0 flex-1 overflow-y-auto scroll-slim pb-4">
        <!-- 主题与发件人 -->
        <header class="px-4 pb-3 pt-4 sm:px-6">
          <h1 class="text-[19px] font-semibold leading-snug tracking-tight text-ink">
            {{ subject }}
          </h1>

          <div class="mt-3 flex items-start gap-3">
            <span
              class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold text-white/95"
              :class="avatarColor(senderEmail)"
            >
              {{ initialOf(sender?.name || senderEmail) }}
            </span>

            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span class="text-[13.5px] font-medium text-ink">
                  {{ sender?.name?.trim() || senderEmail || '未知发件人' }}
                </span>
                <span class="truncate text-[12px] text-ink-3">&lt;{{ senderEmail }}&gt;</span>
              </div>
              <button
                type="button"
                class="mt-0.5 flex cursor-pointer items-center gap-1 text-[11.5px] text-ink-3 transition-colors hover:text-ink"
                @click="showDetails = !showDetails"
              >
                发送给 {{ recipients[0]?.value ?? '我' }}
                <ChevronDown
                  class="h-3 w-3 transition-transform duration-150"
                  :class="showDetails ? 'rotate-180' : ''"
                />
              </button>

              <div v-if="showDetails" class="mt-2 space-y-1 rounded-lg bg-surface-2 px-2.5 py-2">
                <p v-for="row in recipients" :key="row.label" class="text-[11.5px] leading-relaxed text-ink-3">
                  <span class="mr-1.5 text-ink-4">{{ row.label }}</span>{{ row.value }}
                </p>
                <p class="text-[11.5px] leading-relaxed text-ink-3">
                  <span class="mr-1.5 text-ink-4">时间</span>{{ formatFullTime(email.receivedAt ?? email.sentAt) }}
                </p>
                <p class="text-[11.5px] leading-relaxed text-ink-3">
                  <span class="mr-1.5 text-ink-4">大小</span>{{ formatBytes(email.size) }}
                  <span v-if="email.attachments?.length" class="ml-2">附件 {{ email.attachments.length }} 个</span>
                </p>
              </div>
            </div>

            <time class="hidden shrink-0 text-[11.5px] tabular-nums text-ink-4 sm:block">
              {{ formatFullTime(email.receivedAt ?? email.sentAt) }}
            </time>
          </div>
        </header>

        <div class="px-4 pb-2 sm:px-6">
          <MailBody :email="email" />
        </div>

        <AttachmentList v-if="email.attachments?.length" :attachments="email.attachments" />
      </div>
    </template>
  </section>
</template>
