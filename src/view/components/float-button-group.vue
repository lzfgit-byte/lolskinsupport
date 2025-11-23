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
  <a-float-button
    :tooltip="`清除缓存,缓存大小:${cacheSize || 0}`"
    type="default"
    :style="{ right: '15px', top: '120px' }"
    @click="clearCache(null)"
    @mouseenter="mouseEnter"
  >
    <template #icon>
      <ClearOutlined />
    </template>
  </a-float-button>
  <a-float-button
    tooltip="刷新页面"
    type="default"
    :style="{ right: '15px', top: '180px' }"
    @click="clearCache(FileType.HTML)"
    @mouseenter="mouseEnter"
  >
    <template #icon>
      <RedoOutlined />
    </template>
  </a-float-button>
  <a-float-button
    tooltip="添加config"
    type="default"
    :style="{ right: '15px', top: '240px' }"
    @click="addCode"
  >
    <template #icon>
      <PlusOutlined />
    </template>
  </a-float-button>
  <a-float-button
    tooltip="编辑config"
    type="default"
    :style="{ right: '15px', top: '300px' }"
    @click="editCode"
  >
    <template #icon>
      <FormOutlined />
    </template>
  </a-float-button>
</template>
<script setup lang="ts">
  import {
    CarOutlined,
    ClearOutlined,
    FormOutlined,
    PlusOutlined,
    RedoOutlined,
  } from '@ant-design/icons-vue';
  import { FileType } from '@ghs/types';
  defineProps({
    handleDrawOpen: Function,
    clearCache: Function,
    cacheSize: String,
    mouseEnter: Function,
    addCode: Function,
    editCode: Function,
  });
</script>

<style scoped lang="less"></style>
