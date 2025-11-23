<template>
  <van-tabbar v-model="active">
    <van-tabbar-item name="home" icon="home-o">首页</van-tabbar-item>
    <van-tabbar-item name="collect" icon="search">
      <CollectView v-if="active === 'collect'" :show-detail="showDetail" :up-collect="upCollect" />
      <div v-else>收藏</div>
    </van-tabbar-item>
    <van-tabbar-item name="history" icon="friends-o">
      <HistoryView
        v-if="active === 'history'"
        :show-detail="showDetail"
        :up-collect="upCollect"
      ></HistoryView>
      <div v-else>历史</div>
    </van-tabbar-item>
    <van-tabbar-item name="tags" icon="setting-o">
      <TagsView v-if="active === 'tags'" :load="load" />
      <div v-else>标签</div>
    </van-tabbar-item>
  </van-tabbar>
</template>
<script setup lang="ts">
  import TagsView from '@/views/components/tags-view.vue';
  import CollectView from '@/views/components/collect-view.vue';
  import HistoryView from '@/views/components/history-view.vue';
  import useGlobalState from '@/hook/useGlobalState';
  defineProps({ load: Function, showDetail: Function, upCollect: Function });
  const { active } = useGlobalState();
</script>

<style scoped lang="less"></style>
