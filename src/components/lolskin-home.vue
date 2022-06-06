<template>
  <component :is="current" @click-hero="handlerClickHero" :hero-id="heroId" @back="back">
  </component>
</template>

<script setup lang="ts">
  import LolskinMain from './lolskin-main.vue';
  import { ref } from 'vue';
  import LolskinChoseSkin from './lolskin-chose-skin.vue';

  const current = ref();
  current.value = LolskinMain;
  const heroId = ref<string>('1');
  const handlerClickHero = (heroId_: string) => {
    current.value = LolskinChoseSkin;
    heroId.value = heroId_;
  };
  const back = () => {
    current.value = LolskinMain;
  };
</script>

<style scoped lang="less"></style>
