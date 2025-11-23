import { ref } from 'vue';
import useGlobalState from '@/hook/useGlobalState';

export default () => {
  const { webKey } = useGlobalState();

  const items = ref();

  return {
    items,
  };
};
