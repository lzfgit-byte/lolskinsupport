import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from '@/App.vue';
import 'animate.css';
import { registerRouter } from '@/router/router';
import '@/router/guard';
import 'virtual:uno.css';
import 'ant-design-vue/dist/reset.css';

const pinia = createPinia();

const app = createApp(App);
app.use(pinia);
registerRouter(app);
app.mount('#app');
