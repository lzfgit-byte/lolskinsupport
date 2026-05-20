<template>
  <div class="searchInput">
    <input v-model="searchValue" placeholder="搜索英雄..." />
  </div>

  <!-- 调整了高度计算，为底部翻页留出 50px 的空间 -->
  <div style="padding-top: 38px; overflow-y: auto; height: calc(100vh - 88px)">
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

  <!-- 底部翻页控制区 -->
  <div class="pagination-bar">
    <button :disabled="currentPage === 1" @click="currentPage--">上一页</button>
    <span class="page-info">第 {{ currentPage }} / {{ totalPages || 1 }} 页</span>
    <button :disabled="currentPage >= totalPages" @click="currentPage++">下一页</button>
  </div>
</template>

<script setup lang="ts">
  import { computed, onMounted, ref, watchEffect } from 'vue';
  import { useRouter } from 'vue-router';
  import { nextTick } from 'vue-demi';
  import HeroCard from './hero-card.vue';
  import http from '@/utils/http';
  import type { mainHeroInfo } from '@/type/type';
  import useGlobalState from '@/hooks/use-global-state';
  import bus from '@/utils/bus';
  import { f_setIdName } from '@/utils/business';

  const mainIMg = ref<mainHeroInfo[]>([]);
  let heros_: mainHeroInfo[] = [];
  const { heroId, autoChose, heros, heroAlias, heroIdAliasMap, choseDrawerOpen } = useGlobalState();
  let router = useRouter();

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
    choseDrawerOpen.value = true;
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
    bus.on('champion-selected', () => {
      choseDrawerOpen.value = false;
      nextTick(() => {
        choseDrawerOpen.value = true;
      });
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
      padding: 0 10px;
    }
  }

  /* 新增底部翻页栏样式 */
  .pagination-bar {
    position: fixed;
    bottom: 0;
    left: 0;
    width: 100%;
    height: 50px;
    background-color: #191d24;
    border-top: 1px solid #313537;
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 3;

    button {
      background-color: #313537;
      color: #ae9156;
      border: 1px solid #4a4f52;
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
        background-color: #ae9156;
        color: #191d24;
      }
    }

    .page-info {
      color: #ae9156;
      margin: 0 20px;
      font-size: 14px;
    }
  }
</style>
