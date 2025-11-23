import type { Ref } from 'vue';
import { ref, watch } from 'vue';
import type { Comment } from '@ghs/types';

export default (visible: Ref<boolean>) => {
  const drawerOpen = ref(false);
  const comments = ref<Comment[]>([]);
  const getDrawerContainer = () => document.getElementById('img-view-id');
  watch(visible, () => {
    if (visible.value === false) {
      drawerOpen.value = false;
    }
  });

  return { drawerOpen, comments, getDrawerContainer };
};
