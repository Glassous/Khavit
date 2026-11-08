import { ref } from 'vue'

/**
 * 响应式顶栏的「下滑收起 / 上滑原地恢复」。
 *
 * 模块级单例：列表滚动时调用 `handleScroll(scrollTop)`，顶栏读 `hidden` 决定位移。
 * - 只在方向明确（超过阈值）时才切换，避免手指抖动导致顶栏反复闪烁；
 * - 回到顶部一定显示；
 * - 抽屉打开、进入多选态等需要操作顶栏的场景，用 `show()` 强制拉回。
 */
/** 同方向累计滚动超过这个距离才切换，既不会一抖就闪，慢速小幅滑动也能触发 */
const HIDE_THRESHOLD = 4
const TOP_ZONE = 8

const hidden = ref(false)
let lastY = 0
/** 同方向的累计位移：滚动事件是碎片的，单次 1~2px 也要能攒够阈值 */
let accumulated = 0
let locked = false

export function useTopBarAutoHide() {
  function show(): void {
    hidden.value = false
    locked = false
    accumulated = 0
  }

  /** 需要顶栏保持在位时（例如抽屉打开）先锁住，滚动事件不再收起 */
  function lock(): void {
    hidden.value = false
    locked = true
    accumulated = 0
  }

  function handleScroll(top: number): void {
    const y = Math.max(0, top)
    const delta = y - lastY
    lastY = y

    if (locked || delta === 0) {
      if (locked) accumulated = 0
      return
    }

    // 方向翻转就重新累计，避免来回抖动凑满阈值
    if (accumulated !== 0 && delta > 0 !== accumulated > 0) accumulated = 0
    accumulated += delta

    if (accumulated > HIDE_THRESHOLD) {
      hidden.value = true
      accumulated = 0
    } else if (accumulated < -HIDE_THRESHOLD) {
      hidden.value = false
      accumulated = 0
    }

    // 贴着顶部时一定展开
    if (y <= TOP_ZONE) hidden.value = false
  }

  /** 切文件夹/换页面后滚动位置会重置，同步一下基准值 */
  function reset(top = 0): void {
    lastY = Math.max(0, top)
    hidden.value = false
    locked = false
    accumulated = 0
  }

  return { hidden, show, lock, handleScroll, reset }
}
