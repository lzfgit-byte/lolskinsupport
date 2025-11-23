<template>
  <a-config-provider :locale="zhCN">
    <MainLayout>
      <router-view></router-view>
    </MainLayout>
    <LogView ref="logRef"></LogView>
  </a-config-provider>
</template>
<script setup lang="ts">
import zhCN from 'ant-design-vue/es/locale/zh_CN';
import MainLayout from '@/components/layout/main-layout.vue';
import useGlobalRef from '@/hooks/use-global-ref';
import LogView from '@/view/components/log-view.vue';

const {logRef} = useGlobalRef();
</script>

<style lang="less">
@import '@/styles/style';
</style>
