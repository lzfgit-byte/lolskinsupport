<template>
  <span class="ghs-text-wrapper" h-full w-full :title="value">
    {{ value }}
  </span>
</template>
<script setup lang="ts">
  defineProps({ value: String });
</script>

<style scoped lang="less">
  .ghs-text-wrapper {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: 0.9rem;
  }
</style>
