import { ref, computed, watch } from 'vue'
import { readTheme, writeTheme, type ThemeMode } from '../utils/storage'

const mode = ref<ThemeMode>(readTheme())
const systemPrefersDark = ref(false)
let mediaBound = false

function resolveDark(current: ThemeMode): boolean {
  return current === 'dark' || (current === 'system' && systemPrefersDark.value)
}

function applyClass(dark: boolean): void {
  const root = document.documentElement
  root.classList.toggle('dark', dark)
  root.style.colorScheme = dark ? 'dark' : 'light'
}

function bindMedia(): void {
  if (mediaBound || typeof window === 'undefined') return
  const query = window.matchMedia('(prefers-color-scheme: dark)')
  systemPrefersDark.value = query.matches
  query.addEventListener('change', (event) => {
    systemPrefersDark.value = event.matches
    applyClass(resolveDark(mode.value))
  })
  mediaBound = true
}

/** 挂载前调用，避免深色用户看到白屏闪烁 */
export function applyStoredTheme(): void {
  bindMedia()
  applyClass(resolveDark(mode.value))
}

export function useTheme() {
  bindMedia()

  const isDark = computed(() => resolveDark(mode.value))

  watch(
    mode,
    (next) => {
      writeTheme(next)
      applyClass(resolveDark(next))
    },
    { immediate: true },
  )

  function setMode(next: ThemeMode): void {
    mode.value = next
  }

  function toggle(): void {
    mode.value = isDark.value ? 'light' : 'dark'
  }

  return { mode, isDark, setMode, toggle }
}
