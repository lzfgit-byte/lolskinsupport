<template>
  <DoLolskinChoseSkin :key="heroId"></DoLolskinChoseSkin>
</template>
<script setup lang="ts">
  import DoLolskinChoseSkin from '@/view/lolskin/do-lolskin-chose-skin.vue';
  import useGlobalState from '@/hooks/use-global-state';
  const { heroId } = useGlobalState();
</script>

<style scoped lang="less"></style>
