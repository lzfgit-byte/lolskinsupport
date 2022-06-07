<template>
  <div class="back" @click="back">
    <span>返回</span>
  </div>
  <div class="container" align="center">
    <div class="big">
      <img :src="bigImg" />
      <div class="skinName">{{ bigImgName }}</div>
    </div>
    <div class="more" ref="moreRef" @wheel="handlerWheel">
      <img
        width="168"
        :class="{ chose: +item.skinId.substring(item.skinId.length - 2) === choseId }"
        v-for="item in allSkins"
        :key="item"
        :src="item.mainImg"
        @click="preSkin(item)"
        :title="item.description"
      />
    </div>
  </div>
  <div class="confirm" @click="confirm_">
    <span>确定</span>
  </div>
</template>

<script setup lang="ts">
  import http from '../utils/http';
  import { heroInfo, skinInfo } from '../type/type';
  import { defineProps, ref } from 'vue';
  import fs from 'fs-extra';
  import ini from 'ini';
  import execuExe from '../utils/execuExe';
  const props = defineProps({ heroId: String });
  const emits = defineEmits(['back']);
  const bigImg = ref();
  const REQ_URL = `https://game.gtimg.cn/images/lol/act/img/js/hero/${props?.heroId}.js`;
  const allSkins = ref<skinInfo[]>();
  const bigImgName = ref('');
  let heroInfo$: heroInfo;
  const choseId = ref();
  //读取配置文件
  const path = 'C:\\Fraps\\data\\My\\Config.ini';
  var config = ini.parse(fs.readFileSync(path, 'utf-8'));
  http.axios.get(REQ_URL).then((res: any) => {
    heroInfo$ = res.hero;
    allSkins.value = res.skins.filter((item) => item.mainImg);
    bigImg.value = allSkins.value[0].mainImg;
    choseId.value = parseInt(config['SKIN_CHAMPION_ACTIVED'][heroInfo$.alias] || 0);
    res.skins.filter((item) => {
      if (choseId.value === +item.skinId.substring(item.skinId.length - 2)) {
        bigImg.value = item.mainImg;
        bigImgName.value = item.name;
      }
    });
  });
  const moreRef = ref();
  const handlerWheel = ($event) => {
    (moreRef.value.scrollLeft as any) += $event.deltaY;
  };
  let pickId;
  const preSkin = (item: skinInfo) => {
    bigImgName.value = item.name;
    bigImg.value = item.mainImg;
    pickId = parseInt(item.skinId.substring(item.skinId.length - 2));
    config['SKIN_CHAMPION_ACTIVED'][heroInfo$.alias] = pickId + '';
    choseId.value = +pickId;
  };
  const back = () => {
    emits('back');
  };
  const confirm_ = () => {
    if (!pickId && pickId !== 0) {
      alert('未选择皮肤');
      return;
    }
    fs.writeFileSync(path, ini.stringify(config));
    alert('设置成功');
    // execuExe.execuFuc();
  };
</script>

<style scoped lang="less">
  .back {
    position: absolute;
    display: flex;
    color: #ffffff;
    width: 200px;
    height: 75px;
    left: 10px;
    top: 10px;
    z-index: 3;
    cursor: pointer;
  }
  .confirm {
    position: absolute;
    display: flex;
    color: #ffffff;
    width: 200px;
    height: 75px;
    right: -146px;
    top: 10px;
    z-index: 3;
    cursor: pointer;
  }
  .container {
    width: 98%;
    height: auto;
    .big {
      width: auto;
      height: 60%;
      position: relative;
      img {
        width: 100%;
      }
      margin-bottom: 30px;
      .skinName {
        color: #fff5e0;
        position: absolute;
        bottom: 10px;
        left: 10px;
      }
    }
    .more {
      display: flex;
      overflow: auto;
      height: 40%;
      transition: all 0.5s;
      &::-webkit-scrollbar {
        height: 10px;
      }
      img {
        margin-left: 10px;
        margin-right: 10px;
        cursor: pointer;
        box-sizing: border-box;
      }
      .chose {
        border: 3px solid #518a30ff;
      }
    }
  }
</style>
