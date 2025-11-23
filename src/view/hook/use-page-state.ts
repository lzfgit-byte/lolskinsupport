import { onMounted, ref } from 'vue';
import type { MessageInfo, Pagination } from '@ghs/types';
import { hashString, isFalsity, waitTime } from '@ilzf/utils';
import { message } from 'ant-design-vue';
import {
  f_appSetDbDir,
  f_cacheDirDb,
  f_cacheDirSize,
  f_cacheSuffixClean,
  f_getCurrentWebConfig,
  f_getPage,
  f_loadPage,
  f_search,
} from '@/utils/business';
import { nprogress } from '@/utils/nprogress';
import useGlobalState from '@/hooks/use-global-state';
import bus from '@/utils/bus';

export default () => {
  const {
    cacheSize,
    dbPath,
    webConfig,
    loading,
    pagination,
    items,
    tags,
    urlReplace,
    currentUrl,
    webKey,
    init,
    loadSysConfig,
  } = useGlobalState();
  const bodyRef = ref<HTMLDivElement>();
  const calcCacheSize = async () => {
    cacheSize.value = await f_cacheDirSize();
  };

  const load = async (url: string = null) => {
    loading.value = true;
    nprogress.start();
    if (url) {
      bus.on(hashString(url), (args: MessageInfo) => {
        nprogress.set(args.percentage);
      });
    }
    if (!webKey.value) {
      message.error('key为空');
      return;
    }
    const page = isFalsity(url) ? await f_getPage(webKey.value) : await f_loadPage(url);
    currentUrl.value = url || webConfig.value.homeUrl;
    if (page?.items?.length === 0) {
      loading.value = false;
      message.info('未获取到数据');
      return;
    }
    pagination.value = [];
    items.value = [];
    tags.value = [];
    urlReplace.value = [];

    pagination.value = page.pagination;
    items.value = page.items;
    tags.value = page.tags;
    urlReplace.value = page.urlReplace;

    loading.value = false;
    bodyRef.value.scrollTo({ top: 0, behavior: 'smooth' });
    nprogress.done(true);
    if (url) {
      bus.off(hashString(url));
    }
    await calcCacheSize();
  };

  const handlePageClick = async (item: Pagination) => {
    await load(item.url);
  };

  const handleSearch = async (value: string) => {
    if (items.value.length > 0) {
      await load(await f_search(value, items.value[0]));
    } else {
      await load(await f_search(value, null));
    }
  };

  const loadDbPath = async () => {
    dbPath.value = await f_cacheDirDb();
  };
  const refresh = async () => {
    await load(currentUrl.value);
  };
  const clearCache = async (suffix: string = null) => {
    await f_cacheSuffixClean(suffix);
    await refresh();
  };

  const setDbPath = async () => {
    const fileInput: HTMLInputElement = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.db';
    fileInput.addEventListener('change', function () {
      let selectedFile = fileInput.files[0];
      const path = selectedFile.path;
      f_appSetDbDir(path);
    });
    fileInput.click();
  };

  onMounted(async () => {
    await init();
    await load();
    await loadDbPath();
    await loadSysConfig();
  });
  return {
    pagination,
    handlePageClick,
    items,
    tags,
    urlReplace,
    webConfig,
    handleSearch,
    clearCache,
    cacheSize,
    setDbPath,
    loading,
    calcCacheSize,
    load,
    init,
    bodyRef,
  };
};
