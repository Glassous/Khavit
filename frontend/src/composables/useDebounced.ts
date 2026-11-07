import { onBeforeUnmount, ref, watch, type Ref } from 'vue'

/** 防抖值：输入搜索时避免每个字符打一次请求 */
export function useDebounced<T>(source: Ref<T>, delay = 350): Ref<T> {
  const value = ref(source.value) as Ref<T>
  let timer: ReturnType<typeof setTimeout> | null = null

  watch(source, (next) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      value.value = next
    }, delay)
  })

  onBeforeUnmount(() => {
    if (timer) clearTimeout(timer)
  })

  return value
}

/** 防抖执行函数，用于自动保存草稿 */
export function debounce<A extends unknown[]>(fn: (...args: A) => void, delay = 800) {
  let timer: ReturnType<typeof setTimeout> | null = null

  const wrapped = (...args: A) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => fn(...args), delay)
  }

  wrapped.cancel = () => {
    if (timer) clearTimeout(timer)
    timer = null
  }

  wrapped.flush = () => {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
  }

  return wrapped
}
