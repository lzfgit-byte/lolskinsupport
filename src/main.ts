import { createApp } from 'vue'
import App from './App.vue'
import './samples/node-api'

// window.preLoad() 可以直接调在preload里定义在window上的方法
createApp(App)
  .mount('#app')
