<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue'
import { ImageOff } from 'lucide-vue-next'
import type { Email } from '../../jmap/types'
import { useTheme } from '../../composables/useTheme'
import { buildIframeDoc, sanitizeEmailHtml, textToHtml } from '../../utils/renderSafeHtml'
import { allowImageSender, isImageSenderAllowed } from '../../utils/storage'
import { domainOf } from '../../utils/format'
import AppSkeleton from '../ui/AppSkeleton.vue'

/**
 * 邮件正文本体：拦截提示 + 沙箱 iframe。
 * 桌面阅读区（MailReader）与响应式展开的「正文岛」（MailListItem）共用这一份，
 * 两处渲染出来的正文完全一致；附件由各自的岛屿单独渲染。
 */
const props = withDefaults(defineProps<{ email: Email | null; loading?: boolean }>(), { loading: false })

const { isDark } = useTheme()

const allowImages = ref(false)
const frameRef = ref<HTMLIFrameElement | null>(null)
const frameHeight = ref(320)

const senderDomain = computed(() => domainOf(props.email?.from?.[0]?.email ?? ''))

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
  <div>
    <div v-if="loading || !email" class="space-y-3">
      <AppSkeleton :rows="5" height="12px" />
    </div>

    <template v-else>
      <!-- 外部图片拦截提示 -->
      <div
        v-if="sanitized.blockedImages > 0 && !allowImages"
        class="mb-3 flex items-center gap-2 rounded-lg border border-amber/25 bg-amber/8 px-3 py-2"
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
    </template>
  </div>
</template>
