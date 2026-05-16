<template>
  <a-drawer
    v-model:open="choseDrawerOpen"
    placement="right"
    width="95vw"
    :header-style="{ display: 'none' }"
    style="background-color: #1b2128"
    root-class-name="custom-no-padding-drawer"
    destroy-on-close
  >
    <DoLolskinChoseSkin :key="heroId"></DoLolskinChoseSkin>
  </a-drawer>
</template>
<script setup lang="ts">
  import useGlobalState from '@/hooks/use-global-state';
  import DoLolskinChoseSkin from '@/view/components/do-lolskin-chose-skin.vue';
  const { heroId, choseDrawerOpen, skinId } = useGlobalState();
</script>

<style>
  .custom-no-padding-drawer .ant-drawer-body {
    padding: 0 !important;
  }
</style>
<style scoped lang="less">
  .content-box {
    background-color: #1b2128;
  }
</style>
