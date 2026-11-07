<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  ChevronDown,
  Command,
  LogOut,
  Mail,
  Menu,
  Moon,
  Search,
  Settings,
  ShieldCheck,
  Sun,
  X,
} from 'lucide-vue-next'
import { useAuthStore } from '../../stores/auth'
import { useMailStore } from '../../stores/mail'
import { useTheme } from '../../composables/useTheme'
import { useConfirm } from '../../composables/useConfirm'
import { initialOf, avatarColor } from '../../utils/format'

withDefaults(defineProps<{ searchable?: boolean }>(), { searchable: true })
const emit = defineEmits<{ 'toggle-sidebar': [] }>()

const auth = useAuthStore()
const mail = useMailStore()
const router = useRouter()
const { isDark, toggle } = useTheme()
const { confirm } = useConfirm()

const searchRef = ref<HTMLInputElement | null>(null)
const menuOpen = ref(false)
const searching = ref(false)

const accountEmail = computed(() => auth.user)
const initial = computed(() => initialOf(auth.displayName))
const color = computed(() => avatarColor(auth.user || 'postal'))

function focusSearch(): void {
  searchRef.value?.focus()
}

async function onSearchInput(event: Event): Promise<void> {
  const value = (event.target as HTMLInputElement).value
  mail.searchText = value
  searching.value = Boolean(value.trim())
  if (!value.trim()) {
    await mail.clearSearch()
    return
  }
  if (router.currentRoute.value.name !== 'mail') {
    await router.push('/mail')
  }
  await mail.runSearch(value)
}

async function clearSearch(): Promise<void> {
  mail.searchText = ''
  searching.value = false
  await mail.clearSearch()
}

async function logout(): Promise<void> {
  const ok = await confirm({
    title: '退出登录？',
    description: '会话凭据会从本标签页清除，草稿保存在服务器上不会丢失。',
    confirmLabel: '退出',
    tone: 'danger',
  })
  if (!ok) return
  auth.logout()
  mail.reset()
  await router.replace('/login')
}

function onGlobalKey(event: KeyboardEvent): void {
  const target = event.target
  const typing =
    target instanceof HTMLElement &&
    (['INPUT', 'TEXTAREA'].includes(target.tagName) || target.isContentEditable)

  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault()
    focusSearch()
    return
  }
  if (event.key === '/' && !typing) {
    event.preventDefault()
    focusSearch()
  }
  if (event.key === 'Escape' && document.activeElement === searchRef.value) {
    searchRef.value?.blur()
  }
}

onMounted(() => window.addEventListener('keydown', onGlobalKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onGlobalKey))
</script>

<template>
  <header
    class="glass relative z-30 flex h-14 shrink-0 items-center gap-3 border-b border-line px-3 sm:px-4"
  >
    <button
      type="button"
      class="cursor-pointer rounded-lg p-2 text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink lg:hidden"
      aria-label="打开菜单"
      @click="emit('toggle-sidebar')"
    >
      <Menu class="h-4.5 w-4.5" />
    </button>

    <RouterLink to="/mail" class="flex shrink-0 items-center gap-2.5 rounded-lg pr-1">
      <span class="flex h-8 w-8 items-center justify-center rounded-[9px] bg-brand text-white shadow-[0_2px_8px_-2px_rgb(47_91_234/0.6)]">
        <Mail class="h-4 w-4" />
      </span>
      <span class="hidden text-[14.5px] font-semibold tracking-tight text-ink sm:block">邮局</span>
    </RouterLink>

    <!-- 搜索 -->
    <div class="mx-auto flex w-full max-w-[520px] items-center">
      <div
        class="group flex h-9 w-full items-center gap-2 rounded-[10px] border bg-surface/80 px-3 transition-colors duration-150"
        :class="searching ? 'border-brand/50' : 'border-line focus-within:border-brand hover:border-line-strong'"
      >
        <Search class="h-4 w-4 shrink-0 text-ink-4" />
        <input
          ref="searchRef"
          :value="mail.searchText"
          type="search"
          :disabled="!searchable"
          placeholder="搜索主题、发件人或正文…"
          class="h-full w-full border-0 bg-transparent p-0 text-[13.5px] text-ink outline-none ring-0 placeholder:text-ink-4 focus:outline-none disabled:cursor-not-allowed"
          aria-label="搜索邮件"
          @input="onSearchInput"
        />
        <button
          v-if="searching"
          type="button"
          class="cursor-pointer rounded p-0.5 text-ink-3 hover:text-ink"
          aria-label="清除搜索"
          @click="clearSearch"
        >
          <X class="h-3.5 w-3.5" />
        </button>
        <span
          v-else
          class="hidden shrink-0 items-center gap-1 rounded border border-line px-1.5 py-0.5 text-[10.5px] text-ink-4 sm:flex"
        >
          <Command class="h-2.5 w-2.5" />K
        </span>
      </div>
    </div>

    <div class="flex shrink-0 items-center gap-1">
      <button
        type="button"
        class="cursor-pointer rounded-lg p-2 text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
        :aria-label="isDark ? '切换到浅色' : '切换到深色'"
        @click="toggle"
      >
        <component :is="isDark ? Sun : Moon" class="h-4.5 w-4.5" />
      </button>

      <div class="relative">
        <button
          type="button"
          class="flex cursor-pointer items-center gap-2 rounded-[10px] py-1 pl-1 pr-2 transition-colors hover:bg-surface-2"
          :aria-label="'账号菜单：' + accountEmail"
          @click="menuOpen = !menuOpen"
        >
          <span
            class="flex h-7 w-7 items-center justify-center rounded-full text-[12px] font-semibold text-white"
            :class="color"
          >
            {{ initial }}
          </span>
          <span class="hidden max-w-[140px] truncate text-[13px] text-ink-2 md:block">{{ accountEmail }}</span>
          <ChevronDown class="hidden h-3.5 w-3.5 text-ink-4 md:block" />
        </button>

        <transition
          enter-active-class="transition duration-150 ease-[cubic-bezier(0.2,0.8,0.2,1)]"
          enter-from-class="opacity-0 -translate-y-1"
          leave-active-class="transition duration-100"
          leave-to-class="opacity-0"
        >
          <div
            v-if="menuOpen"
            class="absolute right-0 top-[calc(100%+8px)] w-[228px] overflow-hidden rounded-xl border border-line bg-surface p-1.5 shadow-pop"
          >
            <div class="border-b border-line px-2.5 py-2">
              <p class="truncate text-[13px] font-medium text-ink">{{ accountEmail }}</p>
              <p class="mt-0.5 text-[11.5px] text-ink-3">
                {{ auth.admin ? '管理员账号' : '普通账号' }}
              </p>
            </div>

            <RouterLink
              to="/settings"
              class="mt-1 flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
              @click="menuOpen = false"
            >
              <Settings class="h-4 w-4" /> 设置
            </RouterLink>

            <RouterLink
              v-if="auth.admin"
              to="/admin/domains"
              class="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
              @click="menuOpen = false"
            >
              <ShieldCheck class="h-4 w-4" /> 管理后台
            </RouterLink>

            <div class="my-1 h-px bg-line" />

            <button
              type="button"
              class="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] text-ink-2 transition-colors hover:bg-danger/8 hover:text-danger"
              @click="menuOpen = false; logout()"
            >
              <LogOut class="h-4 w-4" /> 退出登录
            </button>
          </div>
        </transition>

        <div v-if="menuOpen" class="fixed inset-0 z-[-1]" @click="menuOpen = false" />
      </div>
    </div>
  </header>
</template>
