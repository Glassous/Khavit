import { ref } from 'vue'
import { readDensity, writeDensity } from '../utils/storage'

/**
 * 列表密度：模块级单例，设置页切换后邮件列表立刻跟着变，不需要刷新页面。
 * 之前只在设置页读写 localStorage，邮件列表既没订阅也没接收 compact，
 * 所以开关看起来“没生效”。
 */
const compact = ref(readDensity() === 'compact')

export function useDensity() {
  function setCompact(value: boolean): void {
    compact.value = value
    writeDensity(value ? 'compact' : 'comfortable')
  }

  function toggle(): void {
    setCompact(!compact.value)
  }

  return { compact, setCompact, toggle }
}
