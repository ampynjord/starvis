import { createApp } from 'vue'
import App from './App.vue'
import './assets/main.css'
import router from './router'

const app = createApp(App)

// Global error handler — log uncaught errors from components
app.config.errorHandler = (err, _instance, info) => {
  console.error(`[Vue Error] ${info}:`, err)
}

app.use(router)
app.mount('#app')
