<template>
  <van-button type="default" size="small" @click="showBottom = true">分页</van-button>
  <van-popup v-model:show="showBottom" position="bottom" :style="{ height: '80%' }">
    <div class="ghs-pagination-container" flex-inline justify-center items-center>
      <div
        v-for="(item, index) in pagination"
        :key="index"
        :class="{ current: item.isCurrent }"
        class="ghs-pag-info"
        flex
        justify-center
        items-center
        cursor-pointer
        @click="handleClick(item)"
      >
        {{ item.title }}
      </div>
    </div>
  </van-popup>
</template>
<script setup lang="ts">
  import type { Pagination } from '@ghs/types';
  import type { PropType } from 'vue';
  import { onMounted, ref, watch } from 'vue';

  import { getHtml } from '@/api';

  const props = defineProps({ pagination: Array as PropType<Pagination[]> });
  const emits = defineEmits(['click']);
  const handleClick = (item: Pagination) => {
    if (item.url && !item.isCurrent) {
      emits('click', item);
      showBottom.value = false;
    }
  };
  const showBottom = ref(false);
  watch(
    () => props.pagination,
    async () => {
      const index = props?.pagination?.findIndex((item) => item.isCurrent);
      if (index < props?.pagination?.length) {
        const next: Pagination = props?.pagination[index + 1];
        if (next) {
          await getHtml(next.url);
        }
      }
    }
  );
</script>

<style scoped lang="less">
  @import '@/styles/values';
  .ghs-pagination-container {
    display: flex;
    flex-direction: column;
    .ghs-pag-info {
      width: 100%;
      border-radius: @radius / 4;
      padding: 10px;
      border-bottom: 1px solid #ccc;
      margin: 0 0.2rem 0 0;
      line-height: 1rem;
    }
  }
  .current {
    background-color: #ccc;
  }
</style>
