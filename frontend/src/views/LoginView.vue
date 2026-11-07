<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowRight, FlaskConical, KeyRound, Mail, ShieldCheck, Server } from 'lucide-vue-next'
import { useAuthStore } from '../stores/auth'
import AppButton from '../components/ui/AppButton.vue'
import AppInput from '../components/ui/AppInput.vue'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()

const mail = ref('')
const password = ref('')
const submitted = ref(false)
const localError = ref('')
/** 本地演示提示；生产构建里 DEV 为 false，动态 import 会被整段移除 */
const mockHint = ref('')

const mailHost = computed(() => (import.meta.env.VITE_MAIL_HOST as string) || window.location.hostname)
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
  <div class="flex min-h-full flex-col bg-canvas lg:flex-row">
    <!-- 品牌区 -->
    <section class="brand-gradient relative hidden flex-1 overflow-hidden lg:block">
      <div class="grid-noise absolute inset-0" />
      <div
        class="absolute -left-24 top-1/3 h-[420px] w-[420px] rounded-full bg-[#2F5BEA]/30 blur-[120px]"
      />
      <div
        class="absolute -right-16 bottom-0 h-[360px] w-[360px] rounded-full bg-[#12876F]/25 blur-[120px]"
      />

      <div class="relative flex h-full flex-col justify-between p-12 text-white">
        <div class="flex items-center gap-3">
          <div
            class="flex h-10 w-10 items-center justify-center rounded-xl border border-white/20 bg-white/10 backdrop-blur"
          >
            <Mail class="h-5 w-5" />
          </div>
          <span class="text-[15px] font-semibold tracking-wide">邮局</span>
        </div>

        <div class="max-w-[420px]">
          <h1 class="text-[34px] font-semibold leading-[1.25] tracking-tight">
            自己的邮件，<br />放在自己的机器上。
          </h1>
          <p class="mt-4 text-[14px] leading-relaxed text-white/70">
            后端是 Stalwart，前端是这份自研界面。邮件正文、附件、账号数据全部落在你自己的磁盘里，
            没有第三方参与。
          </p>

          <dl class="mt-10 grid grid-cols-2 gap-5 text-[13px]">
            <div class="rounded-xl border border-white/10 bg-white/5 p-3.5 backdrop-blur">
              <dt class="flex items-center gap-1.5 text-white/55">
                <Server class="h-3.5 w-3.5" /> 协议
              </dt>
              <dd class="mt-1 font-medium">JMAP · IMAP · SMTP</dd>
            </div>
            <div class="rounded-xl border border-white/10 bg-white/5 p-3.5 backdrop-blur">
              <dt class="flex items-center gap-1.5 text-white/55">
                <ShieldCheck class="h-3.5 w-3.5" /> 数据
              </dt>
              <dd class="mt-1 font-medium">本地 RocksDB</dd>
            </div>
          </dl>
        </div>

        <p class="text-[12px] text-white/40">
          {{ mailHost }} · 自托管邮件服务
        </p>
      </div>
    </section>

    <!-- 登录区 -->
    <section class="flex flex-1 items-center justify-center px-5 py-12">
      <div class="w-full max-w-[380px]">
        <div class="mb-8 flex items-center gap-2.5 lg:hidden">
          <div class="flex h-9 w-9 items-center justify-center rounded-xl bg-brand text-white">
            <Mail class="h-4.5 w-4.5" />
          </div>
          <span class="text-[15px] font-semibold text-ink">邮局</span>
        </div>

        <h2 class="text-[22px] font-semibold tracking-tight text-ink">登录邮箱</h2>
        <p class="mt-1.5 text-[13px] text-ink-3">
          使用完整邮箱地址与密码。凭据只保存在本标签页，关闭即失效。
        </p>

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

        <div class="mt-6 flex items-start gap-2 text-[12px] leading-relaxed text-ink-3">
          <ShieldCheck class="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal" />
          <p>
            连接地址 <span class="font-medium text-ink-2">{{ mailHost }}</span
            >，走同源 HTTPS 反向代理。若登录失败，先确认服务器上的邮件服务正在运行。
          </p>
        </div>
      </div>
    </section>
  </div>
</template>
