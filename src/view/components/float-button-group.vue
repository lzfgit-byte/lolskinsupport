<template>
  <div class="float-tools">
    <a-tooltip title="打开侧边栏" placement="left">
      <button class="float-icon-btn" @click="handleDrawOpen">
        <CarOutlined />
      </button>
    </a-tooltip>
    <a-tooltip title="切换自动应用" placement="left">
      <div class="float-switch">
        <a-switch v-model:checked="autoChose" size="small" />
      </div>
    </a-tooltip>
  </div>
</template>
<script setup lang="ts">
  import { CarOutlined } from '@ant-design/icons-vue';
  import useGlobalState from '@/hooks/use-global-state';
  defineProps({
    handleDrawOpen: Function,
  });
  const { autoChose } = useGlobalState();
</script>

<style scoped lang="less">
  .float-tools {
    position: fixed;
    top: 64px;
    right: 22px;
    z-index: 60000;
    display: grid;
    gap: 10px;
    justify-items: center;
  }

  .float-icon-btn,
  .float-switch {
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid #344553;
    background: #151e27;
    box-shadow: 0 8px 18px rgba(0, 0, 0, 0.28);
  }

  .float-icon-btn {
    width: 36px;
    height: 36px;
    color: #f0dfaf;
    cursor: pointer;

    &:hover {
      border-color: #76a85a;
      color: #ffffff;
    }
  }

  .float-switch {
    width: 52px;
    height: 32px;
  }
</style>
