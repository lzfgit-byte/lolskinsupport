<template>
  <div class="skin-page-view">
    <header class="skin-header">
      <button class="back-button" @click="back">返回</button>
      <div class="hero-title">
        <span class="hero-name">{{ heroAlias }}</span>
        <span class="hero-id">{{ heroId }}_{{ mkSkinId }}</span>
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
          <img :src="item.mainImg" />
          <div class="skin-name" :title="item.name">{{ item.name }}</div>
        </div>
      </aside>

      <section class="preview-panel">
        <img v-if="choseSkinMainImg" class="preview-img" :src="choseSkinMainImg" />
        <div v-else class="preview-empty">暂无预览</div>
      </section>

      <aside class="detail-panel">
        <div class="detail-summary">
          <div class="detail-block">
            <div class="detail-label">当前皮肤</div>
            <div class="detail-title">{{ choseSkin?.name || '未选择' }}</div>
            <div class="detail-id">{{ choseSkinId }}</div>
          </div>

          <div v-if="skinChild?.length > 0" class="detail-block chroma-summary">
            <div class="detail-title-row">
              <div>
                <div class="detail-label">炫彩</div>
                <div class="detail-id">{{ skinChild.length }} 个可选</div>
              </div>
              <button class="chroma-toggle" @click="showChromas = !showChromas">
                {{ showChromas ? '收起' : '显示' }}
              </button>
            </div>
          </div>
        </div>

        <div class="detail-scroll">
          <div v-if="showChromas && skinChild?.length > 0" class="chroma-grid">
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

        <div class="detail-actions">
          <a-button class="action-btn" block @click="doMkCurrentHero">
            （多个）全部皮肤文件
          </a-button>
          <a-button class="action-btn" block @click="doMkCurrentSkin">
            （一个）当前皮肤文件
          </a-button>
          <a-button class="action-btn" block @click="doMkOverlay">构建 overlay</a-button>
          <a-button class="action-btn primary-action" block @click="confirm_"
            >点击使用皮肤</a-button
          >
        </div>
      </aside>
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
    // message.success('已应用');
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
  .skin-page-view {
    display: grid;
    grid-template-rows: 58px minmax(0, 1fr);
    height: 100%;
    min-height: 0;
    background: #151c24;
    color: #f7edcf;
  }

  .skin-header {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 14px;
    border-bottom: 1px solid #2b3743;
    background: #121820;
    padding: 10px 14px;
  }

  .back-button {
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
    min-width: 0;
    display: flex;
    align-items: baseline;
    gap: 10px;
  }

  .hero-name {
    overflow: hidden;
    color: #fff3c7;
    font-size: 22px;
    font-weight: 700;
    text-overflow: ellipsis;
    white-space: nowrap;
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

    &:hover,
    &:focus {
      border-color: #78a85a;
      background: #1d2a21;
      color: #ffffff;
    }
  }

  .skin-content {
    display: grid;
    grid-template-columns: 392px minmax(360px, 1fr) 280px;
    gap: 14px;
    min-height: 0;
    padding: 14px;
  }

  .skin-list,
  .detail-panel {
    min-height: 0;
    border: 1px solid #2b3743;
    background: #10161d;
  }

  .skin-list {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-content: start;
    gap: 10px;
    overflow-y: auto;
    padding: 10px;
  }

  .skin-list::-webkit-scrollbar,
  .detail-scroll::-webkit-scrollbar {
    width: 8px;
  }

  .skin-list::-webkit-scrollbar-track,
  .detail-scroll::-webkit-scrollbar-track {
    background: #0c1117;
  }

  .skin-list::-webkit-scrollbar-thumb,
  .detail-scroll::-webkit-scrollbar-thumb {
    border: 2px solid #0c1117;
    background: #43505c;
  }

  .skin-list::-webkit-scrollbar-thumb:hover,
  .detail-scroll::-webkit-scrollbar-thumb:hover {
    background: #657380;
  }

  .skin-card {
    position: relative;
    min-width: 0;
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
      border-color: #77b24b;
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

  .preview-panel {
    display: flex;
    min-width: 0;
    min-height: 0;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    border: 1px solid #2b3743;
    background: #0e141b;
  }

  .preview-img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .preview-empty {
    color: #7f8b97;
  }

  .detail-panel {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    overflow: hidden;
  }

  .detail-summary {
    border-bottom: 1px solid #25313c;
    padding: 14px 14px 0;
  }

  .detail-scroll {
    min-height: 0;
    overflow-y: auto;
    padding: 12px 14px;
  }

  .detail-scroll:empty {
    padding: 0 14px;
  }

  .detail-block {
    margin-bottom: 14px;
    padding-bottom: 14px;
  }

  .chroma-summary {
    margin-bottom: 0;
  }

  .detail-label {
    color: #7f8b97;
    font-size: 12px;
  }

  .detail-title-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }

  .detail-title {
    margin-top: 6px;
    color: #fff2c7;
    font-size: 18px;
    font-weight: 700;
    line-height: 24px;
  }

  .detail-id {
    margin-top: 4px;
    color: #8fa0ad;
  }

  .chroma-toggle {
    height: 30px;
    min-width: 58px;
    border: 1px solid #3d5a2f;
    background: #17241a;
    color: #d8f0c2;
    cursor: pointer;

    &:hover {
      border-color: #78b755;
      color: #ffffff;
    }
  }

  .chroma-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
    margin-top: 10px;
  }

  .chroma-item {
    overflow: hidden;
    border: 1px solid #2f3d49;
    background: #151d25;
    padding: 0;
    cursor: pointer;

    &.active {
      border-color: #77b24b;
    }

    img {
      display: block;
      width: 100%;
      aspect-ratio: 1 / 1;
      object-fit: cover;
    }
  }

  .detail-actions {
    display: grid;
    gap: 10px;
    border-top: 1px solid #25313c;
    background: #10161d;
    padding: 14px;
  }

  .action-btn {
    height: 36px;
    border-color: #324553;
    background: #17212a;
    color: #efe3bc;
    font-weight: 700;

    &:hover,
    &:focus {
      border-color: #76a85a;
      background: #1c2a22;
      color: #ffffff;
    }
  }

  .primary-action {
    border-color: #3d7b4a;
    background: #2d6f45;
    color: #ffffff;

    &:hover,
    &:focus {
      border-color: #68c577;
      background: #388554;
      color: #ffffff;
    }
  }
</style>
