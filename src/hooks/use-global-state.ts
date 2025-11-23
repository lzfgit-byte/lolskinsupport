import { ref, watch } from 'vue-demi';
import type { BaseConfig, Item, Pagination, SetTag, Tag, UrlReplace } from '@ghs/types';
import type { CollectEntity, ConfigEntity } from '@ghs/constant';
import { computed } from 'vue';
import { message } from 'ant-design-vue';

import { f_getCurrentWebConfig, f_listSystemConfig } from '@/utils/business';

const allWebKeys = ref([]);

const webKey = ref();

const webConfig = ref<BaseConfig>();
const pagination = ref<Pagination[]>();
const items = ref<Item[]>();
const tags = ref<Tag[]>();
const urlReplace = ref<UrlReplace[]>();
const dbPath = ref();
const currentUrl = ref();
const cacheSize = ref();
const loading = ref(false);
const logs = ref([]);
const showCloseIcon = ref(false);

const drawerOpen = ref(false);
const segmentedValue = ref<SetTag>();
const segmentedData = computed(() => webConfig?.value?.setTags);
watch(segmentedData, () => {
  if (segmentedData.value?.length > 0) {
    segmentedValue.value = segmentedData.value[0];
  }
});

const collects = ref<CollectEntity[]>();

const currentCode = ref();

let timer = null;
watch(loading, () => {
  if (loading.value) {
    timer = setTimeout(() => {
      showCloseIcon.value = true;
    }, 10000);
  } else {
    timer && clearTimeout(timer);
    timer = null;
    showCloseIcon.value = false;
  }
});

const init = async () => {
  webConfig.value = await f_getCurrentWebConfig(webKey.value);
};
// 系统设置
const systemConfigs = ref<ConfigEntity[]>([]);
const loadSysConfig = async () => {
  systemConfigs.value = await f_listSystemConfig();
};
export default () => ({
  webConfig,
  pagination,
  items,
  tags,
  urlReplace,
  dbPath,
  currentUrl,
  cacheSize,
  loading,
  drawerOpen,
  segmentedValue,
  segmentedData,
  collects,
  webKey,
  logs,
  currentCode,
  allWebKeys,
  init,
  systemConfigs,
  loadSysConfig,
  showCloseIcon,
});
