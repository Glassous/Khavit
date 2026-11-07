<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue'
import { ChevronDown, CornerUpLeft, ImageOff, Mail, ShieldAlert } from 'lucide-vue-next'
import type { Email } from '../../jmap/types'
import { useTheme } from '../../composables/useTheme'
import { useComposerStore } from '../../stores/composer'
import { buildIframeDoc, sanitizeEmailHtml, textToHtml } from '../../utils/renderSafeHtml'
import { allowImageSender, isImageSenderAllowed } from '../../utils/storage'
import { avatarColor, domainOf, formatAddress, formatBytes, formatFullTime, initialOf } from '../../utils/format'
import MailToolbar from './MailToolbar.vue'
import AttachmentList from './AttachmentList.vue'
import AppSkeleton from '../ui/AppSkeleton.vue'
import AppEmpty from '../ui/AppEmpty.vue'

const props = withDefaults(
  defineProps<{ email: Email | null; loading?: boolean }>(),
  { loading: false },
)

const emit = defineEmits<{
  back: []
  star: [starred: boolean]
  unread: []
  archive: []
  remove: []
}>()

const { isDark } = useTheme()
const composer = useComposerStore()

const allowImages = ref(false)
const showDetails = ref(false)
const frameRef = ref<HTMLIFrameElement | null>(null)
const frameHeight = ref(320)

const sender = computed(() => props.email?.from?.[0] ?? null)
const senderEmail = computed(() => sender.value?.email ?? '')
const senderDomain = computed(() => domainOf(senderEmail.value))
const starred = computed(() => Boolean(props.email?.keywords?.$flagged))
const subject = computed(() => props.email?.subject?.trim() || '(无主题)')

const rawBody = computed(() => {
  const email = props.email
  if (!email) return ''
  const htmlPart = email.htmlBody?.find((part) => part.partId)?.partId
  if (htmlPart && email.bodyValues?.[htmlPart]?.value) {
    return email.bodyValues[htmlPart].value
  }
  const textPart = email.textBody?.find((part) => part.partId)?.partId
  if (textPart && email.bodyValues?.[textPart]?.value) {
    return textToHtml(email.bodyValues[textPart].value)
  }
  const anyValue = email.bodyValues ? Object.values(email.bodyValues)[0]?.value : ''
  return anyValue ? textToHtml(anyValue) : '<p style="color:#8a93a3">（这封邮件没有可显示的正文）</p>'
})

const sanitized = computed(() => sanitizeEmailHtml(rawBody.value, allowImages.value))
const iframeDoc = computed(() => buildIframeDoc(sanitized.value.html, isDark.value))

const recipients = computed(() => {
  const email = props.email
  if (!email) return [] as { label: string; value: string }[]
  const rows: { label: string; value: string }[] = []
  if (email.to?.length) rows.push({ label: '收件人', value: email.to.map(formatAddress).join('、') })
  if (email.cc?.length) rows.push({ label: '抄送', value: email.cc.map(formatAddress).join('、') })
  if (email.bcc?.length) rows.push({ label: '密送', value: email.bcc.map(formatAddress).join('、') })
  return rows
})

function measure(): void {
  const doc = frameRef.value?.contentDocument
  if (!doc?.body) return
  // 用 body 的内容高度，避免 iframe 自身视口高度把结果撑大
  const rect = doc.body.getBoundingClientRect()
  const content = Math.max(Math.ceil(rect.height), doc.body.scrollHeight)
  frameHeight.value = Math.max(80, Math.min(content + 24, 20000))
}

async function onFrameLoad(): Promise<void> {
  await nextTick()
  measure()
  // 图片/字体加载后高度会变，补测一次
  setTimeout(measure, 600)
}

function showRemoteImages(): void {
  if (senderDomain.value) allowImageSender(senderDomain.value)
  allowImages.value = true
}

watch(
  () => props.email?.id,
  () => {
    showDetails.value = false
    frameHeight.value = 320
    allowImages.value = senderDomain.value ? isImageSenderAllowed(senderDomain.value) : false
  },
  { immediate: true },
)

watch(senderDomain, (domain) => {
  allowImages.value = domain ? isImageSenderAllowed(domain) : false
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
        :email="email"
        :starred="starred"
        @back="emit('back')"
        @star="emit('star', !starred)"
        @unread="emit('unread')"
        @archive="emit('archive')"
        @remove="emit('remove')"
        @reply="composer.openReply(email, false)"
        @forward="composer.openForward(email)"
      />

      <div class="min-h-0 flex-1 overflow-y-auto scroll-slim">
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

        <!-- 外部图片拦截提示 -->
        <div
          v-if="sanitized.blockedImages > 0 && !allowImages"
          class="mx-4 mb-3 flex items-center gap-2 rounded-lg border border-amber/25 bg-amber/8 px-3 py-2 sm:mx-6"
        >
          <ImageOff class="h-3.5 w-3.5 shrink-0 text-amber" />
          <p class="min-w-0 flex-1 text-[12px] leading-relaxed text-amber">
            已拦截 {{ sanitized.blockedImages }} 张外部图片，避免发件人追踪。
          </p>
          <button
            type="button"
            class="shrink-0 cursor-pointer rounded-md border border-amber/30 px-2 py-0.5 text-[11.5px] font-medium text-amber transition-colors hover:bg-amber/10"
            @click="showRemoteImages"
          >
            显示图片
          </button>
        </div>

        <!-- 正文：sandbox iframe，禁止脚本 -->
        <div class="px-4 pb-2 sm:px-6">
          <iframe
            ref="frameRef"
            :srcdoc="iframeDoc"
            sandbox="allow-same-origin allow-popups"
            referrerpolicy="no-referrer"
            class="w-full border-0"
            :style="{ height: `${frameHeight}px` }"
            title="邮件正文"
            @load="onFrameLoad"
          />
        </div>

        <AttachmentList v-if="email.attachments?.length" :attachments="email.attachments" />

        <!-- 快捷回复 -->
        <div class="px-4 py-4 sm:px-6">
          <button
            type="button"
            class="flex w-full cursor-pointer items-center gap-2 rounded-[10px] border border-line bg-surface-2/60 px-3 py-2.5 text-left text-[12.5px] text-ink-3 transition-colors hover:border-brand/40 hover:bg-surface"
            @click="composer.openReply(email, false)"
          >
            <CornerUpLeft class="h-3.5 w-3.5" />
            回复 {{ sender?.name?.trim() || senderEmail }}…
          </button>

          <p class="mt-3 flex items-center gap-1.5 text-[11px] text-ink-4">
            <ShieldAlert class="h-3 w-3" />
            正文在隔离沙箱中渲染，脚本与表单已被移除。
          </p>
        </div>
      </div>
    </template>
  </section>
</template>
