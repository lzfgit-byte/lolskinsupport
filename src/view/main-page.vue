<template>
  <div class="skin-page">
    <button
      v-if="!heroId"
      class="mh-entry-btn"
      title="战绩查询"
      @click="router.push('/match-history')"
    >
      🏆 战绩查询
    </button>
    <main class="skin-panel">
      <DoLolskinChoseSkin v-if="heroId" :key="heroId"></DoLolskinChoseSkin>
      <div v-else class="empty-panel">
        <div class="empty-title">选择一个英雄</div>
        <div class="empty-subtitle">皮肤列表和预览会显示在这里</div>
      </div>
    </main>

    <!-- 悬浮搜索窗 -->
    <div class="floating-search-window">
      <div class="search-body">
        <div class="search-input-wrapper">
          <input v-model="searchValue" placeholder="输入英雄名字..." class="search-input" />
          <button v-if="searchValue" class="clear-btn" title="清空" @click="searchValue = ''">
            ✕
          </button>
        </div>
      </div>
    </div>

    <!-- 悬浮英雄列表窗 -->
    <aside v-if="searchValue" class="hero-panel-floating">
      <div class="panel-header">
        <span class="panel-title">搜索结果 ({{ mainIMg.length }})</span>
      </div>
      <div class="panel-content">
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
    </aside>
  </div>
  <FloatButtonGroup :handle-draw-open="handleDrawOpen"></FloatButtonGroup>

  <!-- 启动英雄联盟（游戏已启动时隐藏） -->
  <div v-if="!gameRunning && !heroId" class="launch-game-bar">
    <button class="launch-game-btn" :disabled="launching" @click="handleLaunchGame">
      <span class="launch-icon">▶</span>
      <span>{{ launching ? '启动中...' : '英雄联盟，启动！' }}</span>
    </button>
  </div>

  <!-- 多游戏路径选择 -->
  <a-modal
    v-model:open="clientModalOpen"
    title="选择游戏启动路径"
    ok-text="启动"
    cancel-text="取消"
    :confirm-loading="launching"
    @ok="confirmClientChoose"
  >
    <a-radio-group
      v-model:value="selectedClient"
      style="display: flex; flex-direction: column; gap: 8px"
    >
      <a-radio v-for="c in clientCandidates" :key="c" :value="c">{{ c }}</a-radio>
    </a-radio-group>
  </a-modal>
</template>
<script setup lang="ts">
  import { computed, onMounted, onUnmounted, ref, watchEffect } from 'vue';
  import { message } from 'ant-design-vue';
  import { useRouter } from 'vue-router';
  import HeroCard from '@/view/lolskin/hero-card.vue';
  import DoLolskinChoseSkin from '@/view/components/do-lolskin-chose-skin.vue';
  import FloatButtonGroup from '@/view/components/float-button-group.vue';
  import useGlobalState from '@/hooks/use-global-state';
  import bus from '@/utils/bus';
  import http from '@/utils/http';
  import type { mainHeroInfo } from '@/type/type';
  import {
    f_isGameRunning,
    f_launchLeagueOfLegends,
    f_launchLeagueOfLegendsAt,
    f_setIdName,
  } from '@/utils/business';

  const { heroId, heros, heroAlias, heroIdAliasMap } = useGlobalState();
  const router = useRouter();

  // ===================== 启动英雄联盟 =====================
  const launching = ref(false);
  const gameRunning = ref(false);
  const clientModalOpen = ref(false);
  const clientCandidates = ref<string[]>([]);
  const selectedClient = ref('');
  let gameCheckTimer: number | null = null;

  // 定时检测游戏是否已启动，已启动则隐藏“英雄联盟，启动！”按钮
  const checkGameRunning = async () => {
    try {
      gameRunning.value = !!(await f_isGameRunning());
    } catch {
      // 检测失败时保持现状
    }
  };

  const handleLaunchGame = async () => {
    if (launching.value) {
      return;
    }
    launching.value = true;
    try {
      const res = await f_launchLeagueOfLegends();
      if (!res?.ok) {
        if (res?.candidates && res.candidates.length > 1) {
          clientCandidates.value = res.candidates;
          selectedClient.value = res.candidates[0];
          clientModalOpen.value = true;
        } else if (res?.msg) {
          message.warning(res.msg);
        }
        return;
      }
      if (res.candidates?.length === 1) {
        await f_launchLeagueOfLegendsAt(res.candidates[0]);
      }
    } catch (e) {
      message.error(`启动失败: ${e}`);
    } finally {
      launching.value = false;
    }
  };

  const confirmClientChoose = async () => {
    if (!selectedClient.value) {
      return;
    }
    clientModalOpen.value = false;
    launching.value = true;
    try {
      await f_launchLeagueOfLegendsAt(selectedClient.value);
    } catch (e) {
      message.error(`启动失败: ${e}`);
    } finally {
      launching.value = false;
    }
  };

  // 英雄列表数据
  const mainIMg = ref<mainHeroInfo[]>([]);
  let heros_: mainHeroInfo[] = [];
  const currentPage = ref(1);
  const pageSize = 50;

  const totalPages = computed(() => {
    return Math.ceil(mainIMg.value.length / pageSize);
  });

  const pagedImg = computed(() => {
    const start = (currentPage.value - 1) * pageSize;
    const end = start + pageSize;
    return mainIMg.value.slice(start, end);
  });

  // 获取英雄数据
  http.axios
    .get('https://game.gtimg.cn/images/lol/act/img/js/heroList/hero_list.js')
    .then((res: any) => {
      heros_ = res.hero || [];
      mainIMg.value = res.hero || [];
      heros.value = res.hero || [];
      f_setIdName(res.hero);
      res.hero?.forEach((item) => {
        heroIdAliasMap[item.heroId] = item.alias;
      });
    });

  const handlerClickHero = (heroId_: string, heroAlias_: string) => {
    heroId.value = heroId_;
    heroAlias.value = heroAlias_;
    // 清除搜索框
    searchValue.value = '';
  };

  const searchValue = ref('');

  watchEffect(() => {
    if (!searchValue.value) {
      mainIMg.value = [];
      currentPage.value = 1;
      return;
    }
    const filtered = heros_.filter((item) => {
      if (!searchValue.value) return true;
      const searchLower = searchValue.value.toLowerCase();
      // 搜索名字、别名、关键词
      return (
        item.name.toLowerCase().includes(searchLower) ||
        item.alias.toLowerCase().includes(searchLower) ||
        (item.keywords && item.keywords.includes(searchValue.value))
      );
    });
    mainIMg.value = filtered;
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
    // 启动时检测一次游戏是否已运行
    checkGameRunning();
    // 每 3 秒检测一次，游戏启动后隐藏“英雄联盟，启动！”按钮
    gameCheckTimer = window.setInterval(checkGameRunning, 3000);
  });

  onUnmounted(() => {
    if (gameCheckTimer !== null) {
      window.clearInterval(gameCheckTimer);
      gameCheckTimer = null;
    }
  });

  const handleDrawOpen = () => {
    bus.emit('open-set');
  };
</script>

<style scoped lang="less">
  .skin-page {
    position: relative;
    width: 100%;
    height: 100%;
    background: #11161d;
    overflow: hidden;
  }

  .skin-panel {
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    border: 1px solid #27313b;
    background: #171e26;
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

  /* 悬浮搜索窗 */
  .floating-search-window {
    position: fixed;
    top: 0;
    left: 50%;
    transform: translateX(-50%);
    width: 400px;
    background: #0f141b;
    border: 1px solid #27313b;
    border-radius: 0 0 8px 8px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
    z-index: 1000;
    backdrop-filter: blur(10px);
    transition: all 0.3s ease;
  }

  .search-title {
    font-size: 13px;
    font-weight: 600;
    color: #b8a67b;
  }

  .search-body {
    padding: 12px 16px;
    border-radius: 0 0 8px 8px;
  }

  .search-input-wrapper {
    position: relative;
    display: flex;
    align-items: center;
  }

  .search-input {
    width: 100%;
    height: 32px;
    background-color: #0c1117;
    border: 1px solid #2d3a45;
    border-radius: 4px;
    font-size: 12px;
    color: #f1e5bf;
    padding: 0 10px;
    padding-right: 30px;
    outline: none;
    box-sizing: border-box;
    transition: border-color 0.2s ease;

    &::placeholder {
      color: #546e7a;
    }

    &:focus {
      border-color: #6d9f43;
      box-shadow: 0 0 8px rgba(109, 159, 67, 0.3);
    }
  }

  .clear-btn {
    position: absolute;
    right: 8px;
    background: none;
    border: none;
    color: #82909d;
    cursor: pointer;
    font-size: 14px;
    padding: 4px 6px;
    transition: color 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;

    &:hover {
      color: #6d9f43;
    }
  }

  /* 悬浮英雄列表窗 */
  .hero-panel-floating {
    position: fixed;
    top: 74px;
    left: 50%;
    transform: translateX(-50%);
    width: 400px;
    max-height: calc(100vh - 100px);
    background: #0f141b;
    border: 1px solid #27313b;
    border-radius: 0 0 12px 12px;
    box-shadow: 0 12px 48px rgba(0, 0, 0, 0.5);
    z-index: 999;
    backdrop-filter: blur(10px);
    display: flex;
    flex-direction: column;
    animation: slideDown 0.3s ease;
    overflow: hidden;
  }

  @keyframes slideDown {
    from {
      opacity: 0;
      transform: translateX(-50%) translateY(-10px);
    }
    to {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 14px 16px;
    border-bottom: 1px solid #27313b;
    background: #121820;
    border-radius: 0;
    flex-shrink: 0;
  }

  .panel-title {
    font-size: 14px;
    font-weight: 600;
    color: #b8a67b;
  }

  .panel-content {
    display: flex;
    flex-direction: column;
    min-height: 0;
    flex: 1;
    overflow: hidden;
  }

  .hero-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 6px;
    padding: 8px;
    overflow-y: auto;
    flex: 1;
    min-height: 0;
  }

  .hero-grid::-webkit-scrollbar {
    width: 6px;
  }

  .hero-grid::-webkit-scrollbar-track {
    background: #0c1117;
    border-radius: 3px;
  }

  .hero-grid::-webkit-scrollbar-thumb {
    background: #27313b;
    border-radius: 3px;

    &:hover {
      background: #3a4550;
    }
  }

  .pagination-bar {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 8px;
    padding: 10px 8px;
    border-top: 1px solid #27313b;
    background: #121820;
    border-radius: 0 0 12px 12px;
    flex-shrink: 0;

    button {
      background: #1a2332;
      border: 1px solid #27313b;
      color: #b8a67b;
      cursor: pointer;
      padding: 6px 12px;
      border-radius: 4px;
      font-size: 12px;
      transition: all 0.2s ease;

      &:hover:not(:disabled) {
        background: #27313b;
        border-color: #6d9f43;
        color: #6d9f43;
      }

      &:disabled {
        color: #546e7a;
        cursor: not-allowed;
      }
    }

    .page-info {
      font-size: 12px;
      color: #82909d;
      min-width: 80px;
      text-align: center;
    }
  }

  /* 启动英雄联盟 */
  .launch-game-bar {
    position: fixed;
    bottom: 28px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 998;
  }

  .launch-game-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 34px;
    font-size: 16px;
    font-weight: 700;
    color: #010a13;
    background: linear-gradient(135deg, #c8aa6e 0%, #f0e6d2 50%, #c8aa6e 100%);
    border: 1px solid #927934;
    border-radius: 8px;
    cursor: pointer;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
    transition: all 0.25s ease;

    &:hover:not(:disabled) {
      transform: translateY(-2px);
      box-shadow: 0 12px 32px rgba(200, 170, 110, 0.35);
    }

    &:active:not(:disabled) {
      transform: translateY(0);
    }

    &:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
  }

  .launch-icon {
    display: inline-flex;
    font-size: 14px;
  }

  /* 战绩查询入口 */
  .mh-entry-btn {
    position: fixed;
    top: 14px;
    right: 16px;
    z-index: 1001;
    padding: 8px 16px;
    font-size: 13px;
    font-weight: 600;
    color: #d8c99b;
    background: #1a2332;
    border: 1px solid #27313b;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s ease;

    &:hover {
      background: #27313b;
      border-color: #6d9f43;
      color: #6d9f43;
    }
  }
</style>
