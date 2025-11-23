<template>
  <div @click="showBottom = true">收藏</div>
  <van-popup
    v-model:show="showBottom"
    position="bottom"
    :style="{ height: '80%', overflow: 'hidden' }"
  >
    <div h-full w-full p-10px style="overflow-y: auto; overflow-x: hidden">
      <GhsItem
        v-for="item in items"
        :key="item.jumpUrl"
        :item="item"
        :width="`${parseInt(webConfig?.imgWidth) * widthAdapter(webConfig?.imgWidth)}px`"
        :height="`${parseInt(webConfig?.imgHeight) * widthAdapter(webConfig?.imgWidth)}px`"
        :on-close-click="() => 1"
        @img-click="showDetailAndUp(item)"
        @up-collect-close="upCollect"
      ></GhsItem>
      <van-empty v-if="items.length === 0" />
    </div>
  </van-popup>
</template>
<script setup lang="ts">
  import { computed, onMounted, onUnmounted, ref } from 'vue';
  import type { Item } from '@ghs/types';
  import GhsItem from '@/components/item/ghs-item.vue';
  import useGlobalState from '@/hook/useGlobalState';
  import { calcWidthAdapter, widthAdapter } from '@/utils/kit-util';
  const props = defineProps({
    showDetail: Function,
    upCollect: Function,
  });
  const showBottom = ref(true);
  const { webConfig, collects } = useGlobalState();
  const items: Item[] = computed(() => collects.value.map((item) => JSON.parse(item.value))) as any;

  const showDetailAndUp = async (item) => {
    await props?.showDetail(item);
  };
  onMounted(async () => {
    await props?.upCollect();
  });
</script>

<style scoped lang="less">
  .list-move, /* 对移动中的元素应用的过渡 */
.list-enter-active,
.list-leave-active {
    transition: all 0.5s ease-in-out;
  }

  .list-enter-from,
  .list-leave-to {
    opacity: 0;
    //transform: translateX(30px);
  }
  .list-leave-active {
    position: absolute;
  }
</style>
