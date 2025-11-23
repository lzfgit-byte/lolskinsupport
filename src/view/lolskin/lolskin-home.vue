<template>
  <component :is="current" :hero-id="heroId" @click-hero="handlerClickHero" @back="back">
  </component>
</template>

<script setup lang="ts">
  import { ref } from 'vue';
  import LolskinMain from './lolskin-main.vue';
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
