<template>
  <LolskinMain></LolskinMain>
  <FloatButtonGroup :handle-draw-open="handleDrawOpen"></FloatButtonGroup>
  <a-drawer
    v-model:open="drawerOpen"
    placement="right"
    width="70vw"
    :header-style="{ display: 'none' }"
  >
    <div h-85vh overflow-auto w-full m-t-4 p-t-2>
      <transition-group
        enter-active-class="animate__animated animate__fadeIn"
        leave-active-class="animate__animated animate__fadeOut"
        :duration="200"
      >
        <h1>设置信息</h1>

        皮肤存储路径：
        {{ skinPath }}
        <a-space>
          <a-button size="small" @click="f_openPath(skinPath)">打开文件路径</a-button>
          <!--          <a-button size="small" @click="f_removePath(skinPath)">删除文件路径</a-button> -->
          <a-button size="small" @click="setConfigPath(SKIN_PATH, skinPath)">设置文件地址</a-button>
        </a-space>

        <br /><br />
        皮肤最后更新时间：{{ updateData }}
        <a-button size="small" @click="f_openUrl('https://github.com/Alban1911/RoseSkins')">
          打开连接地址
        </a-button>
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
          <a-button
            size="small"
            @click="f_openUrl('https://github.com/LeagueToolkit/cslol-manager')"
          >
            打开url地址
          </a-button>
        </a-space>
        <br /><br />
        lcuState：{{ lcuState }}<br /><br />
        <a-space>
          <a-button size="small" danger @click="deleteSkinCache">清理皮肤缓存</a-button>
          <a-button size="small" @click="testSlideWin">测试侧边弹窗</a-button>
          <a-button size="small" @click="testNotify">测试通知</a-button>
          <a-button size="small" @click="f_loadSkins()">加载所有皮肤</a-button>
        </a-space>
        <br />
        <img
          v-for="item in skinImages"
          :key="item"
          width="200px"
          style="margin: 10px"
          :src="item"
        />
        <br /><br />
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
  import FloatButtonGroup from '@/view/components/float-button-group.vue';
  import useFeature from '@/view/hook/use-feature';
  import LolskinMain from '@/view/lolskin/lolskin-main.vue';
  import useGlobalState from '@/hooks/use-global-state';
  import {
    f_checkCanAutoConfirm,
    f_clearSkinImage,
    f_getAllLoadSkins,
    f_getSkinImage,
    f_loadSkins,
    f_openPath,
    f_openUrl,
    f_removePath,
    f_requestHtmlByWindows,
    f_request_string_get,
    f_selectPathOrFile,
    f_setConfig,
    f_winGetData,
  } from '@/utils/business';

  const route = useRoute();
  const updateData = ref('');
  const {
    skinPath,
    gamePath,
    toolsPath,
    overlayPath,
    overlayConfigPath,
    installedPath,
    lcuState,
    loadSkinIds,
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
  const getSkinUpdate = () => {
    f_winGetData(
      ` (() =>
        new Promise((resolve) => {
          resolve(document.getElementsByTagName('pre')[0].innerHTML);
        }))();`,
      'https://github.com/Alban1911/LeagueSkins',
      false
    ).then((res: any) => {
      updateData.value = JSON.parse(res)?.pushed_at;
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
  const deleteSkinCache = () => {
    f_removePath(installedPath.value);
    f_removePath(overlayPath.value);
    f_clearSkinImage();
    getAllChoseSkin();
  };
  const skinImages = ref([]);
  const getAllChoseSkin = async () => {
    skinImages.value = [];
    loadSkinIds.value = [];
    loadSkinIds.value = await f_getAllLoadSkins();
    loadSkinIds.value.forEach((item) => {
      f_getSkinImage(item).then((res) => {
        skinImages.value.push(res);
      });
    });
  };
  watchEffect(() => {
    if (drawerOpen.value) {
      getAllChoseSkin();
    }
  });
  onMounted(() => {
    getSkinUpdate();
  });
</script>

<style scoped lang="less"></style>
