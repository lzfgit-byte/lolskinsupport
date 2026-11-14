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
        <div class="r3nz-chip" :title="r3nzStatusTitle">{{ r3nzStatusText }}</div>
      </div>
      <div class="header-actions">
        <a-button class="header-action-btn" size="small" @click="openR3nzSkinDir">
          R3nzSkin 配置目录
        </a-button>
        <a-button class="header-action-btn" size="small" @click="refreshStatus"> 刷新状态 </a-button>
      </div>
    </header>

    <div class="skin-content">
      <!-- 左侧：皮肤列表（保留图片与下方的皮肤名字节点） -->
      <aside class="skin-list">
        <template v-if="allSkins.length > 0">
          <div
            v-for="item in allSkins"
            :key="item.skinId"
            class="skin-card"
            :class="{ active: isChose(item) }"
            :title="item.description"
            @click="handleChoseSkin(item)"
            @dblclick="applySelectedSkin"
          >
            <img :src="item.mainImg" loading="lazy" />
            <div class="skin-name" :title="item.name">{{ item.name }}</div>
          </div>
        </template>

        <!-- 加载中 / 加载失败（可重试）/ 无数据 -->
        <div v-else class="skin-list-state">
          <template v-if="skinLoading">
            <div class="state-title">正在加载皮肤数据...</div>
          </template>
          <template v-else-if="skinError">
            <div class="state-title">{{ skinError }}</div>
            <div class="state-desc">{{ skinTip }}</div>
            <a-button class="state-btn" size="small" @click="getSkins()"> 重新加载 </a-button>
          </template>
          <template v-else>
            <div class="state-title">暂无皮肤数据</div>
          </template>
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

          <!-- 悬浮炫彩选择面板：收起时小，展开时变大（一行三列） -->
          <div
            v-if="skinChild?.length > 0"
            class="chroma-overlay-panel"
            :class="{ expanded: showChromas }"
          >
            <div class="chroma-header" @click="showChromas = !showChromas">
              <span class="chroma-title">炫彩皮肤 ({{ skinChild.length }} 个)</span>
              <div class="chroma-toggle-btn" :class="{ expanded: showChromas }">
                <span class="toggle-text">{{ showChromas ? '收起' : '展开' }}</span>
                <span class="toggle-icon">▲</span>
              </div>
            </div>

            <!-- 列表始终挂载（图片预加载，展开无跳变），展开动画靠 transform/opacity -->
            <div class="chroma-body" :class="{ expanded: showChromas }">
              <div class="chroma-list">
                <button
                  v-for="(item, index) in skinChild"
                  :key="item.skinId"
                  class="chroma-item"
                  :class="{ active: item.skinId === choseSkinId }"
                  :title="item.name"
                  :style="{ '--chroma-delay': `${Math.min(index, 8) * 20}ms` }"
                  @click="handleChoseSkin(item)"
                >
                  <img :src="getSkinChromaUrl(item)" />
                </button>
              </div>
            </div>
          </div>
        </section>

        <!-- 底部平铺操作按钮栏 -->
        <footer class="bottom-actions-bar">
          <a-button class="action-btn-ghost" @click="openR3nzSkinDir"> 打开配置目录 </a-button>
          <a-button class="action-btn-ghost" :disabled="!choseSkinId" @click="clearPreselect">
            取消该英雄预选
          </a-button>
          <a-button
            class="action-btn-primary"
            :loading="publishing"
            :disabled="!choseSkinId"
            @click="applySelectedSkin"
          >
            应用到 R3nzSkin
          </a-button>
        </footer>
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
  import type { Ref } from 'vue';
  import { computed, onMounted, ref } from 'vue';
  import { message } from 'ant-design-vue';
  import type { heroInfo, skinInfo } from '@/type/type';
  import useGlobalState, { LogUtil } from '@/hooks/use-global-state';
  import { fetchJsonWithCache, heroSkinsCacheKey, LOL_DATA } from '@/utils/remote-cache';
  import {
    f_clearChampionSkinSelection,
    f_getHeroChoseSkin,
    f_getR3nzSkinStatus,
    f_openPath,
    f_publishSkinToR3nzSkin,
    f_setHeroChoseSkin,
  } from '@/utils/business';

  const { heroId, heroAlias, choseDrawerOpen, autoChose, lcuState } = useGlobalState();
  let skins_ = ref<skinInfo[]>([]);
  let skinIdImg = {};
  const allSkins = ref<skinInfo[]>([]);
  const choseSkinId = ref('');
  const showChromas = ref(false);
  /** 正在写入 R3nzSkin */
  const publishing = ref(false);
  /** R3nzSkin 配置状态 */
  const r3nzStatus = ref<any>(null);
  /** 皮肤数据加载状态 */
  const skinLoading = ref(false);
  const skinError = ref('');
  const skinTip = ref('');
  /** 请求序号，切换英雄后丢弃过期响应 */
  let skinReqToken = 0;

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

  /** 应用皮肤数据：本地 JSON 与后台刷新结果共用此逻辑 */
  const applySkins = (list: skinInfo[]) => {
    skins_.value = list || [];
    allSkins.value = skins_.value.filter((item: skinInfo) => item.chromasBelongId === '0');
  };

  /** 拉取英雄皮肤列表：直接读随包 JSON，不发网络请求；本地缺失时才会回源 */
  const getSkins = async () => {
    if (!heroId.value) {
      message.warn('请选择英雄');
      return;
    }
    const REQ_URL = `https://game.gtimg.cn/images/lol/act/img/js/hero/${heroId.value}.js`;
    const token = ++skinReqToken;
    skinLoading.value = true;
    skinError.value = '';
    skinTip.value = '';
    showChromas.value = false;
    applySkins([]);
    choseSkinId.value = '';

    const res = await fetchJsonWithCache<heroInfo>(REQ_URL, heroSkinsCacheKey(heroId.value), {
      timeout: 8000,
      retries: 1,
      localFile: LOL_DATA.heroSkins(heroId.value),
      // 后台刷新拿到新数据时无感更新列表（保留当前选中皮肤）
      onUpdate: (fresh) => {
        if (token !== skinReqToken || !fresh?.skins?.length) {
          return;
        }
        applySkins(fresh.skins);
      },
    }).catch(() => null);

    // 已切换到其它英雄，丢弃过期结果
    if (token !== skinReqToken) {
      return;
    }
    skinLoading.value = false;
    if (!res) {
      skinError.value = '皮肤数据加载失败';
      skinTip.value = '请检查网络后重试';
      return;
    }

    applySkins(res.data?.skins || []);
    if (allSkins.value.length === 0) {
      skinError.value = '皮肤数据加载失败';
      skinTip.value = '接口未返回皮肤数据，请稍后重试';
      return;
    }

    let choseId = '';
    try {
      choseId = (await f_getHeroChoseSkin(heroId.value)) || '';
    } catch {
      choseId = '';
    }
    if (token !== skinReqToken) {
      return;
    }

    choseSkinId.value = choseId || allSkins.value[0]?.skinId || '';
    await autoApplyChosenSkin();
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
    await preChose();
    // 开了自动应用就立刻写进 R3nzSkin，不用再点按钮
    if (autoChose.value && lcuState.value) {
      await applySelectedSkin();
    }
  };

  /** 写入 R3nzSkin：把当前皮肤作为该英雄的预选（不再挂载 mod） */
  const applySelectedSkin = async () => {
    if (!choseSkinId.value) {
      message.warn('请先选择一个皮肤');
      return;
    }
    publishing.value = true;
    try {
      const res = await f_publishSkinToR3nzSkin(heroId.value, choseSkinId.value);
      if (!res?.ok) {
        message.error(res?.reason ?? '写入 R3nzSkin 失败');
        return;
      }
      await preChose();
      await refreshStatus();
    } catch (error: any) {
      message.error(`写入 R3nzSkin 失败：${error?.message ?? error}`);
    } finally {
      publishing.value = false;
    }
  };

  /** 原版行为：LCU 已连接且开启「自动应用」时，打开皮肤页即自动应用该英雄已选的皮肤 */
  const autoApplyChosenSkin = async () => {
    if (!choseSkinId.value || !lcuState.value || !autoChose.value) {
      return;
    }
    // 基础皮肤不需要改，原版同样跳过
    if (choseSkinId.value.endsWith('00')) {
      return;
    }
    await applySelectedSkin();
  };

  /** 记住这个英雄的选择；锁定英雄时主进程会用这份选择自动写入 R3nzSkin */
  const preChose = async () => {
    if (!heroId.value || !choseSkinId.value) {
      return;
    }
    await f_setHeroChoseSkin(heroId.value, choseSkinId.value);
  };

  const refreshStatus = async () => {
    try {
      r3nzStatus.value = await f_getR3nzSkinStatus();
    } catch {
      r3nzStatus.value = null;
    }
  };

  const openR3nzSkinDir = () => {
    const dir = r3nzStatus.value?.dir;
    if (!dir) {
      message.warn('还没拿到 R3nzSkin 配置目录，请先点「刷新状态」');
      return;
    }
    f_openPath(dir);
  };

  const clearPreselect = async () => {    if (!heroId.value) {
      return;
    }
    const res = await f_clearChampionSkinSelection(heroId.value).catch(() => null);
    if (res?.ok) {
      message.success(`已清除 ${res.alias} 的皮肤预选`);
      await refreshStatus();
    } else {
      message.warn('清除预选失败');
    }
  };

  const mkSkinId = computed(() => {
    if (!choseSkinId.value) {
      return '';
    }
    return parseInt(choseSkinId.value?.replace(heroId.value, '')).toString();
  });

  const r3nzStatusText = computed(() => {
    const status = r3nzStatus.value;
    if (!status) {
      return 'R3nzSkin：未检测到';
    }
    if (!status.configExists) {
      return 'R3nzSkin：配置未创建';
    }
    return `R3nzSkin：已配置 ${status.configuredChampions} 个英雄`;
  });

  const r3nzStatusTitle = computed(() => {
    const status = r3nzStatus.value;
    if (!status) {
      return '读取 R3nzSkin 配置失败';
    }
    return [
      `配置目录：${status.dir}`,
      `配置文件：${status.configExists ? '已存在' : '尚未创建'}`,
      `已配置英雄：${status.configuredChampions} 个`,
      '写入后需要重新注入 R3nzSkin 才会生效（首次注入在进游戏前）',
    ].join('\n');
  });

  onMounted(() => {
    getSkins();
    refreshStatus();
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

  /* R3nzSkin 同步状态 */
  .r3nz-chip {
    padding: 2px 10px;
    border: 1px solid #2f4a3a;
    background: #101b15;
    color: #9fd08a;
    font-size: 12px;
    white-space: nowrap;
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

  /* 左侧皮肤列表 */
  .skin-list {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-content: start;
    gap: 10px;
    padding: 10px;
    overflow-y: auto;
    scrollbar-gutter: stable;
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
    transition: border-color 0.16s ease, background-color 0.16s ease, box-shadow 0.16s ease;
    will-change: border-color;

    &:hover {
      border-color: #6a844d;
      background: #19232b;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
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

  /* 列表加载中 / 加载失败 / 无数据 */
  .skin-list-state {
    grid-column: 1 / -1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    padding: 48px 12px;
    text-align: center;

    .state-title {
      color: #fff2c7;
      font-size: 15px;
      font-weight: 700;
    }

    .state-desc {
      color: #7f8b97;
      font-size: 13px;
    }

    .state-btn {
      border-color: #5e8d3a;
      background: #15221b;
      color: #f2e6bb;

      &:hover {
        border-color: #8fc85d;
        color: #ffffff;
      }
    }
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
    bottom: 8px;
    right: 12px;
    width: 150px; /* 收起状态下：极简精致小巧外框 */
    background: rgba(16, 22, 29, 0.96);
    border: 1px solid #2e3e4d;
    border-radius: 4px;
    padding: 5px 8px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.6);
    /* 只过渡宽度；不再用 backdrop-filter，避免逐帧重新模糊背景导致掉帧 */
    transition: width 0.28s cubic-bezier(0.22, 1, 0.36, 1);
    /* 把布局/绘制影响锁在面板内部，减小动画时的重排范围 */
    contain: layout paint style;

    &.expanded {
      width: 400px; /* 展开状态下：面板扩大放宽 */
    }
  }

  .chroma-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    cursor: pointer;
    user-select: none;

    .chroma-title {
      font-size: 11px;
      font-weight: 700;
      color: #e5d8b4;
      white-space: nowrap;
    }

    .chroma-toggle-btn {
      display: flex;
      align-items: center;
      gap: 2px;
      padding: 1px 6px;
      border-radius: 3px;
      background: #18232e;
      border: 1px solid #334657;
      color: #8fc85d;
      font-size: 10px;
      font-weight: 700;
      transition: background-color 0.16s ease, border-color 0.16s ease, color 0.16s ease;

      .toggle-icon {
        font-size: 8px;
        line-height: 1;
        /* 图标旋转代替换字符，不会突然跳一下 */
        transition: transform 0.28s cubic-bezier(0.22, 1, 0.36, 1);
      }

      &:hover {
        background: #223242;
        border-color: #8fc85d;
        color: #ffffff;
      }

      &.expanded {
        background: #203325;
        border-color: #5e8d3a;
        color: #a3e070;

        .toggle-icon {
          transform: rotate(180deg);
        }
      }
    }
  }

  /* 展开/收起动画容器：max-height 负责撑开，视觉过渡交给 transform/opacity */
  .chroma-body {
    max-height: 0;
    overflow: hidden;
    opacity: 0;
    transform: translateY(6px);
    transform-origin: right top;
    pointer-events: none;
    transition:
      max-height 0.3s cubic-bezier(0.22, 1, 0.36, 1),
      opacity 0.22s ease,
      transform 0.3s cubic-bezier(0.22, 1, 0.36, 1);

    &.expanded {
      max-height: 480px;
      opacity: 1;
      transform: translateY(0);
      pointer-events: auto;
    }
  }

  /* 展开后的炫彩选择列表：一行三列大图 */
  .chroma-list {
    display: grid;
    grid-template-columns: repeat(3, 1fr); /* 一行三列 */
    gap: 8px;
    margin-top: 8px;
    max-height: 460px;
    overflow-y: auto;
    scrollbar-gutter: stable;
    padding-right: 2px;
    scrollbar-width: none; /* Firefox 隐藏滚动条 */
    -ms-overflow-style: none; /* IE / Edge 隐藏滚动条 */
    &::-webkit-scrollbar {
      width: 4px;
    }
    &::-webkit-scrollbar-track {
      background: #0f151c;
    }
    &::-webkit-scrollbar-thumb {
      background: #384755;
      border-radius: 3px;
    }
  }

  .chroma-item {
    border: 1.5px solid #2f3d49;
    background: #151d25;
    padding: 0;
    cursor: pointer;
    border-radius: 4px;
    overflow: hidden;
    /* 逐个渐入，延迟由 --chroma-delay 控制（只作用于 opacity/transform，不影响 hover） */
    opacity: 0;
    transform: translateY(6px) scale(0.96);
    transition:
      opacity 0.22s ease var(--chroma-delay, 0ms),
      transform 0.3s cubic-bezier(0.22, 1, 0.36, 1) var(--chroma-delay, 0ms),
      border-color 0.14s ease,
      box-shadow 0.14s ease;

    &:hover {
      border-color: #8fc85d;
      box-shadow: 0 0 6px rgba(143, 200, 93, 0.4);
    }

    &.active {
      border-color: @border-active;
      box-shadow: 0 0 0 2px rgba(119, 178, 75, 0.6);
    }

    img {
      display: block;
      width: 100%;
      aspect-ratio: 1 / 1;
      object-fit: cover;
    }
  }

  .chroma-body.expanded .chroma-item {
    opacity: 1;
    transform: translateY(0) scale(1);
  }

  /* 底部平铺按钮区域 */
  .bottom-actions-bar {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
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
