<template>
  <div @click="showBottom = true">历史</div>
  <van-popup
    v-model:show="showBottom"
    position="bottom"
    :style="{ height: '80%', overflow: 'hidden' }"
  >
    <div h-full w-full p-10px style="overflow-y: auto; overflow-x: hidden">
      <GhsItem
        v-for="(item, index) in items"
        :key="`${generateKey(`${index}`)}`"
        :item="item"
        :width="`${parseInt(webConfig?.imgWidth) * widthAdapter(webConfig?.imgWidth)}px`"
        :height="`${parseInt(webConfig?.imgHeight) * widthAdapter(webConfig?.imgWidth)}px`"
        @img-click="showDetailProxy(item)"
        @up-collect="upCollect"
      ></GhsItem>
      <van-empty v-if="items.length === 0" />
    </div>
  </van-popup>
</template>
<script setup lang="ts">
  import { computed, onMounted, ref } from 'vue';
  import type { Item } from '@ghs/types';
  import { executeFunc, generateKey, waitTime } from '@ilzf/utils';
  import GhsItem from '@/components/item/ghs-item.vue';
  import useGlobalState from '@/hook/useGlobalState';
  import { listHistory } from '@/api';
  import { widthAdapter } from '@/utils/kit-util';
  const props = defineProps({
    showDetail: Function,
    upCollect: Function,
  });
  const showBottom = ref(true);
  const { webConfig } = useGlobalState();

  const history = ref([]);

  const initHistory = async () => {
    history.value = await listHistory();
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
