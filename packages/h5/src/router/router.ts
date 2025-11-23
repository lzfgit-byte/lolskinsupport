import { createRouter, createWebHashHistory } from 'vue-router';
import type { App } from 'vue';
import type { BaseConfig } from '@ghs/types';
import { ref } from 'vue';
import { listAllWebConfigs } from '@/api';
import useGlobalState from '@/hook/useGlobalState';
const { allWebKeys } = useGlobalState();
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
    path: '/comic-reader',
    name: 'comic-reader',
    aliasZH: '18C',
    showInMenu: true,
    component: () => import('@/views/item-pages.vue'),
  },
  {
    path: '/',
    name: 'hHome',
    aliasZH: 'hHome',
    showInMenu: true,
    component: () => import('@/views/item-pages.vue'),
  },
];

const router = createRouter({
  history: createWebHashHistory(),
  routes: staticRoutes.map(({ path, name, component }) => ({ path, name, component })),
});

export default router;
const initRoute = async () => {
  const webConfigs: BaseConfig[] = await listAllWebConfigs();
  allWebKeys.value = webConfigs.map((item) => item.key);
  webConfigs.forEach((item) => {
    router.addRoute({
      path: `/${item.key}`,
      name: item.name,
      component: () => import('@/views/item-pages.vue'),
    });
    routes.value.push({
      path: `/${item.key}`,
      key: item.key,
      name: item.name,
      aliasZH: item.name,
      icon: item.favicon,
    });
  });
};
export const registerRouter = (app: App) => {
  app.use(router);
  initRoute().then();
};
