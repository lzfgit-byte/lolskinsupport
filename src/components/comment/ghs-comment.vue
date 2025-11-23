<template>
  <div :id="gKey" flex w-full m-2 :title="datetime">
    <a-tooltip placement="top" :get-popup-container="getPopupContainer">
      <template v-if="datetime" #title>
        <span>{{ datetime }}</span>
      </template>
      <div p-2 style="box-shadow: rgba(0, 0, 0, 0.15) 0px 2px 8px; border-radius: 8px">
        {{ comment }}
        <GhsImgPlain v-if="image && image.length > 0" style="width: 50%" :url="image"></GhsImgPlain>
      </div>
    </a-tooltip>
  </div>
</template>
<script setup lang="ts">
  import { generateKey } from '@ilzf/utils';
  import GhsImgPlain from 'test-table/src/components/image/ghs-img-plain.vue';

  defineProps({ datetime: String, comment: String, image: String });
  const gKey = generateKey();
  const getPopupContainer = () => document.getElementById(gKey);
</script>

<style scoped lang="less"></style>
