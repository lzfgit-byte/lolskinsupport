<template>
    <img v-for="item in mainIMg" :src="BASE_URL + item.heroId + '000.jpg'">
</template>

<script setup lang="ts">
//https://game.gtimg.cn/images/lol/act/img/js/heroList/hero_list.js//所有英雄列表
//https://game.gtimg.cn/images/lol/act/img/skinloading/1000.jpg  头像
import http from "../utils/http";
import {heroInfo, mainHeroInfo, skinInfo} from "../type/type";
import {ref} from "vue";
const imgs = ref<skinInfo[]>()
const mainIMg = ref<mainHeroInfo[]>()

const BASE_URL = 'https://game.gtimg.cn/images/lol/act/img/skinloading/'
// axios.get('https://game.gtimg.cn/images/lol/act/img/js/hero/3.js').then((res:any)=>{
//     const res_:heroInfo = res;
//     imgs.value = res_.skins
// })
http.axios.get('https://game.gtimg.cn/images/lol/act/img/js/heroList/hero_list.js').then((res:any)=>{
    const res_:mainHeroInfo[] = res.hero;
    mainIMg.value = res_
})
</script>

<style scoped lang="less"></style>
