<template>
  <a-float-button
    v-if="analysisRef?.length > 0"
    tooltip="查看剧集"
    type="default"
    :badge="{ count: currentSeries, color: 'blue', offset: [-25, 0] }"
    :style="{
      right: '15px',
      top: '200px',
      width: '30px',
      height: '30px',
      opacity: 0.2,
    }"
    @click="drawerOpenModel = true"
  >
    <template #icon>
      <UnorderedListOutlined :style="{ fontSize: '14px', color: '#323' }" />
    </template>
  </a-float-button>
  <a-drawer
    v-model:open="drawerOpenModel"
    title=""
    placement="right"
    :closable="false"
    :mask-closable="true"
    :z-index="20000"
    root-class-name="ghs-video-drawer-container"
    :content-wrapper-style="{ zIndex: 20000 }"
    :body-style="{ zIndex: 20000, padding: '10px' }"
    width="55%"
    :get-container="getDrawerContainer"
    :style="{ position: 'absolute' }"
  >
    <div h-full w-full overflow-auto>
      <a-tabs v-model:activeKey="activeKey">
        <a-tab-pane v-for="item in analysis" :key="item.url" :tab="item.title" />
      </a-tabs>
      <div
        v-for="item in analysisDetail"
        :key="item.url"
        :title="item.url"
        flex-inline
        justify-center
        items-center
        class="pre-series-item"
        :class="{
          currentSeries: currentSeries === `${item.title}`,
        }"
        @click="handleClick(item)"
      >
        <LoadingOutlined v-if="loading" />
        <span v-else>
          {{ item.title }}
        </span>
      </div>
    </div>
  </a-drawer>
</template>
<script setup lang="ts">
  import { LoadingOutlined, UnorderedListOutlined } from '@ant-design/icons-vue';
  import type { PropType } from 'vue-demi';
  import { watchEffect } from 'vue-demi';
  import type { Analysis, AnalysisDetail } from '@ghs/types';
  import { useVModel } from '@vueuse/core';
  import { computed, onMounted, ref } from 'vue';
  import type { ComicHistory } from '@ghs/constant';
  import {
    f_getAnalysisDetail,
    f_getAnalysisVideoDetail,
    f_getSeriesCurrentContent,
  } from '@/utils/business';

  const props = defineProps({ analysis: Array as PropType<Analysis[]> });
  const emits = defineEmits(['update:analysis', 'change']);
  const drawerOpenModel = ref(false);
  const analysisRef = useVModel(props, 'analysis', emits);
  const activeKey = ref();
  const analysisDetail = ref<AnalysisDetail[]>();
  const activeSeries = ref<AnalysisDetail>();
  const loading = ref(false);
  const history = ref<ComicHistory>();
  const currentSeries = computed(() => {
    if (history.value && history.value.contentUrl) {
      const contentUrl = history.value?.contentUrl;
      const split = contentUrl.split('/');
      return split[split.length - 2];
    }
    return `${1}`;
  });
  const getDetail = async (analysis: Analysis) => {
    analysisDetail.value = await f_getAnalysisDetail(analysis);
  };
  watchEffect(() => {
    if (analysisRef.value?.length > 0) {
      activeKey.value = analysisRef.value[0].url;
    }
  });
  watchEffect(() => {
    let index = analysisRef.value?.findIndex((t) => t.url === activeKey.value);
    if (activeKey.value && index > -1) {
      getDetail(analysisRef?.value[index]);
    }
  });

  const getDrawerContainer = () => document.getElementById('body');
  const play = async (item: AnalysisDetail) => {
    const detail = await f_getAnalysisVideoDetail(item).catch(() => {
      loading.value = false;
    });
    emits('change', detail);
  };
  const handleClick = async (item) => {
    if (loading.value) {
      return;
    }
    loading.value = true;
    activeSeries.value = item;
    await play(item);
    loading.value = false;
    await loadHistory();
  };
  const autoPlay = () => {
    if (analysisDetail?.value?.length === 1) {
      play(analysisDetail?.value[0]);
    } else {
      const index = analysisDetail.value?.findIndex((t) => `${t.title}` === currentSeries.value);
      if (index > -1) {
        play(analysisDetail?.value[index]);
      }
    }
  };
  const loadHistory = async () => {
    history.value = await f_getSeriesCurrentContent();
  };
  onMounted(async () => {
    await loadHistory();
    await autoPlay();
  });
</script>

<style scoped lang="less">
  .pre-series-item {
    border: 1px solid #ccc;
    margin: 0 10px 10px 0;
    width: 30px;
    height: 30px;
    cursor: pointer;
    &:hover {
      background-color: #ccc;
    }
  }
  .currentSeries {
    background-color: #ccc;
  }
</style>
