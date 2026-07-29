<template>
  <div class="skin-page">
    <aside class="hero-panel">
      <LolskinMain></LolskinMain>
    </aside>
    <main class="skin-panel">
      <DoLolskinChoseSkin v-if="heroId" :key="heroId"></DoLolskinChoseSkin>
      <div v-else class="empty-panel">
        <div class="empty-title">选择一个英雄</div>
        <div class="empty-subtitle">皮肤列表和预览会显示在这里</div>
      </div>
    </main>
  </div>
  <FloatButtonGroup :handle-draw-open="handleDrawOpen"></FloatButtonGroup>
</template>
<script setup lang="ts">
  import LolskinMain from '@/view/lolskin/lolskin-main.vue';
  import DoLolskinChoseSkin from '@/view/components/do-lolskin-chose-skin.vue';
  import FloatButtonGroup from '@/view/components/float-button-group.vue';
  import useGlobalState from '@/hooks/use-global-state';
  import bus from '@/utils/bus';
  const { heroId } = useGlobalState();
  const handleDrawOpen = () => {
    bus.emit('open-set');
  };
</script>

<style scoped lang="less">
  .skin-page {
    display: grid;
    grid-template-columns: 336px minmax(0, 1fr);
    gap: 14px;
    width: 100%;
    height: 100%;
    padding: 12px;
    background: #11161d;
  }

  .hero-panel,
  .skin-panel {
    min-width: 0;
    min-height: 0;
    border: 1px solid #27313b;
    background: #171e26;
  }

  .skin-panel {
    overflow: hidden;
  }

  .empty-panel {
    display: flex;
    height: 100%;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: #d8c99b;
  }

  .empty-title {
    font-size: 24px;
    font-weight: 700;
  }

  .empty-subtitle {
    margin-top: 8px;
    color: #82909d;
  }
</style>
