import { onMounted, ref } from 'vue';
import type { Pagination } from '@ghs/types';
import { isFalsity } from '@ilzf/utils';
import { message } from 'ant-design-vue';
import { nprogress } from '@/utils/nprogress';
import useGlobalState from '@/hook/useGlobalState';
import { cacheSuffixClean, getPage, loadPage, search } from '@/api';

export default () => {
  const { webConfig, loading, pagination, items, tags, urlReplace, currentUrl, webKey, init } =
    useGlobalState();
  const bodyRef = ref<HTMLDivElement>();

  const load = async (url: string = null) => {
    loading.value = true;
    if (!webKey.value) {
      message.error('key为空');
      return;
    }
    const page = isFalsity(url) ? await getPage(webKey.value) : await loadPage(url);
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
  };

  const handlePageClick = async (item: Pagination) => {
    await load(item.url);
  };

  const handleSearch = async (value: string) => {
    if (items.value.length > 0) {
      await load(await search(value, items.value[0]));
    } else {
      await load(await search(value, null));
    }
  };

  const refresh = async () => {
    await load(currentUrl.value);
  };
  const clearCache = async (suffix: string = null) => {
    await cacheSuffixClean(suffix);
    await refresh();
  };

  onMounted(async () => {
    await init();
    await load();
  });
  return {
    pagination,
    handlePageClick,
    items,
    tags,
    urlReplace,
    webConfig,
    handleSearch,
    loading,
    load,
    init,
    bodyRef,
    clearCache,
  };
};
