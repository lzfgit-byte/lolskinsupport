<template>
  <FloatButtonGroup :handle-draw-open="handleDrawOpen"></FloatButtonGroup>
</template>
<script setup lang="ts">
  import { useRoute } from 'vue-router';
  import FloatButtonGroup from '@/view/components/float-button-group.vue';
  import useFeature from '@/view/hook/use-feature';

  const route = useRoute();
  const { handleDrawOpen } = useFeature();
</script>

<style scoped lang="less"></style>
