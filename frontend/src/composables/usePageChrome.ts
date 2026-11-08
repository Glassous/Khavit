import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { resolveRouteTitle } from '../utils/routeMeta'

/**
 * 顶栏形态：标题和是否“次级页面”都由路由 meta 决定，页面本身不再写返回键/大标题。
 * - meta.secondary：次级页面 → 顶栏显示返回键 + 标题，隐藏品牌 logo
 * - meta.title：顶栏标题（也用于 document.title）
 */
export function usePageChrome() {
  const route = useRoute()

  const secondary = computed(() => Boolean(route.meta.secondary))
  const title = computed(() => resolveRouteTitle(route))

  return { secondary, title }
}
