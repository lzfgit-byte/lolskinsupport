<template>
  <div ref="bodyRef" style="height: 80vh; overflow: hidden">
    <div class="header" absolute top-0 left-0 style="height: 40px; background-color: white" z-1>
      <Search @search="handleSearch"></Search>
      <div>
        <GhsMenu />
        <GhsPagination :pagination="pagination" @click="handlePageClick"></GhsPagination>
      </div>
    </div>
    <div w-full style="height: 70vh; overflow-y: auto; overflow-x: hidden; margin-top: 40px">
      <GhsItem
        v-for="(item, index) in items"
        :key="item.jumpUrl + index + generateKey()"
        :item="item"
        :width="`${parseInt(webConfig?.imgWidth) * widthAdapter(webConfig?.imgWidth)}px`"
        :height="`${parseInt(webConfig?.imgHeight) * widthAdapter(webConfig?.imgWidth)}px`"
        :collect-sequence="collects?.length"
        @img-click="showDetail(item)"
        @up-collect="updateCollects"
      ></GhsItem>
    </div>
    <van-floating-bubble axis="xy" icon="replay" magnetic="x" @click="clearCache('html')" />
  </div>
  <GhsBottomMenus :load="load" :show-detail="showDetail" :up-collect="useCollect"></GhsBottomMenus>
</template>
<script setup lang="ts">
  import { generateKey } from '@ilzf/utils';
  import { useRoute } from 'vue-router';
  import { watchEffect } from 'vue';
  import usePageState from '@/hook/use-page-state';
  import GhsItem from '@/components/item/ghs-item.vue';
  import useCollect from '@/hook/use-collect';
  import { widthAdapter } from '@/utils/kit-util';
  import useFeature from '@/hook/use-feature';
  import GhsPagination from '@/components/pagination/ghs-pagination.vue';
  import Search from '@/components/search/search.vue';
  import GhsBottomMenus from '@/components/bottom-menus/ghs-bottom-menus.vue';
  import useGlobalState from '@/hook/useGlobalState';
  import GhsMenu from '@/components/menu/ghs-menu.vue';
  const { webKey } = useGlobalState();
  const route = useRoute();
  webKey.value = (route?.query?.key as string) || webKey.value;
  const {
    items,
    pagination,
    handlePageClick,
    handleSearch,
    webConfig,
    bodyRef,
    clearCache,
    load,
    init,
  } = usePageState();
  const { updateCollects, collects } = useCollect();
  const { showDetail, drawerOpen, handleDrawOpen, handleAddCode, handleEditCode, clearLogs } =
    useFeature();
  watchEffect(async () => {
    if (webKey.value) {
      await init();
      await load();
      await updateCollects();
    }
  });
</script>

<style scoped lang="less">
  .header {
    width: 95vw;
    display: flex;
    margin-left: 10px;
    justify-content: space-between;
    align-items: center;
  }
</style>
