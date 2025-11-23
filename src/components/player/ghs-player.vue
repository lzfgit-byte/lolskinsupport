<template>
  <GhsDialog
    v-model:visible="visible"
    :title="titleComp"
    :destroy-on-close="true"
    top="5%"
    :mask-closed="true"
    @close="drawerOpen = false"
  >
    <div id="ghs-video-container-id" min-h-80vh relative>
      <VideoHtml5
        v-if="videoVisible && visible && srcComp"
        :key="srcComp"
        :src="srcComp"
        :title="titleComp"
        :type="typeComp"
        :on-error="playOnError"
      ></VideoHtml5>
      <GhsPlayerComments :comments="comments"></GhsPlayerComments>
      <GhsPlayerSeries :analysis="analysis" @change="handleSeriesChange"></GhsPlayerSeries>
      <GhsOpenInWin ref="openInWind" :url="srcComp"></GhsOpenInWin>
    </div>
    <template #headerRightTag>
      <GhsScrollEasy>
        <GhsTag
          v-for="(item, index) in urlsRef"
          :key="item.url + index"
          :show-gap="true"
          :type="srcComp === item.url ? 'info' : 'waring'"
          @click="handleClick(item)"
        >
          {{ item.quality }}
        </GhsTag>
      </GhsScrollEasy>
    </template>
  </GhsDialog>
</template>
<script setup lang="ts">
  import { ref } from 'vue-demi';
  import type { Analysis, AnalysisVideoDetail, Comment, Detail } from '@ghs/types';
  import type { DetailInfo } from '@ghs/types/src';
  import { message } from 'ant-design-vue';
  import VideoHtml5 from '@/components/player/video-html5.vue';
  import type { VideoType } from '@/components/player/types';
  import GhsTag from '@/components/tag/ghs-tag.vue';
  import GhsDialog from '@/components/dialog/ghs-dialog.vue';
  import GhsPlayerComments from '@/components/player/components/ghs-player-comments.vue';
  import GhsPlayerSeries from '@/components/player/components/ghs-player-series.vue';
  import GhsScrollEasy from '@/components/scrollEasy/ghs-scroll-easy.vue';
  import GhsOpenInWin from '@/components/player/components/ghs-open-in-win.vue';
  import { notify } from '@/utils/kit-utils';
  const visible = ref(false);
  const srcComp = ref<string>();
  const titleComp = ref<string>();
  const typeComp = ref<'m3u8' | 'mp4'>();
  const urlsRef = ref();
  const videoVisible = ref(false);
  const handleClick = (info: Detail) => {
    srcComp.value = info.url;
    videoVisible.value = true;
  };
  const drawerOpen = ref(false);
  const comments = ref<Comment[]>([]);
  const analysis = ref<Analysis[]>();
  const openInWind = ref();
  const handleSeriesChange = (item: AnalysisVideoDetail[]) => {
    if (item.length === 1) {
      if (!item[0].url) {
        message.error('播放地址为空');
        return;
      }
      videoVisible.value = true;
      srcComp.value = item[0].url;
    }
    if (item.length > 1) {
      urlsRef.value = item.map((t) => ({ url: t.url, quality: t.name }));
    }
  };
  const reset = () => {
    urlsRef.value = [];
    comments.value = [];
    srcComp.value = '';
    titleComp.value = '';
    analysis.value = [];
  };
  const playOnError = () => {
    if (typeComp.value === 'mp4') {
      openInWind?.value?.openWithWin();
      return;
    }
    notify(1, srcComp.value, '视频播放错误');
  };
  defineExpose({
    show: (src: string, title: string, type: VideoType, comments_?: Comment[]) => {
      reset();
      srcComp.value = src;
      titleComp.value = title;
      typeComp.value = type;
      visible.value = true;
      videoVisible.value = true;
      comments.value = comments_;
    },
    showWithTag: (urls: Detail[], title: string, type: VideoType) => {
      reset();
      videoVisible.value = false;
      srcComp.value = null;
      urlsRef.value = urls;
      titleComp.value = title;
      typeComp.value = type;
      visible.value = true;
      // 默认播放最高的清晰度
      const c = urls.map((i) => parseInt(i.quality)).reduce((c, n) => (c > n ? c : n), 0);
      srcComp.value = urls.find((i) => parseInt(i.quality) === c)?.url;
      videoVisible.value = true;
      if (urls[0].comments?.length > 0) {
        comments.value = urls[0].comments;
      }
    },
    showSeries: (detailInfo: DetailInfo, title: string) => {
      reset();
      srcComp.value = '';
      titleComp.value = title;
      typeComp.value = 'm3u8';
      visible.value = true;
      videoVisible.value = false;
      analysis.value = detailInfo.analysis;
    },
  });
</script>

<style scoped lang="less"></style>
