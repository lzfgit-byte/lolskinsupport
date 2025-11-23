import NProgress from 'nprogress';
import 'nprogress/nprogress.css'; // progress bar style
NProgress.configure({ showSpinner: false }); // 禁⽤进度环 若为true右侧会出现一个进度环
export const nprogress: typeof NProgress = NProgress;
