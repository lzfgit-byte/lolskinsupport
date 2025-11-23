<template>
  <div h-full w-full relative flex justify-center items-center class="img-container">
    <img :src="imgSrc || src" :alt="imgSrc" @error="handleError" />
    <transition :duration="300">
      <div
        v-if="percentageRef > 0 && percentageRef < 100"
        absolute
        bottom-1
        w-full
        color="white"
        class="progress-img"
      >
        <a-button v-if="isError" @click="init">重新加载</a-button>
        <div relative w-full box-border p-l-2 p-r-2 class="progress">
          {{ progressInfo }}
        </div>
      </div>
    </transition>
  </div>
</template>
<script setup lang="ts">
  import { computed } from 'vue';
  import src from './loading.gif?url';
  import useImg from '@/components/image/hooks/useImg';

  const props = defineProps({
    url: String,
    force: Boolean,
    maxHeight: String,
    maxWidth: String,
    global: Boolean,
  });
  const { init, imgSrc, handleError, percentageRef, progressInfo, isError } = useImg(props);
  init();
  const imgMaxHeight = computed(() => props.maxHeight || '100%');
  const imgMaxWidth = computed(() => props.maxWidth || '100%');
</script>

<style scoped lang="less">
  @import '@/styles/values';
  .img-container {
    img {
      max-width: v-bind(imgMaxWidth);
      max-height: v-bind(imgMaxHeight);
      height: auto;
      width: auto;
      border-radius: @radius;
      position: absolute;
    }
    .progress-img {
      background-color: rgba(0, 0, 0, 0.44);
      border-bottom-right-radius: @radius;
      border-bottom-left-radius: @radius;
    }
  }

  .v-leave-from,
  .v-enter-to {
    transform: translateY(102%);
    opacity: 1;
  }
  .v-enter-from,
  .v-leave-to {
    transform: translateY(96%);
    opacity: 0;
  }
</style>
