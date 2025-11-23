<template>
  <div class="view-container" h-full w-full relative>
    <div
      v-if="loading"
      class="view-spin-class"
      h-full
      w-full
      absolute
      z-1001
      flex
      justify-center
      items-center
    >
      <div m-b-67px>
        <GhsLoading></GhsLoading>
      </div>
    </div>
    <div class="view-action" w-full flex h-full items-center justify-end gap-1>
      <slot name="action"></slot>
    </div>
    <div class="view-body" w-full relative>
      <slot name="body"></slot>
    </div>
  </div>
</template>
<script setup lang="ts">
  import GhsLoading from '@/components/loading/ghs-loading.vue';

  defineProps({ loading: Boolean });
</script>

<style scoped lang="less">
  @import './styles/view-layout';
</style>
