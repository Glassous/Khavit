<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'

/**
 * 岛内面板外壳：绝对定位铺满「岛」，盖在邮件列表之上但不动顶栏与侧栏。
 * 打开期间邮件页仍然挂载，关掉就回到原来的列表位置。
 *
 * 两种形态：
 * - 桌面端：岛本身是白色卡纸，标题行 + 内容直接铺在里面（顶行与内容之间不画分割线）。
 * - 响应式：和邮件列表完全一致——背景取外壳底色，内容各自成「岛」；
 *   标题行交给顶栏（返回键 + 面板名），这里不再重复显示。
 *
 * 面板不带自己的关闭按钮。退出方式：顶栏返回键（响应式）、Esc、
 * 再点一次侧栏里同一项（设置/管理后台），或点任意文件夹。
 */
withDefaults(defineProps<{ title: string; description?: string }>(), { description: undefined })
const emit = defineEmits<{ close: [] }>()

/**
 * Esc 关闭。AppDialog / AppDrawer 这类模态自己也会监听 Esc，
 * 有模态在场时先让它们关，别把整个面板一起带走。
 */
function onKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return
  if (document.querySelector('[aria-modal="true"]')) return
  emit('close')
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <section
    class="absolute inset-0 z-20 flex flex-col overflow-hidden bg-surface max-lg:bg-canvas-deep"
    :aria-label="title"
  >
    <!-- 标题行：桌面端才有；响应式下标题由顶栏承担，省掉这一整块 -->
    <header class="flex shrink-0 items-center gap-3 px-4 pb-1 pt-3.5 sm:px-6 max-lg:hidden">
      <div class="min-w-0 flex-1">
        <h2 class="truncate text-[15px] font-semibold tracking-tight text-ink">{{ title }}</h2>
        <p v-if="description" class="mt-0.5 truncate text-[11.5px] text-ink-3">{{ description }}</p>
      </div>

      <slot name="actions" />
    </header>

    <!--
      响应式：与邮件列表同一套滚动容器——安全距离写成 padding 而不是让整个面板下移，
      内容因此会从透明顶栏下方「穿过去」，由顶栏自带的 .topbar-veil 磨砂掉；
      左右留白与底部间距也与列表一致，卡片自己浮在外壳底色上。
    -->
    <div
      class="min-h-0 flex-1 overflow-y-auto scroll-slim max-lg:pl-[calc(0.5rem+var(--app-safe-left))] max-lg:pr-[calc(0.5rem+var(--app-safe-right))] max-lg:pb-[calc(0.75rem+var(--app-safe-bottom))] max-lg:pt-[var(--topbar-safe)]"
    >
      <slot />
    </div>
  </section>
</template>
