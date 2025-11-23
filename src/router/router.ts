import { createRouter, createWebHashHistory } from 'vue-router';
import type { App } from 'vue';
import { ref } from 'vue';

export interface RouterType {
  path?: string;
  key?: string;
  icon?: string;
  aliasZH?: string;
  force?: boolean;

  [T: string]: any;
}

export const routes = ref<RouterType[]>([]);
export const staticRoutes: RouterType[] = [
  {
    path: '/',
    name: 'hHome',
    aliasZH: 'hHome',
    showInMenu: true,
    component: () => import('@/view/main-page.vue'),
  },
];

const router = createRouter({
  history: createWebHashHistory(),
  routes: staticRoutes.map(({ path, name, component }) => ({ path, name, component })),
});

export default router;
const initRoute = async () => {};
export const registerRouter = (app: App) => {
  app.use(router);
};
