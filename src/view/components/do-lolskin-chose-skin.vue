<template>
  <div class="skin-page-view">
    <!-- 顶栏 -->
    <header class="skin-header">
      <div class="header-left">
        <button class="back-button" @click="back"> <span class="back-icon">‹</span> 返回 </button>
        <div class="hero-title">
          <span class="hero-name">{{ heroAlias }}</span>
          <span class="hero-id">ID: {{ heroId }}_{{ mkSkinId }}</span>
        </div>
      </div>
      <div class="header-actions">
        <a-button class="header-action-btn" size="small" @click="openHeroSkinPath">
          打开皮肤目录
        </a-button>
        <a-button class="header-action-btn" size="small" @click="doUnPackWadFile">
          解压 WAD
        </a-button>
      </div>
    </header>

    <div class="skin-content">
      <!-- 左侧：皮肤列表（完整保留原本的图片+下方皮肤名字结构） -->
      <aside class="skin-list">
        <div
          v-for="item in allSkins"
          :key="item.skinId"
          class="skin-card"
          :class="{ active: isChose(item) }"
          :title="item.description"
          @click="handleChoseSkin(item)"
          @dblclick="confirm_"
        >
          <img :src="item.mainImg" loading="lazy" />
          <div class="skin-name" :title="item.name">{{ item.name }}</div>
        </div>
      </aside>

      <!-- 右侧主体：大图展示区 + 悬浮信息/炫彩 + 底部平铺按钮 -->
      <main class="main-preview-container">
        <!-- 大图展示舞台 -->
        <section class="preview-stage">
          <img v-if="choseSkinMainImg" class="preview-img" :src="choseSkinMainImg" />
          <div v-else class="preview-empty">暂无预览</div>

          <!-- 左上角：悬浮当前皮肤信息 -->
          <div class="skin-overlay-info">
            <div class="info-label">CURRENT SKIN</div>
            <div class="info-title">{{ choseSkin?.name || '未选择皮肤' }}</div>
            <div class="info-id">ID: {{ choseSkinId }}</div>
          </div>

          <!-- 悬浮炫彩选择面板（包含展开/收起） -->
          <div v-if="skinChild?.length > 0" class="chroma-overlay-panel">
            <div class="chroma-header" @click="showChromas = !showChromas">
              <span class="chroma-title">炫彩皮肤 ({{ skinChild.length }} 个可选)</span>
              <span class="chroma-toggle-text">{{ showChromas ? '收起 ▲' : '展开炫彩 ▼' }}</span>
            </div>

            <div v-if="showChromas" class="chroma-list">
              <button
                v-for="item in skinChild"
                :key="item.skinId"
                class="chroma-item"
                :class="{ active: item.skinId === choseSkinId }"
                :title="item.name"
                @click="handleChoseSkin(item)"
              >
                <img :src="getSkinChromaUrl(item)" />
              </button>
            </div>
          </div>
        </section>

        <!-- 底部平铺操作按钮栏 -->
        <footer class="bottom-actions-bar">
          <a-button class="action-btn-ghost" @click="doMkCurrentHero">
            （多个）全部皮肤文件
          </a-button>
          <a-button class="action-btn-ghost" @click="doMkCurrentSkin">
            （一个）当前皮肤文件
          </a-button>
          <a-button class="action-btn-secondary" @click="doMkOverlay"> 构建 overlay </a-button>
          <a-button class="action-btn-primary" @click="confirm_"> 点击使用皮肤 </a-button>
        </footer>
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
  import type { Ref } from 'vue';
  import { computed, onMounted, ref } from 'vue';
  import { message } from 'ant-design-vue';
  import http from '@/utils/http';
  import type { skinInfo } from '@/type/type';
  import useGlobalState, { LogUtil } from '@/hooks/use-global-state';
  import {
    f_checkHasSkins,
    f_confirmChoseSkin,
    f_getHeroChoseSkin,
    f_loadSkin,
    f_loadSkinDataByFilePath,
    f_mkOverlay,
    f_openPath,
    f_selectPathOrFile,
    f_setHeroChoseSkin,
    f_unpackWadFileTo,
  } from '@/utils/business';
  import { showFrontendConfirm } from '@/utils/kit-utils';

  const {
    heroId,
    autoChose,
    heroAlias,
    lcuState,
    gamePath,
    logDrawOpen,
    skinPath,
    skinDefaultSuffix,
    choseDrawerOpen,
  } = useGlobalState();
  let skins_ = ref<skinInfo[]>([]);
  let skinIdImg = {};
  const allSkins = ref<skinInfo[]>([]);
  const choseSkinId = ref('');
  const showChromas = ref(false);

  const choseSkin = computed(() => {
    if (choseSkinId.value) {
      const f = skins_.value.filter((item) => item.skinId === choseSkinId.value);
      if (f?.length > 0) {
        return f[0];
      }
    }
    return {};
  });

  const choseSkinMainImg = computed(() => {
    if (choseSkin.value?.chromasBelongId === '0') {
      return choseSkin.value.mainImg;
    }
    const s = allSkins.value?.filter((item) => item.skinId === choseSkin.value?.chromasBelongId);
    if (s?.length > 0) {
      return s[0].mainImg;
    }
    return '';
  });

  const activeParentSkinId = computed(() => {
    return choseSkin.value?.chromasBelongId === '0'
      ? choseSkinId.value
      : choseSkin.value?.chromasBelongId;
  });

  const skinChild: Ref<skinInfo[]> = computed(() => {
    return skins_.value.filter((item_) => activeParentSkinId.value === item_.chromasBelongId);
  }) as any;

  const getSkinChromaUrl = (item: skinInfo) => {
    const a = `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-chroma-images/${heroId.value}/${item.skinId}.png`;
    skinIdImg[item.skinId] = a;
    return a;
  };

  const getSkins = () => {
    const REQ_URL = `https://game.gtimg.cn/images/lol/act/img/js/hero/${heroId.value}.js`;
    if (!heroId.value) {
      message.warn('请选择英雄');
      return;
    }
    http.axios
      .get(REQ_URL)
      .then((res: any) => {
        skins_.value = res.skins || [];
        allSkins.value = skins_.value.filter((item: skinInfo) => item.chromasBelongId === '0');
        return f_getHeroChoseSkin(heroId.value);
      })
      .then((id) => {
        choseSkinId.value = id || allSkins.value[0]?.skinId || '';
        if (!choseSkinId.value) {
          return;
        }
        if (lcuState.value && autoChose.value && !choseSkinId.value?.endsWith('00')) {
          f_confirmChoseSkin(
            `选择皮肤【${choseSkin.value?.name}】`,
            choseSkin.value.mainImg || getSkinChromaUrl(choseSkin.value)
          ).then((res) => {
            if (res) {
              confirm_();
            }
          });
        }
      });
  };

  const isChose = (item: skinInfo) => {
    if (choseSkin.value?.chromasBelongId === '0') {
      return item.skinId === choseSkinId.value;
    }
    return item.skinId === choseSkin.value?.chromasBelongId;
  };

  const back = () => {
    heroId.value = '';
    heroAlias.value = '';
    choseDrawerOpen.value = false;
  };

  const handleChoseSkin = async (item: skinInfo) => {
    LogUtil.log(`${item.skinId}`);
    choseSkinId.value = item.skinId;
    if (item.chromasBelongId === '0') {
      showChromas.value = false;
    }
    const res = await f_checkHasSkins(heroId.value, item.skinId);
    if (!res) {
      message.warn('请先下载英雄皮肤');
    }
    await preChose();
  };

  const confirm_ = async () => {
    const res = await f_checkHasSkins(heroId.value, choseSkinId.value);
    if (!res) {
      message.warn('请先下载英雄皮肤');
      return;
    }
    await f_loadSkin(heroId.value, choseSkin.value.skinId, getSkinImage());
  };

  const doMkOverlay = async () => {
    const res = await f_checkHasSkins(heroId.value, choseSkinId.value);
    if (!res) {
      message.warn('请先下载英雄皮肤');
      return;
    }
    await f_mkOverlay(heroId.value, choseSkin.value.skinId, getSkinImage());
  };

  const getSkinImage = () => {
    return choseSkinMainImg.value;
  };

  const preChose = async () => {
    const res = await f_checkHasSkins(heroId.value, choseSkinId.value);
    if (!res) {
      message.warn('请先下载英雄皮肤');
      return;
    }
    await f_setHeroChoseSkin(heroId.value, choseSkinId.value);
  };

  const mkSkinId = computed(() => {
    if (!choseSkinId.value) {
      return '';
    }
    return parseInt(choseSkinId.value?.replace(heroId.value, '')).toString();
  });

  const doMkCurrentSkin = async () => {
    const path = await f_selectPathOrFile(
      'openFile',
      `${gamePath.value}\\DATA\\FINAL\\Champions\\${heroAlias.value}.wad.client`
    );
    if (path) {
      f_loadSkinDataByFilePath(path, +mkSkinId.value);
      logDrawOpen.value = true;
    }
  };

  const doMkCurrentHero = async () => {
    showFrontendConfirm('确认创建当前英雄皮肤').then(async () => {
      const path = await f_selectPathOrFile(
        'openFile',
        `${gamePath.value}\\DATA\\FINAL\\Champions\\${heroAlias.value}.wad.client`
      );
      if (path) {
        f_loadSkinDataByFilePath(path);
        logDrawOpen.value = true;
      }
    });
  };

  const doUnPackWadFile = async () => {
    const path = await f_selectPathOrFile(
      'openFile',
      `${gamePath.value}\\DATA\\FINAL\\Champions\\${heroAlias.value}.wad.client`
    );
    if (path) {
      f_unpackWadFileTo(path);
      logDrawOpen.value = true;
    }
  };

  const openHeroSkinPath = () => {
    f_openPath(`${skinPath.value}\\${skinDefaultSuffix.value}\\${heroId.value}`);
  };

  onMounted(() => {
    getSkins();
  });
</script>

<style scoped lang="less">
  @bg-dark: #151c24;
  @panel-bg: #10161d;
  @border-color: #2b3743;
  @border-active: #77b24b;

  .skin-page-view {
    display: grid;
    grid-template-rows: 58px minmax(0, 1fr);
    height: 100%;
    min-height: 0;
    background: @bg-dark;
    color: #f7edcf;
  }

  /* 顶栏 */
  .skin-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 14px;
    background: #121820;
    border-bottom: 1px solid @border-color;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 14px;
  }

  .back-button {
    display: flex;
    align-items: center;
    gap: 4px;
    height: 34px;
    padding: 0 18px;
    border: 1px solid #5e8d3a;
    background: #15221b;
    color: #f2e6bb;
    cursor: pointer;

    &:hover {
      border-color: #8fc85d;
      color: #ffffff;
    }
  }

  .hero-title {
    display: flex;
    align-items: baseline;
    gap: 10px;
  }

  .hero-name {
    color: #fff3c7;
    font-size: 22px;
    font-weight: 700;
  }

  .hero-id {
    color: #7f8b97;
    font-size: 13px;
  }

  .header-actions {
    display: flex;
    gap: 8px;
  }

  .header-action-btn {
    border-color: #334655;
    background: #18222c;
    color: #e7d9ad;

    &:hover {
      border-color: #78a85a;
      background: #1d2a21;
      color: #ffffff;
    }
  }

  /* 页面主体：左右布局 */
  .skin-content {
    display: grid;
    grid-template-columns: 392px minmax(0, 1fr);
    gap: 14px;
    padding: 14px;
    min-height: 0;
  }

  /* 左侧皮肤列表（保持完全一致的样式） */
  .skin-list {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-content: start;
    gap: 10px;
    padding: 10px;
    overflow-y: auto;
    border: 1px solid @border-color;
    background: @panel-bg;

    &::-webkit-scrollbar {
      width: 8px;
    }
    &::-webkit-scrollbar-track {
      background: #0c1117;
    }
    &::-webkit-scrollbar-thumb {
      border: 2px solid #0c1117;
      background: #43505c;
    }
    &::-webkit-scrollbar-thumb:hover {
      background: #657380;
    }
  }

  .skin-card {
    position: relative;
    border: 1px solid #273541;
    background: #151d25;
    cursor: pointer;
    transition: border-color 0.16s, transform 0.16s, background-color 0.16s;

    &:hover {
      transform: translateY(-1px);
      border-color: #6a844d;
      background: #19232b;
    }

    &.active {
      border-color: @border-active;
      box-shadow: inset 0 0 0 2px rgba(119, 178, 75, 0.5);
    }

    img {
      display: block;
      width: 100%;
      aspect-ratio: 2 / 1;
      object-fit: cover;
    }
  }

  .skin-name {
    overflow: hidden;
    padding: 8px;
    color: #fff2c7;
    font-weight: 700;
    line-height: 18px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* 右侧容器：大图展示 + 底部按钮 */
  .main-preview-container {
    display: grid;
    grid-template-rows: minmax(0, 1fr) auto;
    gap: 14px;
    min-height: 0;
  }

  /* 主图舞台 */
  .preview-stage {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid @border-color;
    background: #0e141b;
    overflow: hidden;
  }

  .preview-img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
  }

  .preview-empty {
    color: #7f8b97;
  }

  /* 悬浮在主图左上角：皮肤名字和 ID */
  .skin-overlay-info {
    position: absolute;
    top: 16px;
    left: 16px;
    padding: 10px 14px;
    background: rgba(16, 22, 29, 0.85);
    backdrop-filter: blur(8px);
    border: 1px solid #2b3743;
    border-radius: 4px;
    pointer-events: none;

    .info-label {
      font-size: 11px;
      color: @border-active;
    }

    .info-title {
      margin-top: 2px;
      color: #fff2c7;
      font-size: 18px;
      font-weight: 700;
    }

    .info-id {
      margin-top: 2px;
      color: #8fa0ad;
      font-size: 12px;
    }
  }

  /* 悬浮在主图右下角：炫彩选项面板 */
  .chroma-overlay-panel {
    position: absolute;
    bottom: 16px;
    right: 16px;
    min-width: 200px;
    max-width: 300px;
    background: rgba(16, 22, 29, 0.9);
    backdrop-filter: blur(8px);
    border: 1px solid #2b3743;
    border-radius: 4px;
    padding: 10px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
  }

  .chroma-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    cursor: pointer;
    user-select: none;

    .chroma-title {
      font-size: 13px;
      font-weight: 700;
      color: #fff2c7;
    }

    .chroma-toggle-text {
      font-size: 12px;
      color: #8fc85d;
    }
  }

  .chroma-list {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
    margin-top: 10px;
    max-height: 160px;
    overflow-y: auto;
  }

  .chroma-item {
    border: 1px solid #2f3d49;
    background: #151d25;
    padding: 0;
    cursor: pointer;

    &.active {
      border-color: @border-active;
    }

    img {
      display: block;
      width: 100%;
      aspect-ratio: 1 / 1;
      object-fit: cover;
    }
  }

  /* 底部平铺按钮区域 */
  .bottom-actions-bar {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 10px;
    padding: 12px;
    border: 1px solid @border-color;
    background: @panel-bg;
  }

  .action-btn-ghost,
  .action-btn-secondary,
  .action-btn-primary {
    height: 38px;
    font-weight: 700;
    width: 100%;
  }

  .action-btn-ghost {
    border-color: #324553;
    background: #17212a;
    color: #efe3bc;

    &:hover {
      border-color: #76a85a;
      background: #1c2a22;
      color: #ffffff;
    }
  }

  .action-btn-secondary {
    border-color: #3f5567;
    background: #202d38;
    color: #ffffff;

    &:hover {
      border-color: #6da2cb;
      background: #293a48;
    }
  }

  .action-btn-primary {
    border-color: #3d7b4a;
    background: #2d6f45;
    color: #ffffff;

    &:hover {
      border-color: #68c577;
      background: #388554;
    }
  }
</style>
