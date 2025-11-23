import { onMounted } from 'vue';
import useGlobalState from '@/hooks/use-global-state';
import {
  f_getGamePath,
  f_getModToolsPath,
  f_getOverlayConfigPath,
  f_getOverlayPath,
  f_getSkinPath,
} from '@/utils/business';

export default () => {
  const { drawerOpen, skinPath, gamePath, overlayPath, overlayConfigPath, toolsPath } =
    useGlobalState();

  const handleDrawOpen = () => {
    drawerOpen.value = true;
  };
  onMounted(async () => {
    skinPath.value = await f_getSkinPath();
    gamePath.value = await f_getGamePath();
    overlayPath.value = await f_getOverlayPath();
    overlayConfigPath.value = await f_getOverlayConfigPath();
    toolsPath.value = await f_getModToolsPath();
  });
  return {
    drawerOpen,
    handleDrawOpen,
  };
};
