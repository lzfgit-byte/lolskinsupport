<template>
  <div class="searchInput">
    <input v-model="searchValue" />
  </div>
  <div style="padding-top: 38px; overflow-y: auto; height: calc(100vh - 38px)">
    <HeroCard
      v-for="item in mainIMg"
      :key="item.heroId"
      :hero-id="`${item.heroId}`"
      :instance_id="item.instance_id"
      :title="`${item.name}`"
      :alias="item.alias"
      @click-hero="handlerClickHero"
    ></HeroCard>
  </div>
</template>

<script setup lang="ts">
  import { onMounted, ref, watchEffect } from 'vue';
  import { useRouter } from 'vue-router';
  import HeroCard from './hero-card.vue';
  import http from '@/utils/http';
  import type { mainHeroInfo } from '@/type/type';
  import useGlobalState from '@/hooks/use-global-state';
  import bus from '@/utils/bus';
  import { f_setIdName } from '@/utils/business';

  const mainIMg = ref<mainHeroInfo[]>();
  let heros_: mainHeroInfo[] = [];
  const { heroId, autoChose, heros, heroAlias } = useGlobalState();
  let router = useRouter();
  http.axios
    .get('https://game.gtimg.cn/images/lol/act/img/js/heroList/hero_list.js')
    .then((res: any) => {
      mainIMg.value = res.hero;
      heros_ = res.hero;
      heros.value = res.hero;
      f_setIdName(res.hero);
    });
  const handlerClickHero = (heroId_: string, heroAlias_) => {
    heroId.value = heroId_;
    heroAlias.value = heroAlias_;
    router.push({ path: '/choseSkin' });
  };
  const searchValue = ref();
  watchEffect(() => {
    console.log(searchValue.value);
    mainIMg.value = heros_.filter((item) => item.keywords.indexOf(searchValue.value) > -1);
  });
  onMounted(() => {
    bus.off('champion-selected');
    bus.on('champion-selected', () => {
      router.push({ path: '/choseSkin' });
    });
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
      width: 100%;
      background-color: transparent;
      border: none;
      font-size: 16px;
      color: #ae9156;
      box-sizing: border-box;
      outline: unset;
    }
  }
</style>
