<template>
  <div class="float-tools">
    <a-tooltip title="打开侧边栏" placement="left">
      <button class="float-icon-btn" @click="handleDrawOpen">
        <CarOutlined />
      </button>
    </a-tooltip>
    <a-tooltip
      title="自动应用：锁定英雄或打开皮肤页时，自动把该英雄已选的皮肤写入 R3nzSkin"
      placement="left"
    >
      <div class="float-switch">
        <a-switch v-model:checked="autoChose" size="small" @change="persistAutoChose" />
      </div>
    </a-tooltip>
  </div>
</template>
<script setup lang="ts">
  import { onMounted } from 'vue';
  import { CarOutlined } from '@ant-design/icons-vue';
  import useGlobalState from '@/hooks/use-global-state';
  import { f_getAutoApplySetting, f_setAutoApplySetting } from '@/utils/business';

  defineProps({
    handleDrawOpen: Function,
  });

  const { autoChose } = useGlobalState();

  onMounted(async () => {
    try {
      const setting = await f_getAutoApplySetting();
      if (setting && typeof setting.enabled === 'boolean') {
        autoChose.value = setting.enabled;
      }
    } catch {
      // 读取失败就用默认值（开）
    }
  });

  const persistAutoChose = async () => {
    try {
      await f_setAutoApplySetting(!!autoChose.value);
    } catch {
      // 持久化失败不影响本次会话
    }
  };
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
