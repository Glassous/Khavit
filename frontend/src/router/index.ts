import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('../views/LoginView.vue'),
      meta: { public: true, title: '登录' },
    },
    {
      path: '/',
      redirect: '/mail',
    },
    {
      path: '/mail/:mailbox?',
      name: 'mail',
      component: () => import('../views/MailView.vue'),
      meta: { title: '邮件' },
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('../views/SettingsView.vue'),
      meta: { title: '设置' },
    },
    {
      path: '/admin/:section?',
      name: 'admin',
      component: () => import('../views/AdminView.vue'),
      meta: { title: '管理', requiresAdmin: true },
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

  if (to.meta.requiresAdmin && !auth.admin) {
    return { name: 'mail' }
  }

  return true
})

router.afterEach((to) => {
  const title = (to.meta.title as string) || '邮局'
  document.title = title === '邮局' ? '邮局' : `${title} · 邮局`
})

export default router
