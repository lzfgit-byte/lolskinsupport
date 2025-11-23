import type { BaseConfig, Item, Pagination, SetTag, Tag, UrlReplace } from '@ghs/types';
import type { CollectEntity, ConfigEntity } from '@ghs/constant';
import { computed, ref } from 'vue';
import { getCurrentWebConfig } from '@/api';

const allWebKeys = ref([]);

const webKey = ref('hentaiWord');

const webConfig = ref<BaseConfig>();
const webConfigs = ref<BaseConfig[]>();
const pagination = ref<Pagination[]>();
const items = ref<Item[]>();
const tags = ref<Tag[]>();
const urlReplace = ref<UrlReplace[]>();
const currentUrl = ref();
const loading = ref(false);

const collects = ref<CollectEntity[]>();

const currentCode = ref();

const init = async () => {
  webConfig.value = await getCurrentWebConfig(webKey.value);
};
const drawerOpen = ref(false);
const segmentedValue = ref<SetTag>();
const segmentedData = computed(() => webConfig?.value?.setTags);
const active = ref('home');
// 系统设置
export default () => ({
  webConfig,
  pagination,
  items,
  tags,
  urlReplace,
  currentUrl,
  loading,
  collects,
  webKey,
  currentCode,
  allWebKeys,
  init,
  drawerOpen,
  segmentedValue,
  segmentedData,
  webConfigs,
  active,
});
