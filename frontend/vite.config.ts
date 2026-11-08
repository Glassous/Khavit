import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // 开发期后端：本地 docker-compose.local.yml 把 443 映射到 8443
  const target = env.VITE_PROXY_TARGET || 'https://127.0.0.1:8443'

  return {
    plugins: [vue(), tailwindcss()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      host: '0.0.0.0',
      port: 5173,
      allowedHosts: true,
      proxy: {
        // 浏览器只认同源 /jmap/，开发期由 Vite 转发到后端，避免 CORS 与自签证书问题
        '/jmap': {
          target,
          changeOrigin: false,
          secure: false,
          ws: true,
        },
        '/.well-known/jmap': {
          target,
          changeOrigin: false,
          secure: false,
        },
      },
    },
    build: {
      target: 'es2020',
      sourcemap: false,
      chunkSizeWarningLimit: 600,
      rollupOptions: {
        output: {
          manualChunks: {
            // 设置与管理后台是岛内面板，按需加载，不拖慢首屏
            admin: [
              './src/components/panel/SettingsPanel.vue',
              './src/components/panel/AdminPanel.vue',
              './src/jmap/admin.ts',
              './src/stores/admin.ts',
            ],
            vendor: ['vue', 'vue-router', 'pinia'],
          },
        },
      },
    },
    test: {
      environment: 'jsdom',
      include: ['src/tests/**/*.spec.ts'],
    },
  }
})
