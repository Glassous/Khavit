<script setup lang="ts">
import { Compass } from 'lucide-vue-next'
import AppButton from '../components/ui/AppButton.vue'
</script>

<template>
  <div class="flex min-h-full items-center justify-center bg-canvas px-6">
    <div class="max-w-[420px] text-center">
      <div class="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-line bg-surface text-ink-4">
        <Compass class="h-6 w-6" />
      </div>
      <h1 class="mt-5 text-[22px] font-semibold tracking-tight text-ink">页面不存在</h1>
      <p class="mt-2 text-[13px] leading-relaxed text-ink-3">
        这个地址没有对应的页面。可能是链接过期，或者你手动改错了路径。
      </p>
      <RouterLink to="/mail" class="mt-6 inline-block">
        <AppButton variant="primary">回到收件箱</AppButton>
      </RouterLink>
    </div>
  </div>
</template>
