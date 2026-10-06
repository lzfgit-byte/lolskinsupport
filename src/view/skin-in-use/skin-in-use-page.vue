<template>
  <div class="siu-page">
    <!-- 顶栏 -->
    <header class="siu-header">
      <div class="siu-header-left">
        <button class="back-btn" @click="goBack">← 返回</button>
        <div class="siu-title-wrap">
          <span class="siu-title">已使用的皮肤</span>
          <span class="siu-count">共 {{ skins.length }} 个</span>
        </div>
      </div>
      <div class="siu-header-actions">
        <a-button size="small" @click="loadUsedSkins">刷新</a-button>
        <a-button size="small" type="primary" @click="handleLoadAllSkins">加载所有皮肤</a-button>
        <a-button size="small" @click="openOverlayDir">打开 overlay 目录</a-button>
        <a-button size="small" danger @click="clearAllSkinCache">清理皮肤缓存</a-button>
      </div>
    </header>

    <!-- 加载中 -->
    <div v-if="loading" class="siu-loading">
      <a-spin tip="加载已使用的皮肤..."></a-spin>
    </div>

    <!-- 皮肤卡片列表 -->
    <div v-else-if="skins.length" class="siu-grid">
      <div v-for="item in skins" :key="`${item.heroId}_${item.skinId}`" class="siu-card">
        <div class="siu-card-img">
          <img v-if="item.src" :src="item.src" loading="lazy" :alt="item.skinName" />
          <div v-else class="siu-no-img">暂无预览</div>
        </div>
        <div class="siu-card-info">
          <div class="siu-hero" :title="item.heroName">{{ item.heroName }}</div>
          <div class="siu-skin" :title="item.skinName">{{ item.skinName }}</div>
          <div class="siu-id">ID: {{ item.heroId }}_{{ item.skinId }}</div>
        </div>
        <div class="siu-card-actions">
          <a-button size="small" @click="openSkinDir(item)">打开目录</a-button>
          <a-button size="small" danger @click="removeSkin(item)">移除</a-button>
        </div>
      </div>
    </div>

    <a-empty v-else description="暂无已使用的皮肤" class="siu-empty" />
  </div>
</template>

<script setup lang="ts">
  import { onMounted, ref } from 'vue';
  import { message } from 'ant-design-vue';
  import http from '@/utils/http';
  import useGlobalState from '@/hooks/use-global-state';
  import {
    f_clearSkinImage,
    f_emptyPah,
    f_getAllLoadSkins,
    f_getOverlayPath,
    f_getSkinImage,
    f_loadSkins,
    f_openPath,
    f_removePath,
  } from '@/utils/business';

  interface UsedSkin {
    heroId: string;
    skinId: string;
    /** 应用时缓存的皮肤主图 */
    src: string;
    heroName: string;
    skinName: string;
  }

  const { heros, installedPath, overlayPath: overlayPathState } = useGlobalState();

  const loading = ref(false);
  const skins = ref<UsedSkin[]>([]);
  const overlayPath = ref('');
  /** heroId -> 英雄信息 */
  const heroInfoMap = ref<Record<string, { name: string; alias: string }>>({});
  /** skinId -> 皮肤名 */
  const skinNameMap = ref<Record<string, string>>({});
  /** 已拉取过皮肤列表的英雄，避免重复请求 */
  const loadedHeroIds = new Set<string>();

  const goBack = () => {
    // hash 路由兜底：直接改 hash 一定触发跳转
    try {
      window.location.hash = '#/';
    } catch {
      // 忽略
    }
  };

  /** 英雄信息：优先用首页已加载的全局数据，否则回源英雄列表 */
  const ensureHeroInfo = async () => {
    if (heros.value?.length) {
      heros.value.forEach((h) => {
        const id = `${h.heroId}`;
        heroInfoMap.value[id] = { name: h.name || h.alias || '', alias: h.alias || '' };
      });
      return;
    }
    try {
      const res: any = await http.axios.get(
        'https://game.gtimg.cn/images/lol/act/img/js/heroList/hero_list.js'
      );
      (res.hero || []).forEach((h: any) => {
        const id = `${h.heroId}`;
        heroInfoMap.value[id] = { name: h.name || h.alias || '', alias: h.alias || '' };
      });
    } catch {
      // 网络失败时退化为显示 ID
    }
  };

  /** 拉取英雄的皮肤列表，得到 skinId -> 皮肤名 映射 */
  const ensureSkinNames = async (heroIds: string[]) => {
    await Promise.all(
      heroIds
        .filter((id) => id && !loadedHeroIds.has(id))
        .map(async (heroId) => {
          loadedHeroIds.add(heroId);
          try {
            const res: any = await http.axios.get(
              `https://game.gtimg.cn/images/lol/act/img/js/hero/${heroId}.js`
            );
            (res.skins || []).forEach((s: any) => {
              if (s?.skinId) {
                skinNameMap.value[`${s.skinId}`] = s.name || '';
              }
            });
          } catch {
            // 忽略单个英雄的失败
          }
        })
    );
  };

  const loadUsedSkins = async () => {
    loading.value = true;
    try {
      let pairs: any[] = [];
      try {
        pairs = (await f_getAllLoadSkins()) || [];
      } catch {
        pairs = [];
      }
      overlayPath.value = await f_getOverlayPath();
      overlayPathState.value = overlayPath.value;

      await ensureHeroInfo();
      await ensureSkinNames(Array.from(new Set(pairs.map((p) => `${p?.[0] ?? ''}`))));

      skins.value = await Promise.all(
        pairs.map(async (pair) => {
          const heroId = `${pair?.[0] ?? ''}`;
          const skinId = `${pair?.[1] ?? ''}`;
          const src = await f_getSkinImage(skinId).catch(() => '');
          const hero = heroInfoMap.value[heroId];
          return {
            heroId,
            skinId,
            src: src || '',
            heroName: hero?.name || hero?.alias || `英雄 ${heroId}`,
            skinName: skinNameMap.value[skinId] || `皮肤 ${skinId}`,
          } as UsedSkin;
        })
      );
    } finally {
      loading.value = false;
    }
  };

  const openOverlayDir = () => {
    if (overlayPath.value) {
      f_openPath(overlayPath.value);
    }
  };

  const openSkinDir = (item: UsedSkin) => {
    if (overlayPath.value) {
      f_openPath(`${overlayPath.value}\\${item.heroId}_${item.skinId}`);
    }
  };

  const handleLoadAllSkins = async () => {
    try {
      await f_loadSkins();
      message.success('已加载所有皮肤');
    } catch (e) {
      message.error(`加载失败: ${e}`);
    }
  };

  const removeSkin = async (item: UsedSkin) => {
    try {
      await f_removePath(`${installedPath.value}\\${item.heroId}_${item.skinId}`, true);
      await f_removePath(`${overlayPath.value}\\${item.heroId}_${item.skinId}`, true);
      await f_clearSkinImage(item.skinId);
      message.success(`已移除 ${item.skinName}`);
      await loadUsedSkins();
    } catch (e) {
      message.error(`移除失败: ${e}`);
    }
  };

  /** 清理皮肤缓存：清空 installed 与 overlay 目录，并重置皮肤图片缓存 */
  const clearAllSkinCache = async () => {
    try {
      await f_emptyPah(installedPath.value, true);
      await f_emptyPah(overlayPath.value, true);
      await f_clearSkinImage();
      message.success('皮肤缓存已清理');
      await loadUsedSkins();
    } catch (e) {
      message.error(`清理失败: ${e}`);
    }
  };

  onMounted(() => {
    loadUsedSkins();
  });
</script>

<style scoped lang="less">
  .siu-page {
    width: 100%;
    height: 100%;
    padding: 16px;
    overflow-y: auto;
    background: #11161d;
    box-sizing: border-box;
  }

  .siu-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    margin-bottom: 16px;
    background: #171e26;
    border: 1px solid #27313b;
    border-radius: 8px;
  }

  .siu-header-left {
    display: flex;
    align-items: center;
    gap: 14px;
    min-width: 0;
  }

  .back-btn {
    padding: 6px 14px;
    font-size: 13px;
    color: #d8c99b;
    background: #1a2332;
    border: 1px solid #27313b;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s ease;
    flex-shrink: 0;

    &:hover {
      background: #27313b;
      border-color: #6d9f43;
      color: #6d9f43;
    }
  }

  .siu-title-wrap {
    display: flex;
    align-items: baseline;
    gap: 10px;
    min-width: 0;
  }

  .siu-title {
    font-size: 20px;
    font-weight: 700;
    color: #d8c99b;
  }

  .siu-count {
    font-size: 12px;
    color: #82909d;
  }

  .siu-header-actions {
    display: flex;
    gap: 8px;
    flex-shrink: 0;
  }

  .siu-loading {
    display: flex;
    justify-content: center;
    padding: 80px 0;
  }

  .siu-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 14px;
  }

  .siu-card {
    display: flex;
    flex-direction: column;
    background: #171e26;
    border: 1px solid #27313b;
    border-radius: 8px;
    overflow: hidden;
    transition: border-color 0.2s ease, transform 0.2s ease;

    &:hover {
      border-color: #6d9f43;
      transform: translateY(-2px);
    }
  }

  .siu-card-img {
    position: relative;
    width: 100%;
    aspect-ratio: 16 / 9;
    background: #0c1117;
    overflow: hidden;

    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
  }

  .siu-no-img {
    display: flex;
    width: 100%;
    height: 100%;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    color: #546e7a;
  }

  .siu-card-info {
    padding: 10px 12px 6px;
    min-width: 0;
  }

  .siu-hero {
    font-size: 15px;
    font-weight: 700;
    color: #f0e6d2;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .siu-skin {
    margin-top: 4px;
    font-size: 13px;
    color: #d8c99b;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .siu-id {
    margin-top: 4px;
    font-size: 11px;
    color: #82909d;
    font-family: monospace;
  }

  .siu-card-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 8px 12px 12px;
  }

  .siu-empty {
    margin-top: 60px;
  }
</style>
