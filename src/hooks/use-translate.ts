import { useTextSelection } from '@vueuse/core';
import { onMounted, watch } from 'vue';

export default () => {
  const state = useTextSelection();
  return { state };
};
