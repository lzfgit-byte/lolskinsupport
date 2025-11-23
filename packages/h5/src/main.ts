import { createApp } from 'vue';
import {
  Button,
  ConfigProvider,
  Dialog,
  Empty,
  FloatingBubble,
  Icon,
  Loading,
  Notify,
  Popup,
  Search,
  Tab,
  Tabbar,
  TabbarItem,
  Tabs,
} from 'vant';
import App from '@/App.vue';
import 'animate.css';
import 'vant/lib/index.css';
import 'virtual:uno.css';
import { registerRouter } from '@/router/router';
const app = createApp(App);

app
  .use(Button)
  .use(ConfigProvider)
  .use(FloatingBubble)
  .use(Tabbar)
  .use(TabbarItem)
  .use(Icon)
  .use(Notify)
  .use(Dialog)
  .use(Popup)
  .use(Search)
  .use(Tab)
  .use(Tabs)
  .use(Empty)
  .use(Loading);

registerRouter(app);
app.mount('#app');
