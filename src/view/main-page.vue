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
        皮肤存储路径：{{ skinPath
        }}<a-button size="small" @click="f_openPath(skinPath)">打开文进路径</a-button><br /><br />
        游戏路径：{{ gamePath
        }}<a-button size="small" @click="f_openPath(gamePath)">打开文进路径</a-button><br /><br />
        installedPath路径：{{ installedPath
        }}<a-button size="small" @click="f_openPath(installedPath)">打开文进路径</a-button
        ><br /><br />
        overlay路径：{{ overlayPath
        }}<a-button size="small" @click="f_openPath(overlayPath)">打开文进路径</a-button
        ><br /><br />
        overlayConfig路径：{{ overlayConfigPath
        }}<a-button size="small" @click="f_openPath(overlayConfigPath)">打开文进路径</a-button
        ><br /><br />
        toolsPath路径：{{ toolsPath }}<a-button size="small">打开文进路径</a-button><br /><br />
        lcuState：{{ lcuState }}<br /><br />
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
  import { f_openPath } from '@/utils/business';

  const route = useRoute();
  const { skinPath, gamePath, toolsPath, overlayPath, overlayConfigPath, installedPath, lcuState } =
    useGlobalState();
  const { handleDrawOpen, drawerOpen } = useFeature();
</script>

<style scoped lang="less"></style>
