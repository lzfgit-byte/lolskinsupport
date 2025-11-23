<template>
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
        皮肤存储路径：{{ skinPath }}<br />
        游戏路径：{{ gamePath }}<br />
        installedPath路径：{{ installedPath }}<br />
        overlay路径：{{ overlayPath }}<br />
        overlayConfig路径：{{ overlayConfigPath }}<br />
        toolsPath路径：{{ toolsPath }}<br />
      </transition-group>
    </div>
  </a-drawer>
</template>
<script setup lang="ts">
  import { useRoute } from 'vue-router';
  import FloatButtonGroup from '@/view/components/float-button-group.vue';
  import useFeature from '@/view/hook/use-feature';
  import LolskinMain from '@/view/lolskin/lolskin-main.vue';
  import useGlobalState from '@/hooks/use-global-state';

  const route = useRoute();
  const { skinPath, gamePath, toolsPath, overlayPath, overlayConfigPath, installedPath } =
    useGlobalState();
  const { handleDrawOpen, drawerOpen } = useFeature();
</script>

<style scoped lang="less"></style>
