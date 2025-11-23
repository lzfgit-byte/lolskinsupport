<template>
  <div h-full w-full flex justify-center items-center>
    <a-button @click="setDbPath">设置dbpath</a-button>
  </div>
</template>
<script setup lang="ts">
  import { f_appSetDbDir } from '@/utils/business';

  const setDbPath = async () => {
    const fileInput: HTMLInputElement = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.db';
    fileInput.addEventListener('change', function () {
      let selectedFile = fileInput.files[0];
      const path = selectedFile.path;
      f_appSetDbDir(path);
    });
    fileInput.click();
  };
</script>

<style scoped lang="less"></style>
