import { createRouter, createWebHashHistory, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { resolveRouteTitle } from '../utils/routeMeta'
import { PANEL_TITLES, legacyPanelLocation, resolvePanel } from '../utils/panel'

/**
 * 路由模式由 VITE_ROUTER_MODE 决定，默认 hash：
 *
 * - hash（默认）：地址形如 https://mail.example.com/#/mail/inbox
 *   路径全在 # 之后，服务端只会收到 `/`，任何静态托管（1Panel、Nginx、对象存储、
 *   vite preview…）刷新都能正常加载，不会出现 404。
 * - history：地址形如 https://mail.example.com/mail/inbox，URL 更干净，
 *   但服务端必须把未命中的路径回退到 index.html（Nginx: try_files $uri $uri/ /index.html），
 *   否则直接访问或刷新带路径的地址会 404。需要时用 VITE_ROUTER_MODE=history 打开。
 */
const USE_HISTORY =
  (import.meta.env.VITE_ROUTER_MODE as string | undefined)?.trim().toLowerCase() === 'history'

/**
 * 之前用 history 模式时留下的深链接（/mail/inbox、/admin/accounts）在 hash 模式下
 * 会被浏览器当成服务端路径。这里就地改写成 #/mail/inbox，老书签无需重新收藏。
 */
function migrateLegacyPath(): void {
  const { pathname, search, hash } = window.location
  if (hash) return

  const base = import.meta.env.BASE_URL || '/'
  const tail = pathname.startsWith(base) ? pathname.slice(base.length) : pathname.replace(/^\/+/, '')
  const path = tail.replace(/^index\.html/, '').replace(/^\/+|\/+$/g, '')
  if (!path) return

  try {
    window.history.replaceState(null, '', `${base}#/${path}${search}`)
  } catch {
    // file:// 或沙箱环境不允许改地址栏，忽略即可
  }
}

if (!USE_HISTORY) migrateLegacyPath()

const router = createRouter({
  history: USE_HISTORY ? createWebHistory(import.meta.env.BASE_URL) : createWebHashHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('../views/LoginView.vue'),
      // 不设 title：登录页的标签页就叫 Khavit邮局
      meta: { public: true },
    },
    /**
     * 登录后的所有页面共享同一个布局组件：顶栏、侧栏只挂载一次，
     * 页面切换时只有内容区的 RouterView 变化，顶栏不会重建、不会闪。
     * meta 说明：
     * - sidebar：需要邮箱侧栏（仅邮件页）
     * - searchable：顶栏显示搜索框（仅邮件页）
     *
     * 注意：设置与管理后台不是路由页面，而是邮件页「岛内」的一层面板，
     * 由查询串控制（?panel=settings / ?panel=admin&section=accounts），
     * 见 utils/panel.ts 与 composables/useIslandPanel.ts。
     * 下面两条只是给老地址/老书签留的跳转，浏览器里不会再出现这两个路径。
     */
    {
      path: '/',
      component: () => import('../components/layout/AppLayout.vue'),
      children: [
        { path: '', redirect: '/mail' },
        {
          path: 'mail/:mailbox?',
          name: 'mail',
          component: () => import('../views/MailView.vue'),
          meta: { title: '邮件', sidebar: true, searchable: true },
        },
        {
          path: 'settings',
          redirect: () => legacyPanelLocation('settings'),
        },
        {
          path: 'admin/:section?',
          redirect: (to) => legacyPanelLocation('admin', to.params.section as string | undefined),
        },
      ],
    },
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: () => import('../views/NotFoundView.vue'),
      meta: { public: true, title: '页面不存在' },
    },
  ],
  scrollBehavior: () => ({ top: 0 }),
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()

  if (!auth.isLoggedIn && !to.meta.public) {
    const restored = await auth.bootstrap()
    if (!restored) {
      return { name: 'login', query: to.fullPath !== '/mail' ? { next: to.fullPath } : undefined }
    }
  }

  if (to.name === 'login' && auth.isLoggedIn) {
    return { name: 'mail' }
  }

  // 管理后台面板只对管理员开放：普通账号带着 ?panel=admin 进来就直接退回邮件页
  if (resolvePanel(to.query) === 'admin' && !auth.admin) {
    return { name: 'mail' }
  }

  return true
})

const APP_NAME = 'Khavit邮局'

router.afterEach((to) => {
  // 打开岛内面板时，标签页标题跟着面板走；面板关掉就回到「邮件」
  const panel = resolvePanel(to.query)
  const title = panel ? PANEL_TITLES[panel] : resolveRouteTitle(to)
  document.title = title ? `${title} · ${APP_NAME}` : APP_NAME
})

export default router
