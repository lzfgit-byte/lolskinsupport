<template>
  <a-drawer
    v-model:open="drawerOpen"
    placement="right"
    width="70vw"
    :z-index="59999"
    :mask-style="{ zIndex: 59998 }"
    :content-wrapper-style="{ zIndex: 59999 }"
    :body-style="{ zIndex: 59999 }"
    :header-style="{ display: 'none' }"
  >
    <div h-85vh overflow-auto w-full m-t-4 p-t-2>
      <h1>设置信息</h1>

      <a-tabs v-model:active-key="activeTab">
        <a-tab-pane key="skin" tab="皮肤设置">
          皮肤存储路径：
          {{ skinPath }}
          <a-space>
            <a-button size="small" @click="f_openPath(skinPath)">打开文件路径</a-button>
            <!--          <a-button size="small" @click="f_removePath(skinPath)">删除文件路径</a-button> -->
            <a-button size="small" @click="setConfigPath(SKIN_PATH, skinPath)"
              >设置文件地址</a-button
            >
            <a-button
              size="small"
              type="primary"
              :loading="importLeagueSkinsLoading"
              @click="handleImportLeagueSkinsPackage"
            >
              上传皮肤压缩包
            </a-button>
          </a-space>
          <br /><br />
          皮肤目录名称：
          <a-space>
            <a-input v-model:value="skinDefaultSuffix" size="small" style="width: 180px" />
            <a-button size="small" @click="setSkinDefaultSuffix">设置目录名称</a-button>
          </a-space>
          <br /><br />
          线程数：
          <a-space>
            <a-input-number v-model:value="chuckValue" size="small" :min="1" :max="100" />
            <a-button size="small" danger @click="handleLoadAllSkinData()"
              >创建所有皮肤数据</a-button
            >
          </a-space>
        </a-tab-pane>
        <a-tab-pane key="sync" tab="皮肤同步">
          <div style="border: 1px solid #e5e5e5; border-radius: 6px; padding: 12px">
            <h3 style="margin: 0 0 8px">皮肤自动同步</h3>
            <div style="font-size: 12px; color: #999; margin-bottom: 8px">
              定时检查 GitHub 上 {{ skinSyncState?.repo || 'Alban1911/LeagueSkins' }} 的皮肤清单，
              有新增或变化的皮肤就下载到「皮肤目录 / 目录名称 / 英雄 / 英雄_序号.zip」。
              下载走下面的代理。
            </div>
            启用自动同步：
            <a-switch v-model:checked="skinSyncEnabled"></a-switch>
            <span style="font-size: 12px; color: #999; margin-left: 8px">
              启动后约 20 秒做第一次检查，之后按间隔检查
            </span>
            <br /><br />
            代理地址：
            <a-input
              v-model:value="skinSyncProxy"
              style="width: 260px"
              placeholder="http://127.0.0.1:10808"
            />
            <span style="font-size: 12px; color: #999; margin-left: 8px">留空 = 直连</span>
            <br /><br />
            检查间隔（分钟）：
            <a-input-number v-model:value="skinSyncInterval" :min="1" :max="1440" />
            <br /><br />
            首次只补齐缺失：
            <a-switch v-model:checked="skinSyncMissingOnly"></a-switch>
            <div style="font-size: 12px; color: #999; margin-top: 4px">
              开：本地已有、但同步记录里没有的皮肤不重新下载（第一次不会白下 4
              GB），之后仓库有变化仍会下载； 关：以仓库为准，清单里能识别的皮肤全部重新校验下载。
            </div>
            <br />
            <a-space>
              <a-button size="small" type="primary" @click="saveSkinSyncSettings"
                >保存设置</a-button
              >
              <a-button size="small" @click="handleTestSkinSyncProxy">测试代理</a-button>
              <a-button size="small" :loading="skinSyncRunning" @click="handleSyncSkinsNow">
                立即同步
              </a-button>
              <a-button size="small" @click="refreshSkinSync">刷新状态</a-button>
            </a-space>
            <div style="margin-top: 10px; font-size: 12px; color: #666; line-height: 1.8">
              <div>状态：{{ skinSyncStatusText }}</div>
              <div v-if="skinSyncState?.state?.recorded">
                已记录 {{ skinSyncState.state.recorded }} 个皮肤，清单 commit
                {{ (skinSyncState.state.commit || '').slice(0, 8) || '—' }}
              </div>
            </div>
          </div>
        </a-tab-pane>
        <a-tab-pane key="screenshot" tab="截图设置">
          <div style="font-size: 12px; color: #999; margin-bottom: 8px">
            多杀（双杀~五杀）时会自动截图。等待时间越长越容易截到游戏内横幅，
            可以先打开“保存每一帧”跑一局，再从文件名里的 -t 时间挑合适的值。
          </div>
          截图保存路径：{{ screenshotPath }}
          <a-space>
            <a-button size="small" @click="f_openPath(screenshotPath)">打开文件路径</a-button>
            <a-button size="small" @click="setScreenshotPath">设置文件地址</a-button>
          </a-space>
          <br /><br />
          多杀自动截图：
          <a-space>
            <a-switch
              v-model:checked="multiKillCaptureEnabled"
              @change="handleMultiKillCaptureToggle"
            />
            <span>{{ multiKillCaptureEnabled ? '已开启' : '已关闭' }}</span>
          </a-space>
          <br /><br />
          多杀截图等待：
          <a-space>
            <a-input-number
              v-model:value="multiKillCaptureDelay"
              size="small"
              :min="0"
              :max="8000"
              :step="100"
              :disabled="!multiKillCaptureEnabled"
            />
            <span>ms 后开始连拍</span>
            连拍时长：
            <a-input-number
              v-model:value="multiKillCaptureWindow"
              size="small"
              :min="0"
              :max="5000"
              :step="100"
              :disabled="!multiKillCaptureEnabled"
            />
            <span>ms</span>
            <a-button size="small" @click="setMultiKillCapture">保存截图时机</a-button>
            <a-switch
              v-model:checked="multiKillCaptureDebug"
              :disabled="!multiKillCaptureEnabled"
              @change="setMultiKillCaptureDebug"
            />
            <span>保存每一帧(调试用)</span>
          </a-space>
        </a-tab-pane>
        <a-tab-pane key="path" tab="路径设置">
          游戏路径：{{ gamePath }}
          <a-space>
            <a-button size="small" @click="f_openPath(gamePath)">打开文件路径</a-button>
            <a-button size="small" @click="setConfigPath(GAME_PATH, gamePath)"
              >设置文件地址</a-button
            >
          </a-space>
          <br /><br />
          installedPath路径：{{ installedPath }}
          <a-space>
            <a-button size="small" @click="f_openPath(installedPath)">打开文件路径</a-button>
            <a-button size="small" danger @click="f_removePath(installedPath)"
              >删除文件路径</a-button
            >
            <a-button size="small" @click="setConfigPath(INSTALLED_PATH, installedPath)">
              设置文件地址
            </a-button>
          </a-space>
          <br /><br />
          overlay路径：{{ overlayPath }}
          <a-space>
            <a-button size="small" @click="f_openPath(overlayPath)">打开文件路径</a-button>
            <a-button size="small" danger @click="f_removePath(overlayPath)">删除文件路径</a-button>
            <a-button size="small" @click="setConfigPath(OVERLAY_PATH, overlayPath)">
              设置文件地址
            </a-button>
          </a-space>
          <br /><br />
          overlayConfig路径：{{ overlayConfigPath }}
          <a-space>
            <a-button size="small" @click="f_openPath(overlayConfigPath)">打开文件路径</a-button>
            <!--          <a-button size="small" @click="f_removePath(overlayConfigPath)">删除文件路径</a-button> -->
            <a-button size="small" @click="setConfigPath(OVERLAY_CONFIG_PATH, overlayConfigPath)">
              设置文件地址
            </a-button>
          </a-space>
          <br /><br />
          toolsPath路径：{{ toolsPath }}
          <a-space>
            <a-button size="small" @click="f_openPath(toolsPath)">打开文进路径</a-button>
            <!--          <a-button size="small" @click="f_removePath(toolsPath)">删除文件路径</a-button> -->
            <a-button size="small" @click="setConfigFilePath(MOD_TOOLS_PATH, toolsPath)">
              设置文件地址
            </a-button>
            <a-button
              size="small"
              @click="f_openUrl('https://github.com/LeagueToolkit/cslol-manager')"
            >
              打开url地址
            </a-button>
          </a-space>
        </a-tab-pane>
        <a-tab-pane key="debug" tab="其他">
          lcuState：{{ lcuState }}<span m-l-4 m-r-4>isUseCommand:</span>
          <a-switch v-model:checked="isUseCommand" @change="f_setIsUseCommand($event)"></a-switch>
          <br /><br />
          <a-space>
            <a-button size="small" danger @click="f_shoutDownModTools()">
              停止注入[{{ modToolsState }}]
            </a-button>
            <a-button size="small" @click="testSlideWin">测试侧边弹窗</a-button>
            <a-button size="small" @click="testNotify">测试通知</a-button>
          </a-space>
        </a-tab-pane>
        <a-tab-pane key="locale" tab="语言自动修复">
          <div style="border: 1px solid #e5e5e5; border-radius: 6px; padding: 12px">
            <h3 style="margin: 0 0 8px">语言自动修复</h3>
            <div style="font-size: 12px; color: #999; margin-bottom: 8px">
              监听 Riot 语言配置文件，游戏更新恢复默认语言时自动改回所选语言。
            </div>
            启用监听：
            <a-switch
              v-model:checked="localeWatcherEnabled"
              @change="handleLocaleWatcherToggle"
            ></a-switch>
            <span v-if="localeWatcherState?.enabled" style="color: #52c41a; margin-left: 8px">
              监听中
            </span>
            <span
              v-if="
                localeWatcherState?.currentLocale &&
                localeWatcherState?.currentLocale !== localeWatcherLocale
              "
              style="color: #faad14; margin-left: 8px"
            >
              当前文件语言：{{ localeWatcherState.currentLocale }}
            </span>
            <br /><br />
            目标语言：
            <a-select
              v-model:value="localeWatcherLocale"
              style="width: 220px"
              :options="localeOptions"
              :disabled="!localeWatcherEnabled"
              @change="handleLocaleChange"
            ></a-select>
            <br /><br />
            配置文件：{{ localeWatcherFile || '（未设置）' }}
            <a-space>
              <a-button size="small" @click="handleDetectLocaleConfig">自动检测</a-button>
              <a-button size="small" @click="handleChooseLocaleConfig">手动选择</a-button>
              <a-button
                v-if="localeWatcherFile"
                size="small"
                @click="f_openPath(localeWatcherFile)"
              >
                打开所在目录
              </a-button>
            </a-space>
          </div>
        </a-tab-pane>
      </a-tabs>
    </div>
  </a-drawer>
</template>
<script setup lang="ts">
  import { useRoute } from 'vue-router';
  import { message } from 'ant-design-vue';
  import { computed, onMounted, ref } from 'vue';
  import {
    GAME_PATH,
    HERO_SKIN,
    INSTALLED_PATH,
    MOD_TOOLS_PATH,
    OVERLAY_CONFIG_PATH,
    OVERLAY_PATH,
    SCREENSHOT_PATH,
    SKIN_PATH,
  } from '@ghs/constant';
  import { watch, watchEffect } from 'vue-demi';
  import useFeature from '@/view/hook/use-feature';
  import useGlobalState from '@/hooks/use-global-state';
  import {
    f_checkCanAutoConfirm,
    f_confirmChoseSkin,
    f_detectLocaleConfigFile,
    f_getGamePath,
    f_getLocaleCodes,
    f_getLocaleWatcherState,
    f_getSkinSyncState,
    f_importLeagueSkinsPackage,
    f_loadSkinDataByFilePath,
    f_loadSkinDataIdName,
    f_openPath,
    f_openUrl,
    f_removePath,
    f_requestHtmlByWindows,
    f_request_string_get,
    f_selectPathOrFile,
    f_setConfig,
    f_setIsUseCommand,
    f_setMultiKillCaptureDebug,
    f_setMultiKillCaptureDelay,
    f_setMultiKillCaptureEnabled,
    f_setMultiKillCaptureWindow,
    f_setSkinSyncSettings,
    f_shoutDownModTools,
    f_startLocaleWatcher,
    f_stopLocaleWatcher,
    f_syncSkinsNow,
    f_testSkinSyncProxy,
    f_winGetData,
  } from '@/utils/business';
  import { showFrontendConfirm } from '@/utils/kit-utils';
  import bus from '@/utils/bus';

  const route = useRoute();
  const SKIN_DEFAULT_SUFFIX_CONFIG_KEY = 'SKIN_DEFAULT_SUFFIX';
  const {
    skinPath,
    skinDefaultSuffix,
    screenshotPath,
    multiKillCaptureEnabled,
    multiKillCaptureDelay,
    multiKillCaptureWindow,
    multiKillCaptureDebug,
    gamePath,
    toolsPath,
    overlayPath,
    overlayConfigPath,
    installedPath,
    lcuState,
    logDrawOpen,
    modToolsState,
    isUseCommand,
  } = useGlobalState();
  const { handleDrawOpen, drawerOpen, loadFilePath } = useFeature();
  const importLeagueSkinsLoading = ref(false);
  const activeTab = ref('skin');
  const testSlideWin = () => {
    f_checkCanAutoConfirm({
      title: '提示',
      msg: '是否确认删除此文件？',
      src: 'https://game.gtimg.cn/images/lol/act/img/skin/big_46358cd4-3f36-4987-9db8-aab046adf43f.jpg',
      showBtn: true,
      height: 250,
      delay: 3000,
    });
  };
  const testNotify = () => {
    f_checkCanAutoConfirm({
      title: '提示',
      msg: '是否确认删除此文件？',
      height: 80,
      delay: 3000,
    });
  };
  const setConfigPath = async (key: string, dpath) => {
    const path = await f_selectPathOrFile('openDirectory', dpath);
    await f_setConfig(key, path);
    await loadFilePath();
  };
  const setConfigFilePath = async (key: string, dpath) => {
    const path = await f_selectPathOrFile('openFile', dpath);
    await f_setConfig(key, path);
    await loadFilePath();
  };
  const setSkinDefaultSuffix = async () => {
    await f_setConfig(SKIN_DEFAULT_SUFFIX_CONFIG_KEY, skinDefaultSuffix.value);
    await loadFilePath();
    message.success('设置成功');
  };
  const setScreenshotPath = async () => {
    const path = await f_selectPathOrFile('openDirectory', screenshotPath.value);
    if (!path) {
      return;
    }
    await f_setConfig(SCREENSHOT_PATH, path);
    await loadFilePath();
    message.success('截图保存路径设置成功');
  };
  const setMultiKillCapture = async () => {
    multiKillCaptureDelay.value = await f_setMultiKillCaptureDelay(multiKillCaptureDelay.value);
    multiKillCaptureWindow.value = await f_setMultiKillCaptureWindow(multiKillCaptureWindow.value);
    message.success('多杀截图时机设置成功');
  };
  const handleMultiKillCaptureToggle = async (checked: boolean) => {
    multiKillCaptureEnabled.value = await f_setMultiKillCaptureEnabled(checked);
    message.success(checked ? '已开启多杀自动截图' : '已关闭多杀自动截图');
  };
  const setMultiKillCaptureDebug = async (checked: boolean) => {
    multiKillCaptureDebug.value = await f_setMultiKillCaptureDebug(checked);
    message.success(checked ? '已开启：每帧都会保存' : '已关闭调试模式');
  };
  const handleImportLeagueSkinsPackage = async () => {
    logDrawOpen.value = true;
    importLeagueSkinsLoading.value = true;
    try {
      await f_importLeagueSkinsPackage();
    } finally {
      importLeagueSkinsLoading.value = false;
    }
  };
  // ===================== 皮肤自动同步 =====================
  const skinSyncState = ref<any>(null);
  const skinSyncEnabled = ref(true);
  const skinSyncProxy = ref('http://127.0.0.1:10808');
  const skinSyncInterval = ref(30);
  const skinSyncMissingOnly = ref(true);
  const skinSyncRunning = ref(false);
  const skinSyncStatusText = computed(() => {
    const state = skinSyncState.value;
    if (!state) {
      return '未加载';
    }
    if (state.running || skinSyncRunning.value) {
      return '正在同步…';
    }
    const last = state.lastRun;
    if (!last) {
      if (!state.settings?.enabled) {
        return '自动同步已关闭';
      }
      return `等待检查（${
        state.nextCheckAt ? new Date(state.nextCheckAt).toLocaleTimeString() : '未排期'
      }）`;
    }
    const time = last.finishedAt ? new Date(last.finishedAt).toLocaleString() : '';
    if (!last.ok) {
      return `上次失败（${time}）：${last.error || '未知错误'}`;
    }
    const localChanged = last.localChanged ? `，其中本地改动还原 ${last.localChanged}` : '';
    return `上次检查（${time}）：下载 ${last.downloaded}${localChanged}，认领 ${last.adopted}，失败 ${last.failed}`;
  });
  const refreshSkinSync = async () => {
    skinSyncState.value = await f_getSkinSyncState();
    const settings = skinSyncState.value?.settings;
    if (settings) {
      skinSyncEnabled.value = !!settings.enabled;
      skinSyncProxy.value = settings.proxy ?? '';
      skinSyncInterval.value = Number(settings.intervalMin) || 30;
      skinSyncMissingOnly.value = settings.missingOnly !== false;
    }
    skinSyncRunning.value = !!skinSyncState.value?.running;
  };
  const saveSkinSyncSettings = async () => {
    skinSyncState.value = await f_setSkinSyncSettings({
      enabled: skinSyncEnabled.value,
      proxy: skinSyncProxy.value,
      intervalMin: skinSyncInterval.value,
      missingOnly: skinSyncMissingOnly.value,
    });
    message.success('皮肤同步设置已保存');
  };
  const handleTestSkinSyncProxy = async () => {
    const result = await f_testSkinSyncProxy();
    if (result?.ok) {
      message.success(`代理正常：清单 ${result.entries} 条，${result.ms} ms`);
    } else {
      message.error(`代理/清单测试失败：${result?.error || '未知错误'}`);
    }
  };
  const handleSyncSkinsNow = async () => {
    if (skinSyncRunning.value) {
      return;
    }
    skinSyncRunning.value = true;
    logDrawOpen.value = true;
    try {
      const result = await f_syncSkinsNow(false);
      if (result?.ok) {
        message.success(
          `同步完成：下载 ${result.downloaded}，认领 ${result.adopted}，失败 ${result.failed}`
        );
      } else {
        message.error(`同步失败：${result?.error || '未知错误'}`);
      }
    } finally {
      skinSyncRunning.value = false;
      await refreshSkinSync();
    }
  };
  const chuckValue = ref(20);
  const handleLoadAllSkinData = async () => {
    showFrontendConfirm('生成全部皮肤数据?').then(() => {
      f_loadSkinDataIdName(chuckValue.value);
      logDrawOpen.value = true;
    });
  };
  // ===================== 语言自动修复 =====================
  const localeWatcherState = ref<any>(null);
  const localeWatcherEnabled = ref(false);
  const localeWatcherLocale = ref('zh_CN');
  const localeWatcherFile = ref('');
  const localeOptions = ref<{ label: string; value: string }[]>([]);

  const refreshLocaleWatcher = async () => {
    localeWatcherState.value = await f_getLocaleWatcherState();
    localeWatcherEnabled.value = !!localeWatcherState.value?.enabled;
    localeWatcherLocale.value = localeWatcherState.value?.locale || 'zh_CN';
    localeWatcherFile.value = localeWatcherState.value?.file || '';
  };
  const handleLocaleWatcherToggle = async (checked: boolean) => {
    try {
      if (checked) {
        await f_startLocaleWatcher({
          filePath: localeWatcherFile.value || undefined,
          locale: localeWatcherLocale.value,
        });
        message.success('已开始语言自动修复');
      } else {
        await f_stopLocaleWatcher();
        message.success('已停止语言自动修复');
      }
    } finally {
      await refreshLocaleWatcher();
    }
  };
  const handleLocaleChange = async (locale: string) => {
    if (localeWatcherEnabled.value) {
      await f_startLocaleWatcher({
        filePath: localeWatcherFile.value || undefined,
        locale,
      });
      message.success('语言设置已更新');
    }
    await refreshLocaleWatcher();
  };
  const handleDetectLocaleConfig = async () => {
    const files = await f_detectLocaleConfigFile();
    if (!files || files.length === 0) {
      message.warning('未检测到英雄联盟语言配置文件');
      return;
    }
    localeWatcherFile.value = files[0];
    await f_startLocaleWatcher({
      filePath: files[0],
      locale: localeWatcherLocale.value,
    });
    await refreshLocaleWatcher();
    message.success(`已自动检测到配置文件并开始监听`);
  };
  const handleChooseLocaleConfig = async () => {
    const path = await f_selectPathOrFile('openFile', localeWatcherFile.value);
    if (!path) {
      return;
    }
    localeWatcherFile.value = path;
    await f_startLocaleWatcher({
      filePath: path,
      locale: localeWatcherLocale.value,
    });
    await refreshLocaleWatcher();
    message.success('配置文件设置成功');
  };
  watchEffect(() => {
    if (drawerOpen.value) {
      refreshLocaleWatcher();
      refreshSkinSync();
    }
  });
  onMounted(async () => {
    localeOptions.value = Object.entries(await f_getLocaleCodes()).map(([value, label]) => ({
      label,
      value,
    }));
    await refreshLocaleWatcher();
    await refreshSkinSync();
    document.addEventListener('keydown', function (event) {
      if (event.ctrlKey && event.key === 'w') {
        drawerOpen.value = !drawerOpen.value;
      }
    });
    bus.on('open-set', () => {
      drawerOpen.value = true;
    });
  });
</script>

<style scoped lang="less"></style>
