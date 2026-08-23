<template>
  <div class="mh-page">
    <!-- 未连接提示 -->
    <a-alert
      v-if="!lcuConnected"
      type="warning"
      show-icon
      message="尚未连接到英雄联盟客户端"
      description="请先启动并登录英雄联盟客户端，连接后即可查询战绩。"
      style="margin: 16px 0"
    />

    <!-- 加载中 -->
    <div v-if="loading" class="mh-loading">
      <a-spin tip="加载战绩中..."></a-spin>
    </div>

    <template v-if="summoner && !loading">
      <!-- 召唤师卡片 + 汇总面板 -->
      <div class="mh-summary">
        <div class="player-card">
          <a-button class="back-btn" @click="goBack">← 返回</a-button>
          <img
            class="player-icon"
            :src="profileIconSrc || getProfileIcon(summoner.profileIconId)"
            loading="lazy"
          />
          <div class="player-info">
            <div class="player-name">{{ summoner.displayName || summoner.gameName || summoner.internalName }}</div>
            <div class="player-meta">{{ riotIdText }}</div>
            <div class="player-meta">等级 {{ summoner.summonerLevel }} · ID {{ summoner.summonerId }}</div>
          </div>
        </div>

        <div v-if="analysis" class="summary-stats">
          <div class="stat-block">
            <div class="stat-label">Akari 评分</div>
            <div class="stat-value akari" :class="{ good: analysis.akariScore.total >= 6.5 }">
              {{ toFixed(analysis.akariScore.total, 2) }}
            </div>
          </div>
          <div class="stat-block">
            <div class="stat-label">场次</div>
            <div class="stat-value">{{ analysis.count }}</div>
          </div>
          <div class="stat-block">
            <div class="stat-label">胜率</div>
            <div class="stat-value">{{ toFixed(analysis.summary.winRate * 100) }}%</div>
          </div>
          <div class="stat-block">
            <div class="stat-label">场均 KDA</div>
            <div class="stat-value">{{ toFixed(analysis.summary.avgKda) }}</div>
          </div>
          <div class="stat-block">
            <div class="stat-label">总击杀/死亡/助攻</div>
            <div class="stat-value">
              {{ analysis.summary.kills }} / {{ analysis.summary.deaths }} /
              {{ analysis.summary.assists }}
            </div>
          </div>
          <div class="stat-block">
            <div class="stat-label">分均补刀</div>
            <div class="stat-value">{{ toFixed(analysis.summary.avgCsPerMinute) }}</div>
          </div>
          <div class="stat-block">
            <div class="stat-label">平均伤害占比</div>
            <div class="stat-value">{{ toFixed(analysis.summary.avgChampionDamagePercentageOfTeam * 100) }}%</div>
          </div>
          <div class="stat-block">
            <div class="stat-label">平均承伤占比</div>
            <div class="stat-value">{{ toFixed(analysis.summary.avgDamageTakenPercentageOfTeam * 100) }}%</div>
          </div>
          <div class="stat-block">
            <div class="stat-label">平均经济占比</div>
            <div class="stat-value">{{ toFixed(analysis.summary.avgGoldPercentageOfTeam * 100) }}%</div>
          </div>
          <div class="stat-block">
            <div class="stat-label">平均视野</div>
            <div class="stat-value">{{ toFixed(analysis.summary.avgVisionScore) }}</div>
          </div>
          <div class="stat-block">
            <div class="stat-label">平均参团率</div>
            <div class="stat-value">{{ toFixed(analysis.summary.avgKillParticipation * 100) }}%</div>
          </div>
        </div>
        <div v-else class="summary-empty">
          {{
            games.length
              ? '正在加载对局详情，用于计算团队占比…'
              : '暂无有效的匹配对局数据（已过滤人机/训练/重开等）'
          }}
        </div>
      </div>

      <!-- 筛选栏 -->
      <div class="mh-toolbar">
        <span class="toolbar-label">筛选：</span>
        <a-select v-model:value="winFilter" style="width: 110px" size="small">
          <a-select-option value="all">全部结果</a-select-option>
          <a-select-option value="win">仅胜利</a-select-option>
          <a-select-option value="loss">仅失败</a-select-option>
        </a-select>
        <a-select v-model:value="queueFilter" style="width: 180px" size="small">
          <a-select-option :value="'all'">全部模式</a-select-option>
          <a-select-option v-for="q in queueOptions" :key="q.value" :value="q.value">
            {{ q.label }}
          </a-select-option>
        </a-select>
        <span class="toolbar-count">当前页 {{ filteredGames.length }} 局 / 总计 {{ totalCount }} 局</span>
      </div>

      <!-- 战绩列表 -->
      <div v-if="filteredGames.length" class="mh-list">
        <MatchHistoryItem
          v-for="game in filteredGames"
          :key="game.gameId"
          :game="game"
          :detail="detailsMap[game.gameId] || null"
          :puuid="summoner.puuid"
          :champion-map="championMap"
          @open-detail="openDetail"
        />
      </div>
      <a-empty v-else description="没有符合条件的对局" class="mh-empty" />

      <!-- 分页 -->
      <div class="mh-pagination">
        <a-select v-model:value="pageSize" style="width: 90px" size="small" @change="onPageSizeChange">
          <a-select-option :value="20">20/页</a-select-option>
          <a-select-option :value="40">40/页</a-select-option>
          <a-select-option :value="60">60/页</a-select-option>
          <a-select-option :value="80">80/页</a-select-option>
        </a-select>
        <a-button size="small" :disabled="page <= 0" @click="prevPage">上一页</a-button>
        <span class="page-info">第 {{ page + 1 }} / {{ totalPages || 1 }} 页</span>
        <a-button size="small" :disabled="page >= totalPages - 1" @click="nextPage">下一页</a-button>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
  import { computed, onMounted, ref, watch } from 'vue';
  import { message } from 'ant-design-vue';
  import router from '@/router/router';
  import useGlobalState from '@/hooks/use-global-state';
  import { analyzeGames } from '@/utils/match-history/analysis';
  import { toBasicInfo, toParticipants } from '@/utils/match-history/adapter';
  import { toFixed } from '@/utils/match-history/format';
  import {
    loadChampionMap,
    getProfileIcon,
    getProfileIconSrc,
    type ChampionMeta
  } from '@/utils/match-history/images';
  import {
    mhGetCurrentSummoner,
    mhGetMatchHistory,
    mhGetGameDetails
  } from '@/utils/match-history/ipc';
  import { getQueueName, loadQueueNames } from '@/utils/match-history/queue-names';
  import type { Game, SummonerInfo } from '@/utils/match-history/types';
  import MatchHistoryItem from './components/match-history-item.vue';

  const { lcuState } = useGlobalState();

  const goBack = () => {
    // hash 路由兜底：直接改 hash 一定会触发路由跳转，避免任何异常导致返回失效
    try {
      window.location.hash = '#/';
    } catch {
      router.push('/').catch(() => {
        // 忽略导航失败
      });
    }
  };

  const profileIconSrc = ref('');

  const lcuConnected = computed(() => lcuState.value);
  const championMap = ref<Map<number, ChampionMeta>>(new Map());

  /** 玩家 Riot ID（gameName#tagLine），用于头像卡片展示 */
  const riotIdText = computed(() => {
    const s = summoner.value;
    if (!s) {
      return '';
    }
    if (s.gameName && s.tagLine) {
      return `${s.gameName}#${s.tagLine}`;
    }
    return s.displayName || s.gameName || '';
  });

  const loadingCurrent = ref(false);
  const summoner = ref<SummonerInfo | null>(null);

  /** LCU queues.json 队列名映射（用于筛选下拉等，含新队列的本地化名称） */
  const queueNameMap = ref<Map<number, string>>(new Map());

  // 账号头像：随 summoner 变化异步加载（优先 LCU 代理），immediate 立即求值一次
  watch(
    () => summoner.value?.profileIconId,
    async (iconId) => {
      if (!iconId) {
        profileIconSrc.value = '';
        return;
      }
      profileIconSrc.value = await getProfileIconSrc(iconId);
    },
    { immediate: true }
  );

  const games = ref<Game[]>([]);
  const totalCount = ref(0);
  const page = ref(0);
  const pageSize = ref(20);
  const loading = ref(false);

  /** 对局详情缓存（列表接口只含当前玩家，团队占比/参团率等需要详情里的全员数据） */
  const detailsMap = ref<Record<number, Game>>({});

  const winFilter = ref<'all' | 'win' | 'loss'>('all');
  const queueFilter = ref<number | 'all'>('all');

  const totalPages = computed(() => Math.ceil(totalCount.value / pageSize.value) || 1);

  const queueOptions = computed(() => {
    const ids = Array.from(
      new Set(games.value.map((g) => toBasicInfo(g).queueId).filter((id) => id !== undefined))
    );
    return ids.map((id) => ({ value: id, label: getQueueName(id, queueNameMap.value) }));
  });

  const findParticipant = (game: Game) => {
    if (!summoner.value) {
      return null;
    }
    return toParticipants(game, toBasicInfo(game)).find((p) => p.puuid === summoner.value?.puuid);
  };

  const filteredGames = computed(() => {
    let list = games.value;
    if (winFilter.value === 'win') {
      list = list.filter((g) => findParticipant(g)?.winResult === 'win');
    } else if (winFilter.value === 'loss') {
      list = list.filter((g) => findParticipant(g)?.winResult === 'loss');
    }
    if (queueFilter.value !== 'all') {
      list = list.filter((g) => toBasicInfo(g).queueId === queueFilter.value);
    }
    return list;
  });

  const analysis = computed(() => {
    if (!summoner.value) {
      return null;
    }
    // 团队相关指标（伤害/承伤/经济占比、参团率、Akari 评分）需要含全员的详情数据，
    // 因此只用已加载详情的对局聚合；详情会在后台陆续加载，聚合随之更新
    const detailedGames = games.value
      .map((g) => detailsMap.value[g.gameId])
      .filter((d): d is Game => Boolean(d));
    if (!detailedGames.length) {
      return null;
    }
    return analyzeGames(detailedGames, summoner.value.puuid);
  });

  const loadMatchHistory = async () => {
    if (!summoner.value) {
      return;
    }
    loading.value = true;
    try {
      const begIndex = page.value * pageSize.value;
      const res = await mhGetMatchHistory(summoner.value.puuid, begIndex, begIndex + pageSize.value);
      games.value = res?.games?.games || [];
      totalCount.value = res?.games?.gameCount || 0;
      winFilter.value = 'all';
      queueFilter.value = 'all';
      loadDetailsForGames(games.value);
    } catch (e: any) {
      message.error(`加载战绩失败：${e?.message || e}`);
    } finally {
      loading.value = false;
    }
  };

  /** 后台加载当前页各局详情（含全员选手数据），用于团队占比/参团率/标签等计算 */
  const loadDetailsForGames = (games: Game[]) => {
    for (const g of games) {
      if (detailsMap.value[g.gameId]) {
        continue;
      }
      mhGetGameDetails(g.gameId)
        .then((detail) => {
          if (detail) {
            detailsMap.value = { ...detailsMap.value, [g.gameId]: detail };
          }
        })
        .catch(() => {
          // 详情加载失败时忽略，条目会退回到列表数据
        });
    }
  };

  const handleCurrentSummoner = async () => {
    loadingCurrent.value = true;
    try {
      const s = await mhGetCurrentSummoner();
      summoner.value = s;
      page.value = 0;
      await loadMatchHistory();
    } catch (e: any) {
      message.error(`获取当前账号失败：${e?.message || e}`);
    } finally {
      loadingCurrent.value = false;
    }
  };

  const prevPage = () => {
    if (page.value <= 0) {
      return;
    }
    page.value -= 1;
    loadMatchHistory();
  };

  const nextPage = () => {
    if (page.value >= totalPages.value - 1) {
      return;
    }
    page.value += 1;
    loadMatchHistory();
  };

  const onPageSizeChange = () => {
    page.value = 0;
    loadMatchHistory();
  };

  onMounted(async () => {
    const [cm, qm] = await Promise.all([loadChampionMap(), loadQueueNames()]);
    championMap.value = cm;
    queueNameMap.value = qm;
  });

  watch(
    lcuConnected,
    (connected) => {
      if (connected && !summoner.value) {
        handleCurrentSummoner();
      }
    },
    { immediate: true }
  );
</script>

<style scoped lang="less">
  .mh-page {
    height: 100%;
    padding: 16px 24px;
    box-sizing: border-box;
    overflow-y: auto;
  }

  .mh-header {
    display: flex;
    align-items: center;
    gap: 14px;

    .mh-title {
      font-size: 18px;
      font-weight: 700;
      color: #e5e7eb;
      margin-right: 8px;
    }

    .search-box {
      display: flex;
      align-items: center;
      gap: 8px;
    }
  }

  .mh-loading {
    display: flex;
    justify-content: center;
    padding: 80px 0;
  }

  .back-btn {
    flex-shrink: 0;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.16);
    color: #cbd5e1;

    &:hover {
      background: rgba(255, 255, 255, 0.12);
      color: #ffffff;
      border-color: rgba(255, 255, 255, 0.28);
    }
  }

  .mh-summary {
    display: flex;
    gap: 20px;
    margin: 16px 0;
    padding: 16px;
    background: #1f2430;
    border-radius: 10px;
    align-items: flex-start;

    .player-card {
      display: flex;
      gap: 12px;
      align-items: center;
      min-width: 220px;

      .player-icon {
        width: 56px;
        height: 56px;
        border-radius: 10px;
        object-fit: cover;
        background: #2d3342;
      }
      .player-info {
        .player-name {
          color: #f3f4f6;
          font-size: 16px;
          font-weight: 700;
        }
        .player-meta {
          color: #8b93a5;
          font-size: 12px;
          margin-top: 4px;
        }
      }
    }

    .summary-stats {
      display: flex;
      gap: 24px;
      flex-wrap: wrap;
      flex: 1;

      .stat-block {
        display: flex;
        flex-direction: column;
        gap: 4px;

        .stat-label {
          color: #8b93a5;
          font-size: 12px;
        }
        .stat-value {
          color: #e5e7eb;
          font-size: 16px;
          font-weight: 700;

          &.akari.good {
            color: #48bb78;
          }
        }
      }
    }

    .summary-empty {
      color: #8b93a5;
      font-size: 13px;
      align-self: center;
    }
  }

  .mh-toolbar {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 12px 0;

    .toolbar-label {
      color: #8b93a5;
      font-size: 13px;
    }
    .toolbar-count {
      color: #8b93a5;
      font-size: 12px;
      margin-left: auto;
    }
  }

  .mh-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .mh-empty {
    margin: 40px 0;
  }

  .mh-pagination {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 10px;
    margin: 16px 0;

    .page-info {
      color: #cbd5e0;
      font-size: 13px;
    }
  }
</style>
