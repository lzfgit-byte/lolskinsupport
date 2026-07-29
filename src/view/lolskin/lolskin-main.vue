<template>
  <div class="hero-browser">
    <div class="searchInput">
      <input v-model="searchValue" placeholder="搜索英雄..." />
    </div>

    <div class="hero-grid">
      <HeroCard
        v-for="item in pagedImg"
        :key="item.heroId"
        :hero-id="`${item.heroId}`"
        :instance_id="item.instance_id"
        :title="`${item.name}`"
        :alias="item.alias"
        @click-hero="handlerClickHero"
      ></HeroCard>
    </div>

    <div class="pagination-bar">
      <button :disabled="currentPage === 1" @click="currentPage--">上一页</button>
      <span class="page-info">第 {{ currentPage }} / {{ totalPages || 1 }} 页</span>
      <button :disabled="currentPage >= totalPages" @click="currentPage++">下一页</button>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed, onMounted, ref, watchEffect } from 'vue';
  import HeroCard from './hero-card.vue';
  import http from '@/utils/http';
  import type { mainHeroInfo } from '@/type/type';
  import useGlobalState from '@/hooks/use-global-state';
  import bus from '@/utils/bus';
  import { f_setIdName } from '@/utils/business';

  const mainIMg = ref<mainHeroInfo[]>([]);
  let heros_: mainHeroInfo[] = [];
  const { heroId, heros, heroAlias, heroIdAliasMap } = useGlobalState();

  // 分页相关变量
  const currentPage = ref(1);
  const pageSize = 50;

  // 根据过滤后的 mainIMg 计算总页数
  const totalPages = computed(() => {
    return Math.ceil(mainIMg.value.length / pageSize);
  });

  // 动态截取当前页需要显示的 50 条数据
  const pagedImg = computed(() => {
    const start = (currentPage.value - 1) * pageSize;
    const end = start + pageSize;
    return mainIMg.value.slice(start, end);
  });

  http.axios
    .get('https://game.gtimg.cn/images/lol/act/img/js/heroList/hero_list.js')
    .then((res: any) => {
      mainIMg.value = res.hero || [];
      heros_ = res.hero || [];
      heros.value = res.hero || [];
      f_setIdName(res.hero);
      res.hero?.forEach((item) => {
        heroIdAliasMap[item.heroId] = item.alias;
      });
    });

  const handlerClickHero = (heroId_: string, heroAlias_) => {
    heroId.value = heroId_;
    heroAlias.value = heroAlias_;
  };

  const searchValue = ref('');

  watchEffect(() => {
    console.log(searchValue.value);
    // 过滤出符合搜索条件的数据
    const filtered = heros_.filter((item) => {
      if (!searchValue.value) return true;
      return item.keywords.indexOf(searchValue.value) > -1;
    });

    mainIMg.value = filtered;
    // 每次搜索关键词改变时，重置回第一页
    currentPage.value = 1;
  });

  onMounted(() => {
    bus.off('champion-selected');
    bus.on('champion-selected', (championId: string) => {
      currentPage.value = Math.max(
        1,
        Math.ceil(
          (mainIMg.value.findIndex((item) => `${item.heroId}` === championId) + 1) / pageSize
        )
      );
    });
  });
</script>

<style scoped lang="less">
  .hero-browser {
    display: grid;
    grid-template-rows: 46px minmax(0, 1fr) 48px;
    height: 100%;
    min-height: 0;
    background: #141b22;
  }

  .searchInput {
    display: flex;
    align-items: center;
    width: 100%;
    height: 46px;
    border-bottom: 1px solid #27313b;
    background-color: #121820;
    box-sizing: border-box;
    padding: 8px;

    input {
      height: 30px;
      width: 100%;
      background-color: #0f141b;
      border: 1px solid #2d3a45;
      font-size: 14px;
      color: #f1e5bf;
      box-sizing: border-box;
      outline: unset;
      padding: 0 12px;

      &:focus {
        border-color: #6d9f43;
      }
    }
  }

  .hero-grid {
    min-height: 0;
    overflow-y: auto;
    padding: 8px;
  }

  .hero-grid::-webkit-scrollbar {
    width: 8px;
  }

  .hero-grid::-webkit-scrollbar-track {
    background: #0c1117;
  }

  .hero-grid::-webkit-scrollbar-thumb {
    border: 2px solid #0c1117;
    background: #43505c;
  }

  .hero-grid::-webkit-scrollbar-thumb:hover {
    background: #657380;
  }

  .pagination-bar {
    width: 100%;
    height: 48px;
    background-color: #121820;
    border-top: 1px solid #27313b;
    display: flex;
    justify-content: center;
    align-items: center;

    button {
      background-color: #1c2530;
      color: #d8c99b;
      border: 1px solid #344452;
      padding: 6px 14px;
      cursor: pointer;
      font-size: 14px;
      transition: all 0.2s;

      &:disabled {
        color: #555;
        background-color: #1c1f22;
        border-color: #26292b;
        cursor: not-allowed;
      }

      &:not(:disabled):hover {
        background-color: #d8c99b;
        color: #191d24;
      }
    }

    .page-info {
      color: #d8c99b;
      margin: 0 14px;
      font-size: 14px;
    }
  }
</style>
