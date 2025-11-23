<template>
  <div>
    <img :src="imgSrc" :alt="imgSrc" />
    <span
      v-if="percentageRef > 0 && percentageRef < 100"
      absolute
      color-white
      style="left: 50%; top: 50%; transform: translateX(-50%) translateY(-50%); font-size: 16px"
    >
      {{ progressInfo }}
    </span>
  </div>
</template>
<script setup lang="ts">
  import { onMounted, onUnmounted } from 'vue';
  import { hashString } from '@ilzf/utils';
  import useImg from '@/components/image/hooks/useImg';
  import bus from '@/utils/bus';
  const props = defineProps({ url: String, force: Boolean, global: Boolean });
  const { init, imgSrc, progressInfo, percentageRef } = useImg(props);
  onMounted(() => {
    init();
  });
  onUnmounted(() => {
    bus.off(hashString(props.url));
  });
</script>

<style scoped lang="less">
  @import '@/styles/values';
  img {
    max-width: 100%;
    max-height: 100%;
    height: auto;
    width: auto;
    border-radius: @radius;
    cursor: grab;
    &:active {
      cursor: grabbing !important;
    }
    -webkit-user-drag: none;
    user-select: none;
    -moz-user-select: none;
    -webkit-user-select: none;
    -ms-user-select: none;
  }
</style>
