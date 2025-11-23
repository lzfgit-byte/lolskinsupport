<template>
  <div h-full w-full>
    <TransitionGroup name="list">
      <GhsItem
        v-for="(item, index) in items"
        :key="`${generateKey(`${index}`)}`"
        :item="item"
        :width="webConfig.imgWidth"
        :height="webConfig.imgHeight"
        @img-click="showDetailProxy(item)"
        @up-collect="upCollect"
      ></GhsItem>
    </TransitionGroup>
    <a-empty v-if="items.length === 0" />
  </div>
</template>
<script setup lang="ts">
  import { computed, onMounted, ref } from 'vue';
  import type { ViewedHistoryEntity } from '@ghs/constant';
  import type { Item } from '@ghs/types';
  import { executeFunc, generateKey, waitTime } from '@ilzf/utils';
  import { f_listHistory } from '@/utils/business';
  import GhsItem from '@/components/item/ghs-item.vue';
  import useGlobalState from '@/hooks/use-global-state';
  const props = defineProps({
    showDetail: Function,
    upCollect: Function,
  });
  const { webConfig } = useGlobalState();

  const history = ref<ViewedHistoryEntity[]>([]);

  const initHistory = async () => {
    history.value = await f_listHistory();
  };
  const showDetailProxy = async (item: Item) => {
    executeFunc(props?.showDetail, item);
  };

  const items = computed(() => history?.value.map((item) => JSON.parse(item.value)));

  onMounted(() => {
    initHistory();
  });
</script>

<style scoped lang="less"></style>
