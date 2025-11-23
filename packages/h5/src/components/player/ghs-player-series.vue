<template>
  <van-button
    v-if="analysisRef?.length > 0"
    type="default"
    size="small"
    @click="drawerOpenModel = true"
    >查看剧集</van-button
  >
  <van-popup
    v-model:show="drawerOpenModel"
    position="bottom"
    :style="{ height: '80%', zIndex: 10000 }"
  >
    <div h-full w-full overflow-auto>
      <van-tabs v-model:activeKey="activeKey">
        <van-tab v-for="item in analysis" :key="item.url" :title="item.title" />
      </van-tabs>
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
        <van-loading v-if="loading" type="spinner" />
        <span v-else>
          {{ item.title }}
        </span>
      </div>
    </div>
  </van-popup>
</template>
<script setup lang="ts">
  import type { PropType } from 'vue';
  import { computed, onMounted, ref, watchEffect } from 'vue';

  import { useVModel } from '@vueuse/core';
  import { getAnalysisDetail, getAnalysisVideoDetail, getSeriesCurrentContent } from '@/api';

  const props = defineProps({ analysis: Array as PropType<any[]> });
  const emits = defineEmits(['update:analysis', 'change']);
  const drawerOpenModel = ref(false);
  const analysisRef = useVModel(props, 'analysis', emits);
  const activeKey = ref();
  const analysisDetail = ref<any[]>();
  const activeSeries = ref<any>();
  const loading = ref(false);
  const history = ref<any>();
  const currentSeries = computed(() => {
    if (history.value && history.value.contentUrl) {
      const contentUrl = history.value?.contentUrl;
      const split = contentUrl.split('/');
      return split[split.length - 2];
    }
    return `${1}`;
  });
  const getDetail = async (analysis: any) => {
    analysisDetail.value = await getAnalysisDetail(analysis);
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
  const play = async (item: any) => {
    const detail = await getAnalysisVideoDetail(item).catch(() => {
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
    history.value = await getSeriesCurrentContent();
  };
  onMounted(async () => {
    await loadHistory();
    autoPlay();
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
