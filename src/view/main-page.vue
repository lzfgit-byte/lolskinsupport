<template xmlns="http://www.w3.org/1999/html">
  <LolskinMain></LolskinMain>
  <FloatButtonGroup :handle-draw-open="handleDrawOpen"></FloatButtonGroup>
  <a-drawer
    v-model:open="drawerOpen"
    placement="right"
    width="60vw"
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
        <a-button size="small" @click="f_openPath(skinPath)">打开文件路径</a-button>
        <a-button size="small" @click="f_removePath(skinPath)">删除文件路径</a-button>
        皮肤最后更新时间：{{ updateData }} <br /><br />
        <br /><br />
        游戏路径：{{ gamePath }}
        <a-button size="small" @click="f_openPath(gamePath)">打开文件路径</a-button>
        <a-button size="small" @click="f_removePath(gamePath)">删除文件路径</a-button>
        <br /><br />
        installedPath路径：{{ installedPath }}
        <a-button size="small" @click="f_openPath(installedPath)">删除文进路径</a-button>
        <a-button size="small" @click="f_removePath(installedPath)">删除文件路径</a-button>
        <br /><br />
        overlay路径：{{ overlayPath }}
        <a-button size="small" @click="f_openPath(overlayPath)">打开文件路径</a-button>
        <a-button size="small" @click="f_removePath(overlayPath)">删除文件路径</a-button>
        <br /><br />
        overlayConfig路径：{{ overlayConfigPath }}
        <a-button size="small" @click="f_openPath(overlayConfigPath)">打开文件路径</a-button>
        <a-button size="small" @click="f_removePath(overlayConfigPath)">删除文件路径</a-button>
        <br /><br />
        toolsPath路径：{{ toolsPath }}
        <a-button size="small" @click="f_openPath(toolsPath)">打开文进路径</a-button>
        <a-button size="small" @click="f_removePath(toolsPath)">删除文件路径</a-button>
        <br /><br />
        lcuState：{{ lcuState }}<br /><br />

        <a-button size="small" @click="testSlideWin">测试侧边弹窗</a-button>
        <br /><br />
        <a-button size="small" @click="testNotify">测试通知</a-button>
        <br /><br />
      </transition-group>
    </div>
  </a-drawer>
</template>
<script setup lang="ts">
  import { useRoute } from 'vue-router';
  import { onMounted, ref } from 'vue';
  import FloatButtonGroup from '@/view/components/float-button-group.vue';
  import useFeature from '@/view/hook/use-feature';
  import LolskinMain from '@/view/lolskin/lolskin-main.vue';
  import useGlobalState from '@/hooks/use-global-state';
  import {
    f_checkCanAutoConfirm,
    f_openPath,
    f_removePath,
    f_requestHtmlByWindows,
    f_request_string_get,
    f_winGetData,
  } from '@/utils/business';
  import http from '@/utils/http';

  const route = useRoute();
  const updateData = ref('');
  const { skinPath, gamePath, toolsPath, overlayPath, overlayConfigPath, installedPath, lcuState } =
    useGlobalState();
  const { handleDrawOpen, drawerOpen } = useFeature();
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
      'https://api.github.com/repos/Alban1911/LeagueSkins',
      false
    ).then((res: any) => {
      updateData.value = JSON.parse(res)?.pushed_at;
    });
  };
  onMounted(() => {
    getSkinUpdate();
  });
</script>

<style scoped lang="less"></style>
