import type { Ref } from 'vue';
import { onMounted } from 'vue';
import type { CollectEntity } from '@ghs/constant';
import useGlobalState from '@/hook/useGlobalState';
import { listCollect } from '@/api';

export default () => {
  const { collects, webKey } = useGlobalState();
  const updateCollects = async () => {
    collects.value = await listCollect(webKey.value);
  };
  const getCollect = (): Ref<CollectEntity[]> => collects;
  onMounted(() => {
    updateCollects().then(() => 1);
  });
  return { updateCollects, getCollect, collects };
};
