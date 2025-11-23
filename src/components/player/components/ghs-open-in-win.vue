<template>
  <a-float-button
    v-if="url?.length > 0"
    tooltip="用win打开"
    type="default"
    :style="{
      right: '15px',
      top: '300px',
      width: '30px',
      height: '30px',
      opacity: 0.2,
    }"
    @click="openWithWin"
  >
    <template #icon>
      <YoutubeOutlined :style="{ fontSize: '14px', color: '#323' }" />
    </template>
  </a-float-button>
</template>
<script setup lang="ts">
  import { YoutubeOutlined } from '@ant-design/icons-vue';
  import { f_winOpenAny } from '@/utils/business';
  import useGlobalState from '@/hooks/use-global-state';
  const props = defineProps({ url: String });

  const { webConfig } = useGlobalState();
  const openWithWin = async () => {
    const divHtml: HTMLDivElement = document.querySelector('#mui-player');
    await f_winOpenAny(
      props?.url,
      webConfig.value?.ifWinExecCode,
      divHtml?.clientWidth || webConfig.value?.winWidth,
      (divHtml?.clientHeight || webConfig.value?.winHeight) + 50
    );
  };
  defineExpose({ openWithWin });
</script>

<style scoped lang="less"></style>
