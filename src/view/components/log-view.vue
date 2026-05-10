<template>
  <a-drawer
    v-model:open="logDrawOpen"
    placement="right"
    width="90vw"
    :header-style="{ display: 'none' }"
    :z-index="30000"
    root-class-name="ghs-video-drawer-container"
    :content-wrapper-style="{ zIndex: 30000 }"
    :body-style="{ zIndex: 30000, padding: '0' }"
    :force-render="true"
  >
    <div h-full w-full class="editor" relative>
      <a-button z-30001 size="small" absolute right-5 top-1 @click="handleClear">清除日志</a-button>
      <a-switch
        v-model:checked="isQuickDelete"
        z-30001
        size="small"
        absolute
        right-30
        top-2
      ></a-switch>
      <Codemirror
        v-model="code"
        :autofocus="true"
        :indent-with-tab="true"
        :tab-size="2"
        :extensions="extensions"
        @ready="handleReady"
      />
    </div>
  </a-drawer>
  <!--  <a-float-button -->
  <!--    :style="{ right: '-10px', top: '-10px', zIndex: 30000 }" -->
  <!--    @click="drawerOpen = !drawerOpen" -->
  <!--  > -->
  <!--    <template #icon> -->
  <!--      <ProfileOutlined /> -->
  <!--    </template> -->
  <!--  </a-float-button> -->
</template>

<script setup lang="ts">
  import { onMounted, ref, shallowRef } from 'vue';
  import { Codemirror } from 'vue-codemirror';
  import { javascript } from '@codemirror/lang-javascript';
  import { oneDark } from '@codemirror/theme-one-dark';
  import { watchEffect } from 'vue-demi';
  import useGlobalState from '@/hooks/use-global-state';
  const { LogUtil, logDrawOpen, isQuickDelete } = useGlobalState();
  const code = ref(``);
  const extensions = [javascript(), oneDark];
  const view = shallowRef();
  const handleReady = (payload) => {
    view.value = payload.view;
  };
  const handleClear = () => {
    LogUtil.clear();
  };
  watchEffect(() => {
    code.value = LogUtil.getLogs().join('\n');
  });
  defineExpose({
    show: () => {
      logDrawOpen.value = true;
    },
  });
  onMounted(() => {
    document.addEventListener('keydown', function (event) {
      if (event.ctrlKey && event.key === 'l') {
        logDrawOpen.value = !logDrawOpen.value;
      }
      if (event.ctrlKey && isQuickDelete.value && event.key === 'c') {
        LogUtil.clear();
      }
    });
  });
</script>

<style scoped lang="less">
  .editor {
    height: 100%;
    width: 100%;
    :deep(.cm-editor) {
      outline: none !important;
      height: 100%;
    }
  }
</style>
