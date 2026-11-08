import type { RouteMeta, RouteParamsGeneric } from 'vue-router'

/**
 * 路由 meta.title 允许两种写法：
 * - 字符串：标题固定（设置、邮件…）
 * - 函数：标题跟路由参数走（管理后台按「域名 / 邮箱账号」分区切换）
 * 顶栏标题与 document.title 共用这里，避免两处判断逻辑跑偏。
 *
 * 参数只声明需要的字段，这样 router.resolve() 出来的路由对象也能直接用。
 */
export interface RouteTitleContext {
  meta: RouteMeta
  params: RouteParamsGeneric
}

export type RouteTitle = string | ((route: RouteTitleContext) => string)

export function resolveRouteTitle(route: RouteTitleContext): string {
  const value = route.meta.title as RouteTitle | undefined
  if (typeof value === 'function') return value(route)
  return value ?? ''
}
