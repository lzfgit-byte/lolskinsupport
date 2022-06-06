<template>
  <div class="container" @click="handlerClick">
    <img :src="BASE_URL + heroId + '000.jpg'" />
    <div class="titleContainer">
      <span>{{ title }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { defineProps } from 'vue';
  const BASE_URL = 'https://game.gtimg.cn/images/lol/act/img/skinloading/';
  const props = defineProps({
    heroId: String,
    title: String,
  });
  const emits = defineEmits(['clickHero']);
  const handlerClick = () => {
    emits('clickHero', props?.heroId);
  };
</script>

<style scoped lang="less">
  .container {
    display: inline-block;
    margin: 10px;
    height: 275px;
    width: 215px;
    position: relative;
    overflow: hidden;
    cursor: pointer;
    border: 1px solid #313e4c;
    img {
      width: 215px;
      object-fit: cover;
      object-position: center top;
    }
    .titleContainer {
      position: absolute;
      width: 100%;
      height: 55px;
      bottom: 0;
      z-index: 1;
      background-color: #111419;
      display: flex;
      justify-content: center;
      align-items: center;
      span {
        color: #fff5e0;
      }
    }
  }
</style>
