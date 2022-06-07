<template>
  <div class="searchInput">
    <input v-model="searchValue" />
  </div>
  <div style="padding-top: 38px">
    <hero-card
      v-for="item in mainIMg"
      :hero-id="item.heroId"
      :title="item.name"
      @click-hero="handlerClickHero"
    ></hero-card>
  </div>
</template>

<script setup lang="ts">
  import http from '../utils/http';
  import { mainHeroInfo } from '../type/type';
  import { ref, watchEffect } from 'vue';
  import HeroCard from './hero-card.vue';
  const mainIMg = ref<mainHeroInfo[]>();
  let heros: mainHeroInfo[] = [];
  const emits = defineEmits(['clickHero']);
  http.axios
    .get('https://game.gtimg.cn/images/lol/act/img/js/heroList/hero_list.js')
    .then((res: any) => {
      mainIMg.value = res.hero;
      heros = res.hero;
    });
  const handlerClickHero = (heroId: string) => {
    emits('clickHero', heroId);
  };
  const searchValue = ref();
  watchEffect(() => {
    console.log(searchValue.value);
    mainIMg.value = heros.filter((item) => item.keywords.indexOf(searchValue.value) > -1);
  });
</script>

<style scoped lang="less">
  .searchInput {
    position: fixed;
    left: 10px;
    width: 100%;
    height: 38px;
    z-index: 3;
    border: 1px solid #313537;
    background-color: #191d24;
    box-sizing: border-box;
    -webkit-transition: border-color 0.3s;
    -moz-transition: border-color 0.3s;
    -o-transition: border-color 0.3s;
    transition: border-color 0.3s;
    input {
      height: 38px;
      background-color: transparent;
      border: none;
      font-size: 16px;
      color: #ae9156;
      box-sizing: border-box;
      outline: unset;
    }
  }
</style>
