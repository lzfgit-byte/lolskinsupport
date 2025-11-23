<template>
  <ViewLayout :loading="loading">
    <template #action>
      <div h-full w-full flex items-center justify-between>
        <div m-l-4>
          <Search @search="handleSearch"></Search>
        </div>
        <div>
          <GhsPagination :pagination="pagination" @click="handlePageClick"></GhsPagination>
        </div>
      </div>
    </template>
    <template #body>
      <div ref="bodyRef" h-full w-full overflow-auto relative>
        <transition-group
          name="custom-classes"
          enter-active-class="animate__animated animate__pulse"
        >
          <GhsItem
            v-for="(item, index) in items"
            :key="item.jumpUrl + index + generateKey()"
            :item="item"
            :width="webConfig?.imgWidth"
            :height="webConfig?.imgHeight"
            :collect-sequence="collects?.length"
            @img-click="showDetail(item)"
            @up-collect="updateCollects"
          ></GhsItem>
        </transition-group>
      </div>
    </template>
  </ViewLayout>
  <a-drawer
    v-model:open="drawerOpen"
    placement="right"
    :width="webConfig?.drawWidth"
    :header-style="{ display: 'none' }"
  >
    <a-segmented :key="segmentedData" v-model:value="segmentedValue" :options="segmentedData" />
    <div h-85vh overflow-auto w-full m-t-4 p-t-2>
      <transition-group
        enter-active-class="animate__animated animate__fadeIn"
        leave-active-class="animate__animated animate__fadeOut"
        :duration="200"
      >
        <TagsView
          v-if="drawerOpen && segmentedValue === '标签'"
          :key="webKey"
          :load="load"
        ></TagsView>
        <CollectView
          v-if="drawerOpen && segmentedValue === '收藏'"
          :key="webKey"
          :show-detail="showDetail"
          :up-collect="updateCollects"
        ></CollectView>
        <HistoryView
          v-if="drawerOpen && segmentedValue === '历史'"
          :key="webKey"
          :show-detail="showDetail"
          :up-collect="updateCollects"
        ></HistoryView>
        <SystemConfig
          v-if="drawerOpen && segmentedValue === '系统配置'"
          :key="webKey"
          :chose-db-path="setDbPath"
        ></SystemConfig>
        <FilterView
          v-if="drawerOpen && segmentedValue === '过滤选项'"
          :key="webKey"
          :load="load"
        ></FilterView>
        <WebConfigView v-if="drawerOpen && segmentedValue === '配置'" :key="webKey">
        </WebConfigView>
      </transition-group>
    </div>
    <template v-if="['日志'].includes('日志')" #footer>
      <div h-full w-full flex justify-end items-center>
        <a-space>
          <a-button v-if="segmentedValue === '日志'" size="small" @click="clearLogs">
            清空日志
          </a-button>
        </a-space>
      </div>
    </template>
  </a-drawer>
  <FloatButtonGroup
    :handle-draw-open="handleDrawOpen"
    :clear-cache="clearCache"
    :cache-size="cacheSize"
    :mouse-enter="calcCacheSize"
    :add-code="handleAddCode"
    :edit-code="handleEditCode"
  ></FloatButtonGroup>
</template>
<script setup lang="ts">
  import { useRoute } from 'vue-router';
  import { generateKey } from '@ilzf/utils';
  import { watchEffect } from 'vue-demi';
  import ViewLayout from '@/components/layout/view-layout.vue';
  import GhsPagination from '@/components/pagination/ghs-pagination.vue';
  import usePageState from '@/view/hook/use-page-state';
  import Search from '@/components/search/search.vue';
  import useFeature from '@/view/hook/use-feature';
  import GhsItem from '@/components/item/ghs-item.vue';
  import TagsView from '@/view/components/tags-view.vue';
  import CollectView from '@/view/components/collect-view.vue';
  import useCollect from '@/view/hook/use-collect';
  import HistoryView from '@/view/components/history-view.vue';
  import FloatButtonGroup from '@/view/components/float-button-group.vue';
  import SystemConfig from '@/view/components/system-config.vue';
  import useGlobalState from '@/hooks/use-global-state';
  import FilterView from '@/view/components/filter-view.vue';
  import WebConfigView from '@/view/components/web-config-view.vue';
  const route = useRoute();
  const { webKey, pagination, items, webConfig } = useGlobalState();
  const { segmentedValue, segmentedData, cacheSize, loading } = useGlobalState();
  webKey.value = (route?.query?.key as string) || webKey.value;

  const {
    handlePageClick,
    handleSearch,
    clearCache,
    setDbPath,
    calcCacheSize,
    load,
    init,
    bodyRef,
  } = usePageState();
  const { showDetail, drawerOpen, handleDrawOpen, handleAddCode, handleEditCode, clearLogs } =
    useFeature();
  const { collects, updateCollects } = useCollect();
  watchEffect(async () => {
    if (webKey.value) {
      await init();
      await load();
      await updateCollects();
    }
  });
</script>

<style scoped lang="less"></style>
