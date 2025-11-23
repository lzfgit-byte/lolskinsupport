<template>
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
</template>
<script setup lang="ts">
  import type { PropType } from 'vue-demi';
  import type { Pagination } from '@ghs/types';
  import { onMounted } from 'vue';
  import { message } from 'ant-design-vue';
  import { watch } from 'vue-demi';
  import { f_getHtml } from '@/utils/business';

  const props = defineProps({ pagination: Array as PropType<Pagination[]> });
  const emits = defineEmits(['click']);
  const handleClick = (item: Pagination) => {
    if (item.url && !item.isCurrent) {
      emits('click', item);
    }
  };
  watch(
    () => props.pagination,
    async () => {
      const index = props?.pagination?.findIndex((item) => item.isCurrent);
      if (index < props?.pagination?.length) {
        const next: Pagination = props?.pagination[index + 1];
        if (next) {
          await f_getHtml(next.url);
        }
      }
    }
  );
</script>

<style scoped lang="less">
  @import '@/styles/values';
  .ghs-pagination-container {
    .ghs-pag-info {
      border-radius: @radius / 4;
      padding: 0.4rem 0.8rem;
      border: 1px solid #ccc;
      margin: 0 0.2rem 0 0;
      line-height: 1rem;
    }
  }
  .current {
    border: 1px solid black !important;
  }
</style>
