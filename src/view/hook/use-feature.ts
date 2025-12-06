import { onMounted } from 'vue';
import useGlobalState from '@/hooks/use-global-state';
import {
  f_getGamePath,
  f_getInstalledPath,
  f_getModToolsPath,
  f_getOverlayConfigPath,
  f_getOverlayPath,
  f_getSkinPath,
} from '@/utils/business';

export default () => {
  const {
    drawerOpen,
    skinPath,
    gamePath,
    overlayPath,
    overlayConfigPath,
    toolsPath,
    installedPath,
  } = useGlobalState();

  const handleDrawOpen = () => {
    drawerOpen.value = true;
  };
  const loadFilePath = async () => {
    skinPath.value = await f_getSkinPath();
    gamePath.value = await f_getGamePath();
    overlayPath.value = await f_getOverlayPath();
    overlayConfigPath.value = await f_getOverlayConfigPath();
    toolsPath.value = await f_getModToolsPath();
    installedPath.value = await f_getInstalledPath();
  };
  onMounted(async () => {
    await loadFilePath();
  });
  return {
    drawerOpen,
    handleDrawOpen,
    loadFilePath,
  };
};
