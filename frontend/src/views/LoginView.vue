<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowRight, FlaskConical, KeyRound, Mail } from 'lucide-vue-next'
import { useAuthStore } from '../stores/auth'
import AppButton from '../components/ui/AppButton.vue'
import AppInput from '../components/ui/AppInput.vue'
import BrandMark from '../components/ui/BrandMark.vue'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()

const mail = ref('')
const password = ref('')
const submitted = ref(false)
const localError = ref('')
/** 本地演示提示；生产构建里 DEV 为 false，动态 import 会被整段移除 */
const mockHint = ref('')

const mailError = computed(() => {
  if (localError.value) return localError.value
  if (submitted.value && !mail.value.includes('@')) return '请输入完整邮箱地址'
  return ''
})

onMounted(async () => {
  if (import.meta.env.DEV && (import.meta.env.VITE_USE_MOCK as string | undefined)?.toLowerCase() !== 'false') {
    mockHint.value = (await import('../mocks')).MOCK_HINT
  }

  if (auth.isLoggedIn) {
    await router.replace('/mail')
    return
  }
  const restored = await auth.bootstrap()
  if (restored) await router.replace('/mail')
})

async function submit(): Promise<void> {
  submitted.value = true
  localError.value = ''
  if (!mail.value.includes('@')) return
  if (!password.value) {
    localError.value = '请输入密码'
    return
  }

  const ok = await auth.login(mail.value, password.value)
  if (!ok) {
    localError.value = auth.error || '登录失败'
    password.value = ''
    return
  }

  const next = typeof route.query.next === 'string' ? route.query.next : '/mail'
  await router.replace(next)
}
</script>

<template>
  <div class="flex min-h-full items-center justify-center bg-canvas pl-[calc(1.25rem+var(--app-safe-left))] pr-[calc(1.25rem+var(--app-safe-right))] pt-[calc(3rem+var(--app-safe-top))] pb-[calc(3rem+var(--app-safe-bottom))]">
    <div class="w-full max-w-[380px]">
      <div class="mb-9 flex items-center gap-2.5">
        <BrandMark class="h-6 w-6 shrink-0 text-brand" />
        <span class="text-[15px] font-semibold text-ink">Khavit邮局</span>
      </div>

      <h1 class="text-[22px] font-semibold tracking-tight text-ink">登录邮箱</h1>
      <p class="mt-1.5 text-[13px] text-ink-3">使用完整邮箱地址与密码。</p>

      <!-- 仅本地开发出现：文案来自 mock 模块，生产构建不会加载 -->
      <div
        v-if="mockHint"
        class="mt-4 flex items-start gap-2 rounded-lg border border-teal/25 bg-teal/8 px-3 py-2 text-[12px] leading-relaxed text-teal"
      >
        <FlaskConical class="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <p>{{ mockHint }}</p>
      </div>

      <!-- novalidate：浏览器原生校验提示跟随系统语言（可能是英文），改用下方中文校验 -->
      <form class="mt-7 flex flex-col gap-4" novalidate @submit.prevent="submit">
        <AppInput
          v-model="mail"
          label="邮箱地址"
          type="email"
          size="lg"
          placeholder="you@example.com"
          autocomplete="username"
          :error="mailError"
        >
          <template #leading>
            <Mail class="h-4 w-4 shrink-0 text-ink-4" />
          </template>
        </AppInput>

        <AppInput
          v-model="password"
          label="密码"
          type="password"
          size="lg"
          placeholder="输入密码"
          autocomplete="current-password"
          @enter="submit"
        >
          <template #leading>
            <KeyRound class="h-4 w-4 shrink-0 text-ink-4" />
          </template>
        </AppInput>

        <div
          v-if="localError"
          class="rounded-lg border border-danger/25 bg-danger/8 px-3 py-2 text-[12.5px] leading-relaxed text-danger"
        >
          {{ localError }}
        </div>

        <AppButton type="submit" variant="primary" size="lg" block :loading="auth.loading">
          登录
          <template #trailing>
            <ArrowRight v-if="!auth.loading" class="h-4 w-4" />
          </template>
        </AppButton>
      </form>
    </div>
  </div>
</template>
