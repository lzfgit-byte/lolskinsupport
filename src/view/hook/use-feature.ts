import { onMounted } from 'vue';
import useGlobalState from '@/hooks/use-global-state';
import {
  f_getGamePath,
  f_getInstalledPath,
  f_getModToolsPath,
  f_getOverlayConfigPath,
  f_getOverlayPath,
  f_getSkinDefaultSuffix,
  f_getSkinPath,
  f_getScreenshotPath,
} from '@/utils/business';

export default () => {
  const {
    drawerOpen,
    skinPath,
    skinDefaultSuffix,
    screenshotPath,
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
    skinDefaultSuffix.value = await f_getSkinDefaultSuffix();
    screenshotPath.value = await f_getScreenshotPath();
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
