<template>
  <a-config-provider :locale="zhCN">
    <MainLayout>
      <router-view></router-view>
    </MainLayout>
    <LogView ref="logRef"></LogView>
    <ConfigPage></ConfigPage>
  </a-config-provider>
</template>
<script setup lang="ts">
  import zhCN from 'ant-design-vue/es/locale/zh_CN';
  import useGlobalRef from '@/hooks/use-global-ref';
  import LogView from '@/view/components/log-view.vue';
  import MainLayout from '@/components/main-layout.vue';
  import ConfigPage from '@/view/components/config-page.vue';

  const { logRef } = useGlobalRef();
</script>

<style lang="less">
  @import '@/styles/style';
</style>
