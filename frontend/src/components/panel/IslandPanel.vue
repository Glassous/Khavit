<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'

/**
 * 岛内面板外壳：绝对定位铺满「岛」，盖在邮件列表之上但不动顶栏与侧栏。
 * 打开期间邮件页仍然挂载，关掉就回到原来的列表位置。
 *
 * 面板不带自己的关闭按钮，顶部与内容之间也不画分割线——它就是岛里的另一层内容。
 * 退出方式：Esc、再点一次侧栏里同一项（设置/管理后台），或点任意文件夹。
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
    class="absolute inset-0 z-20 flex flex-col overflow-hidden bg-surface max-lg:pt-[var(--topbar-safe)]"
    :aria-label="title"
  >
    <!-- 标题行：只留标题与说明，右侧给页面自己的操作（如管理后台的刷新/新建） -->
    <header class="flex shrink-0 items-center gap-3 px-4 pb-1 pt-3.5 sm:px-6">
      <div class="min-w-0 flex-1">
        <h2 class="truncate text-[15px] font-semibold tracking-tight text-ink">{{ title }}</h2>
        <p v-if="description" class="mt-0.5 truncate text-[11.5px] text-ink-3">{{ description }}</p>
      </div>

      <slot name="actions" />
    </header>

    <div class="min-h-0 flex-1 overflow-y-auto scroll-slim">
      <slot />
    </div>
  </section>
</template>
