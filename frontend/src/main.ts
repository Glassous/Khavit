import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import './style.css'
import { applyStoredTheme } from './composables/useTheme'
import { vTooltip } from './composables/useTooltip'

// 在挂载前同步主题，避免深色用户看到白色闪屏
applyStoredTheme()

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.directive('tooltip', vTooltip)

app.config.errorHandler = (err, _instance, info) => {
  console.error('[app error]', info, err)
}

app.mount('#app')
