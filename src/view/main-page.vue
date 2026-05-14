<template>
  <LolskinMain></LolskinMain>
  <FloatButtonGroup :handle-draw-open="handleDrawOpen"></FloatButtonGroup>
</template>
<script setup lang="ts">
  import LolskinMain from '@/view/lolskin/lolskin-main.vue';
  import FloatButtonGroup from '@/view/components/float-button-group.vue';
  import bus from '@/utils/bus';
  const handleDrawOpen = () => {
    bus.emit('open-set');
  };
</script>

<style scoped lang="less"></style>
