<template>
  <div
    v-if="info?.title || $slots.default"
    class="ghs-tag-container"
    :class="{
      tageInfo: type === 'info',
      tageSuccess: type === 'success',
      tagDanger: type === 'danger',
      tagWaring: type === 'waring',
      tagGap: showGap,
    }"
    flex-inline
    justify-center
    items-center
    @click="emits('click', info)"
  >
    <slot>
      {{ info?.title }}
    </slot>
  </div>
</template>
<script setup lang="ts">
  import type { PropType } from 'vue-demi';
  import type { Tag } from '@ghs/types';
  import type { GhsTagsType } from '@/components/tag/ghs-tage-type';

  defineProps({
    info: Object as PropType<Tag>,
    type: { type: String as PropType<GhsTagsType>, default: 'default' },
    showGap: Boolean,
  });
  const emits = defineEmits(['click']);
</script>

<style scoped lang="less">
  .ghs-tag-container {
    padding: 0.1rem 0.2rem;
    background-color: rgba(51, 51, 51, 0.87);
    color: white;
    font-size: 0.8rem;
    border-radius: 0.2rem;
    box-sizing: unset;
    cursor: pointer;
  }
  .tagGap {
    margin: 0 6px 6px 0;
  }
  .base {
    padding: 2px 9px;
    border-radius: 4px;
  }
  .tageInfo {
    .base();
    background-color: #ecf5ff;
    color: #53a8ff;
    border-color: #d9ecff;
  }
  .tageSuccess {
    .base();
    background-color: #f0f9eb;
    color: #87cf63;
    border-color: #e1f3d8;
  }
  .tagDanger {
    .base();
    background-color: #fef0f0;
    color: #f78b8b;
    border-color: #fde2e2;
  }
  .tagWaring {
    .base();
    background-color: #fdf6ec;
    color: #e9ac52;
    border-color: #faecd8;
  }
</style>
