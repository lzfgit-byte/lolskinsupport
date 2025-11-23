<template>
  <FloatButtonGroup :handle-draw-open="handleDrawOpen"></FloatButtonGroup>
  <a-drawer
    v-model:open="drawerOpen"
    placement="right"
    width="60vw"
    :header-style="{ display: 'none' }"
  >
    <div h-85vh overflow-auto w-full m-t-4 p-t-2>
      <transition-group
        enter-active-class="animate__animated animate__fadeIn"
        leave-active-class="animate__animated animate__fadeOut"
        :duration="200"
      >
        <h1>设置信息</h1>
      </transition-group>
    </div>
  </a-drawer>
</template>
<script setup lang="ts">
  import { useRoute } from 'vue-router';
  import FloatButtonGroup from '@/view/components/float-button-group.vue';
  import useFeature from '@/view/hook/use-feature';

  const route = useRoute();
  const { handleDrawOpen, drawerOpen } = useFeature();
</script>

<style scoped lang="less"></style>
