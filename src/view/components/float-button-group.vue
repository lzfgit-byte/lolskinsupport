<template>
  <a-float-button
    tooltip="打开侧边栏"
    type="default"
    :style="{ right: '15px', top: '60px' }"
    @click="handleDrawOpen"
  >
    <template #icon>
      <CarOutlined />
    </template>
  </a-float-button>
</template>
<script setup lang="ts">
  import { CarOutlined } from '@ant-design/icons-vue';

  defineProps({
    handleDrawOpen: Function,
  });
</script>

<style scoped lang="less"></style>
