import { ref } from 'vue-demi';

const zIndex = ref(1000);
export default () => {
  return { getZIndex: () => zIndex.value, nextIndex: () => ++zIndex.value };
};
