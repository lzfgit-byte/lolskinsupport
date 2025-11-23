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
  <a-float-button tooltip="切换自动应用" type="default" :style="{ right: '15px', top: '120px' }">
    <template #icon>
      <a-switch v-model:checked="autoChose" />
    </template>
  </a-float-button>
</template>
<script setup lang="ts">
  import { CarOutlined } from '@ant-design/icons-vue';
  import useGlobalState from '@/hooks/use-global-state';
  defineProps({
    handleDrawOpen: Function,
  });
  const { autoChose } = useGlobalState();
</script>

<style scoped lang="less"></style>
