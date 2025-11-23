<template>
  <div :id="gKey" flex w-full m-2 :title="datetime">
    <a-tooltip placement="top" :get-popup-container="getPopupContainer">
      <template #title>
        <span>{{ datetime }}</span>
      </template>
      <div p-2 style="box-shadow: rgba(0, 0, 0, 0.15) 0px 2px 8px; border-radius: 8px">
        {{ comment }}
      </div>
    </a-tooltip>
  </div>
</template>
<script setup lang="ts">
  import { generateKey } from '@ilzf/utils';

  defineProps({ datetime: String, comment: String });
  const gKey = generateKey();
  const getPopupContainer = () => document.getElementById(gKey);
</script>

<style scoped lang="less"></style>
