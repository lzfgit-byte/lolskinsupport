<template>
  <a-drawer
    v-model:open="choseDrawerOpen"
    placement="right"
    width="80vw"
    :header-style="{ display: 'none' }"
    destroy-on-close
  >
    <DoLolskinChoseSkin :key="heroId"></DoLolskinChoseSkin>
  </a-drawer>
</template>
<script setup lang="ts">
  import useGlobalState from '@/hooks/use-global-state';
  import DoLolskinChoseSkin from '@/view/components/do-lolskin-chose-skin.vue';
  const { heroId, choseDrawerOpen } = useGlobalState();
</script>

<style scoped lang="less"></style>
