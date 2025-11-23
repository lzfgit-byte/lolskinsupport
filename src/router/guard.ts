import router from '@/router/router';
import { nprogress } from '@/utils/nprogress';

router.beforeEach((to, form, next) => {
  nprogress.start();
  next();
});
router.afterEach(() => {
  nprogress.done();
});
