import type { RouteMeta, RouteParamsGeneric } from 'vue-router'

/**
 * 路由 meta.title 允许两种写法：
 * - 字符串：标题固定（邮件…）
 * - 函数：标题跟路由参数走
 * document.title 由这里解析；岛内面板（设置、管理后台）的标题见 utils/panel.ts。
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
