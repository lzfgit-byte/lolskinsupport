import {createRouter, createWebHashHistory} from 'vue-router';
import type {App} from 'vue';
import type {BaseConfig} from '@ghs/types';
import {ref} from 'vue';
import {f_listAllWebConfigs} from '@/utils/business';
import useGlobalState from '@/hooks/use-global-state';

const {allWebKeys} = useGlobalState();

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
    component: () => import('@/components/comic/comic-reader.vue'),
  },
  {
    path: '/',
    name: 'hHome',
    aliasZH: 'hHome',
    showInMenu: true,
    component: () => import('@/view/start-app-view.vue'),
  },
];

const router = createRouter({
  history: createWebHashHistory(),
  routes: staticRoutes.map(({path, name, component}) => ({path, name, component})),
});

export default router;
const initRoute = async () => {
};
export const registerRouter = (app: App) => {
  app.use(router);
};
