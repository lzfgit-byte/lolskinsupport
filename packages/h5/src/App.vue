<template>
  <van-config-provider>
    <div class="app-container" overflow-auto>
      <router-view></router-view>
    </div>
    <GhsPlayer ref="videoGlobalRef"></GhsPlayer>
    <ImgViewer ref="imgViewerRef"></ImgViewer>
    <div
      v-if="loading"
      flex
      absolute
      justify-center
      items-center
      style="
        background: rgba(0, 0, 0, 0.74);
        height: 100vh;
        width: 100vw;
        z-index: 100;
        top: 0;
        left: 0;
      "
      @click="loading = false"
    >
      <van-loading size="24" />
    </div>
  </van-config-provider>
</template>

<script setup lang="ts">
  import useInitData from '@/hook/useInitData';
  import useGlobalRef from '@/hook/use-global-ref';
  import GhsPlayer from '@/components/player/ghs-player.vue';
  import useGlobalState from '@/hook/useGlobalState';
  import ImgViewer from '@/components/imgViewer/img-viewer.vue';
  const { imgViewerRef, videoGlobalRef } = useGlobalRef();
  const { loading } = useGlobalState();

  useInitData();
</script>
<style lang="less" scoped>
  .app-container {
    padding-top: 10px;
    position: relative;
  }
</style>
