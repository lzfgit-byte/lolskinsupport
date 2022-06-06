<template>
  <hero-card
    v-for="item in mainIMg"
    :hero-id="item.heroId"
    :title="item.name"
    @click-hero="handlerClickHero"
  ></hero-card>
</template>

<script setup lang="ts">
  import http from '../utils/http';
  import { mainHeroInfo } from '../type/type';
  import { ref } from 'vue';
  import HeroCard from './hero-card.vue';
  const mainIMg = ref<mainHeroInfo[]>();
  const emits = defineEmits(['clickHero']);
  http.axios
    .get('https://game.gtimg.cn/images/lol/act/img/js/heroList/hero_list.js')
    .then((res: any) => {
      mainIMg.value = res.hero;
    });
  const handlerClickHero = (heroId: string) => {
    emits('clickHero', heroId);
  };
</script>

<style scoped lang="less"></style>
