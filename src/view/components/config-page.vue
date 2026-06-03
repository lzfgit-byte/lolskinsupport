<template>
  <a-drawer
    v-model:open="drawerOpen"
    placement="right"
    width="70vw"
    :z-index="59999"
    :header-style="{ display: 'none' }"
  >
    <div h-85vh overflow-auto w-full m-t-4 p-t-2>
      <h1>设置信息</h1>

      皮肤存储路径：
      {{ skinPath }}
      <a-space>
        <a-button size="small" @click="f_openPath(skinPath)">打开文件路径</a-button>
        <!--          <a-button size="small" @click="f_removePath(skinPath)">删除文件路径</a-button> -->
        <a-button size="small" @click="setConfigPath(SKIN_PATH, skinPath)">设置文件地址</a-button>
      </a-space>
      <br /><br />
      游戏路径：{{ gamePath }}
      <a-space>
        <a-button size="small" @click="f_openPath(gamePath)">打开文件路径</a-button>
        <a-button size="small" @click="setConfigPath(GAME_PATH, gamePath)">设置文件地址</a-button>
      </a-space>
      <br /><br />
      installedPath路径：{{ installedPath }}
      <a-space>
        <a-button size="small" @click="f_openPath(installedPath)">打开文件路径</a-button>
        <a-button size="small" danger @click="f_removePath(installedPath)">删除文件路径</a-button>
        <a-button size="small" @click="setConfigPath(INSTALLED_PATH, installedPath)">
          设置文件地址
        </a-button>
      </a-space>
      <br /><br />
      overlay路径：{{ overlayPath }}
      <a-space>
        <a-button size="small" @click="f_openPath(overlayPath)">打开文件路径</a-button>
        <a-button size="small" danger @click="f_removePath(overlayPath)">删除文件路径</a-button>
        <a-button size="small" @click="setConfigPath(OVERLAY_PATH, overlayPath)">
          设置文件地址
        </a-button>
      </a-space>
      <br /><br />
      overlayConfig路径：{{ overlayConfigPath }}
      <a-space>
        <a-button size="small" @click="f_openPath(overlayConfigPath)">打开文件路径</a-button>
        <!--          <a-button size="small" @click="f_removePath(overlayConfigPath)">删除文件路径</a-button> -->
        <a-button size="small" @click="setConfigPath(OVERLAY_CONFIG_PATH, overlayConfigPath)">
          设置文件地址
        </a-button>
      </a-space>
      <br /><br />
      toolsPath路径：{{ toolsPath }}
      <a-space>
        <a-button size="small" @click="f_openPath(toolsPath)">打开文进路径</a-button>
        <!--          <a-button size="small" @click="f_removePath(toolsPath)">删除文件路径</a-button> -->
        <a-button size="small" @click="setConfigFilePath(MOD_TOOLS_PATH, toolsPath)">
          设置文件地址
        </a-button>
        <a-button size="small" @click="f_openUrl('https://github.com/LeagueToolkit/cslol-manager')">
          打开url地址
        </a-button>
      </a-space>
      <br /><br />
      lcuState：{{ lcuState }}<span m-l-4 m-r-4>isUseCommand:</span>
      <a-switch v-model:checked="isUseCommand" @change="f_setIsUseCommand($event)"></a-switch>
      <br /><br />
      <a-space>
        <span>线程数：</span>
        <a-input-number v-model:value="chuckValue" size="small" :min="1" :max="100" />
        <a-button size="small" danger @click="handleLoadAllSkinData()">创建所有皮肤数据</a-button>
      </a-space>
      <br /><br />
      <a-space>
        <a-button size="small" danger @click="deleteSkinCache">清理皮肤缓存</a-button>
        <a-button size="small" danger @click="f_shoutDownModTools()">
          杀掉modTools[{{ modToolsState }}]
        </a-button>
        <a-button size="small" @click="testSlideWin">测试侧边弹窗</a-button>
        <a-button size="small" @click="testNotify">测试通知</a-button>
        <a-button size="small" @click="f_loadSkins()">加载所有皮肤</a-button>
      </a-space>
      <br />
      <transition-group
        enter-active-class="animate__animated animate__fadeIn"
        leave-active-class="animate__animated animate__fadeOut"
        :duration="200"
      >
        <div
          v-for="item in skinImages"
          :key="item.skinId"
          style="margin: 10px; display: inline-block"
        >
          <a-image width="200px" :src="item.src">
            <template #previewMask>
              <a-button size="small" @click="deleteSkinCache(item.heroId, item.skinId)">
                清理
              </a-button>
            </template>
          </a-image>
        </div>
      </transition-group>
    </div>
  </a-drawer>
</template>
<script setup lang="ts">
  import { useRoute } from 'vue-router';
  import { onMounted, ref } from 'vue';
  import {
    GAME_PATH,
    HERO_SKIN,
    INSTALLED_PATH,
    MOD_TOOLS_PATH,
    OVERLAY_CONFIG_PATH,
    OVERLAY_PATH,
    SKIN_PATH,
  } from '@ghs/constant';
  import { watch, watchEffect } from 'vue-demi';
  import useFeature from '@/view/hook/use-feature';
  import useGlobalState from '@/hooks/use-global-state';
  import {
    f_checkCanAutoConfirm,
    f_clearSkinImage,
    f_confirmChoseSkin,
    f_emptyPah,
    f_getAllLoadSkins,
    f_getGamePath,
    f_getSkinImage,
    f_loadSkinDataByFilePath,
    f_loadSkinDataIdName,
    f_loadSkins,
    f_openPath,
    f_openUrl,
    f_removePath,
    f_requestHtmlByWindows,
    f_request_string_get,
    f_selectPathOrFile,
    f_setConfig,
    f_setIsUseCommand,
    f_shoutDownModTools,
    f_winGetData,
  } from '@/utils/business';
  import { showFrontendConfirm } from '@/utils/kit-utils';
  import bus from '@/utils/bus';

  const route = useRoute();
  const {
    skinPath,
    gamePath,
    toolsPath,
    overlayPath,
    overlayConfigPath,
    installedPath,
    lcuState,
    loadSkinIds,
    logDrawOpen,
    modToolsState,
    isUseCommand,
  } = useGlobalState();
  const { handleDrawOpen, drawerOpen, loadFilePath } = useFeature();
  const testSlideWin = () => {
    f_checkCanAutoConfirm({
      title: '提示',
      msg: '是否确认删除此文件？',
      src: 'https://game.gtimg.cn/images/lol/act/img/skin/big_46358cd4-3f36-4987-9db8-aab046adf43f.jpg',
      showBtn: true,
      height: 250,
      delay: 3000,
    });
  };
  const testNotify = () => {
    f_checkCanAutoConfirm({
      title: '提示',
      msg: '是否确认删除此文件？',
      height: 80,
      delay: 3000,
    });
  };
  const setConfigPath = async (key: string, dpath) => {
    const path = await f_selectPathOrFile('openDirectory', dpath);
    await f_setConfig(key, path);
    await loadFilePath();
  };
  const setConfigFilePath = async (key: string, dpath) => {
    const path = await f_selectPathOrFile('openFile', dpath);
    await f_setConfig(key, path);
    await loadFilePath();
  };
  const deleteSkinCache = async (heroId?: string, skinId?: string) => {
    if (skinId && heroId) {
      await f_removePath(`${installedPath.value}\\${heroId}_${skinId}`);
      await f_removePath(`${overlayPath.value}\\${heroId}_${skinId}`);
    } else {
      await f_emptyPah(`${installedPath.value}`);
      await f_emptyPah(`${overlayPath.value}`);
    }

    await f_clearSkinImage(skinId);
    await getAllChoseSkin();
  };
  const skinImages = ref<{ heroId: string; skinId: string; src: string }[]>([]);
  const getAllChoseSkin = async () => {
    skinImages.value = [];
    loadSkinIds.value = [];
    loadSkinIds.value = await f_getAllLoadSkins();
    loadSkinIds.value.forEach((item) => {
      f_getSkinImage(item[1]).then((res) => {
        skinImages.value.push({ heroId: item[0], skinId: item[1], src: res });
      });
    });
  };
  const chuckValue = ref(20);
  const handleLoadAllSkinData = async () => {
    showFrontendConfirm('生成全部皮肤数据?').then(() => {
      f_loadSkinDataIdName(chuckValue.value);
      logDrawOpen.value = true;
    });
  };
  watchEffect(() => {
    if (drawerOpen.value) {
      getAllChoseSkin();
    }
  });
  onMounted(() => {
    document.addEventListener('keydown', function (event) {
      if (event.ctrlKey && event.key === 'w') {
        drawerOpen.value = !drawerOpen.value;
      }
    });
    bus.on('open-set', () => {
      drawerOpen.value = true;
    });
  });
</script>

<style scoped lang="less"></style>
