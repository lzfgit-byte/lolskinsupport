<template>
  <a-drawer
    v-model:open="drawerOpen"
    placement="right"
    width="90vw"
    :header-style="{ display: 'none' }"
    :force-render="true"
  >
    <a-row>
      <a-col :span="24">
        <a-input v-model:value="currentKey" :disabled="isEdit"></a-input>
      </a-col>
    </a-row>
    <div h-full w-full>
      <MonacoEditor v-model="currentCode"></MonacoEditor>
    </div>
    <template #footer>
      <div h-full w-full flex justify-end items-center>
        <a-space>
          <a-button size="small" type="primary" @click="handleLoadCode">加载数据库代码</a-button>
          <a-button size="small" type="primary" @click="handleSaveCode">保存代码</a-button>
        </a-space>
      </div>
    </template>
  </a-drawer>
</template>
<script setup lang="ts">
  import { onActivated, onMounted, onUnmounted, ref } from 'vue';
  import { base64ToStr, isFalsity, strToBase64 } from '@ilzf/utils';
  import { message } from 'ant-design-vue';
  import { preBreak } from '@ghs/constant';
  import { onDeactivated } from 'vue-demi';
  import MonacoEditor from '@/components/monacoEditor/monaco-editor.vue';
  import useGlobalState from '@/hooks/use-global-state';
  import { f_getWebConfigCode, f_saveWebConfigCode } from '@/utils/business';
  import { defaultWebConfig, preConfigCode } from '@/view/hook/pre-config-code';
  const { currentCode, allWebKeys, init } = useGlobalState();
  const drawerOpen = ref(false);
  const isEdit = ref(false);
  const loadCode = async (key: string) => {
    const code = await f_getWebConfigCode(key);
    if (code) {
      currentCode.value = `${preConfigCode}\n${preBreak}${base64ToStr(code)}`;
    }
  };
  const saveCode = async (key: string) => {
    if (!isEdit.value && allWebKeys.value.includes(key)) {
      message.warn('新增时key不能与已有的重复');
      return;
    }
    let code = currentCode.value;
    const codes = code.split(preBreak);
    if (codes.length === 2) {
      code = codes[1];
    }
    if (isFalsity(code.trim())) {
      message.warn('存储的代码不能为空');
      return;
    }
    await f_saveWebConfigCode(key, strToBase64(code));
  };
  const currentKey = ref();
  const handleSaveCode = async () => {
    if (currentKey.value) {
      await saveCode(currentKey.value);
      await init();
    } else {
      message.warn('key为空');
    }
  };
  const handleLoadCode = async () => {
    await loadCode(currentKey.value);
    message.success('加载远程数据库成功');
  };
  onMounted(() => {
    document.addEventListener('keydown', function (event) {
      if (event.ctrlKey && event.key === 's' && drawerOpen.value) {
        handleSaveCode();
      }
    });
  });

  defineExpose({
    add: async (key: string) => {
      currentCode.value = `${preConfigCode}${preBreak}${defaultWebConfig}`;
      drawerOpen.value = true;
      currentKey.value = key;
      isEdit.value = false;
    },
    edit: async (key: string) => {
      currentCode.value = '';
      currentKey.value = key;
      drawerOpen.value = true;
      await loadCode(key);
      isEdit.value = true;
    },
  });
</script>

<style scoped lang="less"></style>
