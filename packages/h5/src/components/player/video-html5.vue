<template>
  <div>
    <div id="mui-player" style="max-height: 60vh; width: 100%"></div>
  </div>
</template>

<script setup lang="ts">
  import type { PropType } from 'vue';
  import { onMounted, onUnmounted } from 'vue';
  import 'mui-player/dist/mui-player.min.css';
  // @ts-ignore
  import MuiPlayer from 'mui-player';
  import Hls from 'hls.js';
  // @ts-ignore
  import { debounce } from 'lodash';

  import type { VideoType } from '@/components/player/types';
  import { message } from '@/utils/kit-util';
  import { getVideoUrl } from '@/api';

  const props = defineProps({
    src: String,
    title: String,
    type: String as PropType<VideoType>,
  });
  let mp;
  let parse = {};
  if (props.type === 'm3u8') {
    parse = {
      type: 'hls',
      loader: Hls,
      config: {
        // hls config to：https://github.com/video-dev/hls.js/blob/HEAD/docs/API.md#fine-tuning
        debug: false,
      },
    };
  }
  onMounted(() => {
    mp = new MuiPlayer({
      container: '#mui-player',
      poster: 'https://cdn.jsdelivr.net/gh/xdlumia/files/video-play/ironMan.jpg',
      title: props.title,
      autoFit: false,
      height: '80vh',
      loop: true,
      objectFit: 'contain',
      src: getVideoUrl(props.src),
      custom: { footerControls: [] },
      plugins: [],
      parse,
    });
    const errFunc = debounce(() => {
      message.warn(`${props.src}视频播放错误`);
    }, 10);
    mp.on('error', errFunc);
  });
  onUnmounted(() => {
    mp.destroy();
  });
</script>

<style scoped lang="less"></style>
