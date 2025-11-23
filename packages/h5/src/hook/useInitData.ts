import { onMounted, ref } from 'vue';
import useGlobalState from '@/hook/useGlobalState';
import { listAllWebConfigs } from '@/api';
export default () => {
  const { webConfigs, webKey } = useGlobalState();

  onMounted(async () => {
    webConfigs.value = await listAllWebConfigs();
    if (webConfigs.value.length > 0) {
      webKey.value = webConfigs.value[0].key;
    }
  });
};
