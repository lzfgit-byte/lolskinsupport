<template>
  <div h-full w-full>
    <a-row>
      <a-col>
        <a-button @click="choseDbPath">选择dbPath</a-button>
      </a-col>
      <a-col :span="16" :offset="1">
        <a-form-item label="dbPath">
          {{ dbPath }}
        </a-form-item>
      </a-col>
    </a-row>
    <a-row>
      <a-col>
        <a-space>
          <a-button @click="handleImport">收藏导入</a-button>
          <a-button @click="handleExport">收藏导出</a-button>
        </a-space>
      </a-col>
    </a-row>
    <a-card>
      <a-row>
        <a-col :span="24">
          <a-textarea v-model:value="videoUrl" auto-size></a-textarea>
        </a-col>
      </a-row>
      <a-row>
        <a-col :span="24">
          <a-space>
            <a-button @click="playM3u8">播放m3u8</a-button>
            <a-button @click="playMp4">播放mp4</a-button>
          </a-space>
        </a-col>
      </a-row>
    </a-card>
    <a-card title="移动文件">
      <template #extra>
        <a-button @click="handleMoveFile">移动文件</a-button>
      </template>
      <a-row>
        <a-col :span="4"> 源地址 </a-col>
        <a-col :span="18">
          <a-input v-model:value="sourceDir" auto-size placeholder="url"></a-input>
        </a-col>
      </a-row>
      <a-row>
        <a-col :span="4"> 目标地址 </a-col>
        <a-col :span="18">
          <a-input v-model:value="targetDir" auto-size placeholder="url"></a-input>
        </a-col>
      </a-row>
      <a-row>
        <a-col :span="4"> 关键字 </a-col>
        <a-col :span="18">
          <a-input v-model:value="keyword" auto-size placeholder="url"></a-input>
        </a-col>
      </a-row>
    </a-card>
    <a-card title="执行js">
      <template #extra>
        <a-button @click="executeJS">执行js</a-button>
      </template>
      <a-row>
        <a-col :span="24">
          <a-input v-model:value="executeUrl" auto-size placeholder="url"></a-input>
        </a-col>
      </a-row>
      <a-row>
        <a-col :span="24">
          <a-textarea v-model:value="executeCode" auto-size placeholder="code"></a-textarea>
        </a-col>
      </a-row>
      <a-row>
        <a-col :span="24">
          <a-textarea v-model:value="executeRes" auto-size></a-textarea>
        </a-col>
      </a-row>
    </a-card>
    <a-card style="height: 300px">
      <template #title>加载图片</template>
      <template #extra>
        <a-button size="small" @click="handleLoadImg">加载图片</a-button>
      </template>
      <a-row>
        <a-col :span="24">
          <a-input v-model:value="imgUrl"></a-input>
        </a-col>
      </a-row>
      <a-row>
        <a-col :span="24">
          <a-input :value="hashString(imgUrl)"></a-input>
        </a-col>
      </a-row>
      <a-row>
        <a-col :span="12">
          <a-textarea
            v-model:value="base64Text"
            placeholder=""
            :auto-size="{ minRows: 2, maxRows: 6 }"
          />
        </a-col>
        <a-col :span="12">
          <img v-if="base64Text" :key="base64Text" :src="base64Text" alt="" height="177px" />
        </a-col>
      </a-row>
    </a-card>
    <a-card>
      <template #extra>
        <a-space>
          <a-button size="small" @click="handleSave">保存设置</a-button>
          <a-button size="small" @click="restartApp">重启应用</a-button>
        </a-space>
      </template>
      <a-row v-for="item in systemConfigs" :key="item.id">
        <a-col :span="24">
          <a-form-item :label="item.name">
            <a-input
              v-model:value="configFormData[item.name]"
              :disabled="item.name === 'dbVersion'"
            ></a-input>
          </a-form-item>
        </a-col>
      </a-row>
    </a-card>
    <a-card>
      <div flex>
        <div v-for="item in ips" :key="item">
          <a-qrcode :value="item" />
          {{ item }}
        </div>
      </div>
    </a-card>
  </div>
</template>
<script setup lang="ts">
  import { onMounted, ref } from 'vue';
  import { hashString, isFalsity } from '@ilzf/utils';
  import { QRCode, message } from 'ant-design-vue';
  import { reactive, watchEffect } from 'vue-demi';
  import { forIn, keys } from 'lodash';
  import useGlobalState from '@/hooks/use-global-state';
  import {
    f_executeJs,
    f_getImage,
    f_getServers,
    f_importFavorite,
    f_pluginGetMove,
    f_pluginMoveFiles,
    f_restartAPP,
    f_updateSystemConfig,
  } from '@/utils/business';
  import useGlobalRef from '@/hooks/use-global-ref';

  defineProps({ choseDbPath: Function });
  const { dbPath, systemConfigs } = useGlobalState();
  const { videoGlobalRef } = useGlobalRef();
  const handleImport = () => {
    const fileInput: HTMLInputElement = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.ghs';
    fileInput.addEventListener('change', function () {
      let selectedFile = fileInput.files[0];
      const path = selectedFile.path;
      f_importFavorite(path);
    });
    fileInput.click();
  };
  const handleExport = () => {};
  // 视频
  const videoUrl = ref('');
  const playM3u8 = () => {
    if (isFalsity(videoUrl.value)) {
      message.warn('地址为空');
      return;
    }
    videoGlobalRef.value.show(videoUrl.value, '测试', 'm3u8');
  };
  const playMp4 = () => {
    if (isFalsity(videoUrl.value)) {
      message.warn('地址为空');
      return;
    }
    videoGlobalRef.value.show(videoUrl.value, '测试', 'mp4');
  };

  const configFormData = reactive({});
  watchEffect(() => {
    if (systemConfigs.value?.length > 0) {
      systemConfigs.value.forEach((item) => {
        configFormData[item.name] = item.value;
      });
    }
  });
  const handleSave = () => {
    forIn(configFormData, (value, key) => {
      f_updateSystemConfig(key, value);
    });
    message.success('更新成功');
  };
  const restartApp = () => {
    f_restartAPP();
  };
  // 图片测试
  const imgUrl = ref('');
  const base64Text = ref();
  const handleLoadImg = async () => {
    if (imgUrl.value) {
      base64Text.value = await f_getImage(imgUrl.value);
      return;
    }
    message.warn('url不能为空');
  };
  // ip
  const ips = ref<string[]>();
  const getIps = async () => {
    ips.value = await f_getServers();
  };
  getIps();
  // 执行js
  const executeUrl = ref('');
  const executeCode = ref('');
  const executeRes = ref('');
  const executeJS = async () => {
    executeRes.value = await f_executeJs(executeUrl.value, executeCode.value);
  };
  /**
   * 测试
   */
  const sourceDir = ref();
  const targetDir = ref();
  const keyword = ref();
  const handleMoveFile = () => {
    f_pluginMoveFiles(keyword.value, sourceDir.value, targetDir.value);
  };
  onMounted(() => {
    f_pluginGetMove().then((res) => {
      sourceDir.value = res.defaultSourceDir;
      targetDir.value = res.defaultTargetDir;
    });
  });
</script>

<style scoped lang="less"></style>
