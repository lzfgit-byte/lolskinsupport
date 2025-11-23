import { onMounted } from 'vue';
import useGlobalState from '@/hooks/use-global-state';
import { f_getSkinPath } from '@/utils/business';

export default () => {
  const { drawerOpen, skinPath } = useGlobalState();

  const handleDrawOpen = () => {
    drawerOpen.value = true;
  };
  onMounted(async () => {
    skinPath.value = await f_getSkinPath();
  });
  return {
    drawerOpen,
    handleDrawOpen,
  };
};
