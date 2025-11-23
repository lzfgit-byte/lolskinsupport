<template>
  <GhsDialog v-model:show="visible">
    <div id="ghs-video-container-id" max-w-100vw relative>
      <VideoHtml5
        v-if="videoVisible && visible"
        :key="srcComp"
        :src="srcComp"
        :title="titleComp"
        :type="typeComp"
      ></VideoHtml5>
    </div>
    <template #series>
      <GhsPlayerComments :comments="comments"></GhsPlayerComments>
      <GhsPlayerSeries :analysis="analysis" @change="handleSeriesChange"></GhsPlayerSeries>
    </template>
    <template v-if="urlsRef?.length > 0" #headerRightTag>
      <div flex-inline mt-5px>
        <GhsTag
          v-for="(item, index) in urlsRef"
          :key="item.url + index"
          :show-gap="true"
          :type="srcComp === item.url ? 'info' : 'waring'"
          @click="handleClick(item)"
        >
          {{ item.quality }}
        </GhsTag>
      </div>
    </template>
  </GhsDialog>
</template>
<script setup lang="ts">
  import type { Analysis, AnalysisVideoDetail, Comment, Detail, DetailInfo } from '@ghs/types';
  import { ref } from 'vue';
  import VideoHtml5 from '@/components/player/video-html5.vue';
  import type { VideoType } from '@/components/player/types';
  import GhsTag from '@/components/tag/ghs-tag.vue';
  import { message } from '@/utils/kit-util';
  import GhsDialog from '@/components/dialog/ghs-dialog.vue';
  import GhsPlayerComments from '@/components/player/ghs-player-comments.vue';
  import GhsPlayerSeries from '@/components/player/ghs-player-series.vue';
  // import GhsPlayerComments from '@/components/player/ghs-player-comments.vue';
  // import GhsPlayerSeries from '@/components/player/ghs-player-series.vue';
  const visible = ref(false);
  const srcComp = ref<String>();
  const titleComp = ref<String>();
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
