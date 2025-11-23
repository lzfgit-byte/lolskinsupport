<template>
  <teleport to="body">
    <div absolute w-20 h-10 z-999999 class="percentage-img" flex justify-center items-center>
      {{ p }}%
    </div>
  </teleport>
</template>
<script setup lang="ts">
  import { useVModel } from '@vueuse/core';

  const props = defineProps({ percentage: Number });
  const emits = defineEmits([]);
  const p = useVModel(props, 'percentage', emits);
</script>

<style scoped lang="less">
  .percentage-img {
    left: 50%;
    top: 50%;
    transform: translateX(-50%) translateY(-50%);
    background-color: white;
    color: black;
    box-shadow: rgba(50, 50, 93, 0.25) 0 13px 27px -5px, rgba(0, 0, 0, 0.3) 0px 8px 16px -8px;
    border-radius: 8px;
  }
</style>
