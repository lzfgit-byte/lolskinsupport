<template>
  <div h-full w-full>
    <TransitionGroup name="list" tag="div">
      <GhsItem
        v-for="item in items"
        :key="item.jumpUrl"
        :item="item"
        :width="webConfig.imgWidth"
        :height="webConfig.imgHeight"
        :on-close-click="() => 1"
        @img-click="showDetailAndUp(item)"
        @up-collect-close="upCollect"
      ></GhsItem>
    </TransitionGroup>
    <a-empty v-if="items.length === 0" />
  </div>
</template>
<script setup lang="ts">
  import { computed, onMounted, onUnmounted } from 'vue';
  import type { Item } from '@ghs/types';
  import GhsItem from '@/components/item/ghs-item.vue';
  import useGlobalState from '@/hooks/use-global-state';

  const props = defineProps({
    showDetail: Function,
    upCollect: Function,
  });
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
