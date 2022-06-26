<template>
  <div class="back" @click="back">
    <span>返回</span>
  </div>
  <div class="container" align="center">
    <div class="big">
      <img :src="bigImg" />
      <div class="skinName">{{ bigImgName }}</div>
    </div>
    <div class="showChild" @click="visible = true" v-if="showClor"></div>
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
  <modal v-model:visible="visible" title="炫彩" @ok="visible = false" wrap-class-name="modal-skin">
    <div class="childSkin">
      <img
        width="25"
        v-for="item in skinChild"
        :class="{ chose: +item.skinId.substring(item.skinId.length - 2) === choseId }"
        :src="item.chromaImg"
        :key="item"
        @click="preSkin(item)"
        :title="item.name"
      />
    </div>
  </modal>
</template>

<script setup lang="ts">
  import http from '@/utils/http';
  import { heroInfo, skinInfo } from '@/type/type';
  import { defineProps, ref } from 'vue';
  import fs from 'fs-extra';
  import ini from 'ini';
  import execuExe from '@/utils/execuExe';
  import { message, Modal } from 'ant-design-vue';
  import path$ from 'path';
  import { ConfigIni } from '@/utils/setting';

  const visible = ref(false);
  const props = defineProps({ heroId: String });
  const emits = defineEmits(['back']);
  const bigImg = ref();
  const REQ_URL = `https://game.gtimg.cn/images/lol/act/img/js/hero/${props?.heroId}.js`;
  const allSkins = ref<skinInfo[]>();
  const bigImgName = ref('');
  let heroInfo$: heroInfo;
  let skins_: skinInfo[];
  const choseId = ref();
  //读取配置文件
  const path = 'C:\\Fraps\\data\\My\\Config.ini';
  const exist = fs.existsSync(path);
  if (!exist) {
    fs.writeFileSync(path, ConfigIni, { encoding: 'utf-8' });
  }
  var config = ini.parse(fs.readFileSync(path, 'utf-8'));
  http.axios.get(REQ_URL).then((res: any) => {
    heroInfo$ = res.hero;
    skins_ = res.skins;
    allSkins.value = res.skins.filter((item) => item.mainImg);
    bigImg.value = allSkins.value[0].mainImg;
    choseId.value = parseInt(config['SKIN_CHAMPION_ACTIVED'][heroInfo$.alias] || 0);
    pickId = choseId.value;
    res.skins.filter((item) => {
      if (choseId.value === +item.skinId.substring(item.skinId.length - 2)) {
        bigImg.value = item.mainImg || getParent(item).mainImg;
        if (item.chromasBelongId !== '0') {
          const parentId = getParent(item).skinId;
          choseId.value = parseInt(parentId.substring(parentId.length - 2));
          skinChild.value = getColorfulSkin(parentId);
          showClor.value = true;
        }
        bigImgName.value = item.name;
      }
    });
  });
  const getParent = (item): skinInfo => {
    return skins_.filter((item_) => item_.skinId === item.chromasBelongId)[0];
  };
  const moreRef = ref();
  const handlerWheel = ($event) => {
    (moreRef.value.scrollLeft as any) += $event.deltaY;
  };
  let pickId;
  const skinChild = ref<skinInfo[]>();
  const showClor = ref(false);
  const preSkin = (item: skinInfo) => {
    if (item.chromasBelongId !== '0') {
      const parentSkin = getParent(item);
      bigImgName.value = item.name;
      bigImg.value = parentSkin.mainImg;
    } else {
      showClor.value = false;
      bigImgName.value = item.name;
      bigImg.value = item.mainImg;
      skinChild.value = getColorfulSkin(item.skinId);
      showClor.value = skinChild.value.length > 0;
    }
    pickId = parseInt(item.skinId.substring(item.skinId.length - 2));
    config['SKIN_CHAMPION_ACTIVED'][heroInfo$.alias] = pickId + '';
    choseId.value = +pickId;
  };
  const getColorfulSkin = (skinId) => {
    return skins_.filter((item) => item.chromasBelongId === skinId);
  };
  const back = () => {
    emits('back');
  };
  const confirm_ = () => {
    if (!pickId && pickId !== 0) {
      message.warn('未选择皮肤');
      return;
    }
    fs.writeFileSync(path, ini.stringify(config));
    let cmdStr1 = 'start /min C:\\Fraps\\LOLPRO.exe';
    const FIND_LOL_PRO = 'tasklist | find /i "LOLPRO.exe"';
    execuExe.execuFuc(FIND_LOL_PRO).then((res) => {
      if (+res === 0) {
        message.success('设置成功');
      } else {
        execuExe.execuFuc(cmdStr1).then((res) => {
          message.success('设置成功');
        });
      }
    });
  };
</script>
<style lang="less">
  @colorTheme: #1b2128;
  .modal-skin {
    .ant-modal-content {
      background-color: @colorTheme;
    }
    .ant-modal-header {
      background-color: @colorTheme;
      .ant-modal-title {
        color: #fff;
      }
      border-bottom: 1px solid #518a30ff;
    }
    .ant-modal-footer {
      border-top: 1px solid #518a30ff;
    }
    .ant-btn {
      background-color: @colorTheme;
      color: #fff;
      border-color: #518a30ff;
    }
  }
</style>
<style scoped lang="less">
  .btn_ {
    display: flex;
    justify-content: center;
    align-items: center;
    background-color: #1b2128;
    border: 1px solid #518a30ff;
    width: 68px;
    height: 30px;
    color: #ffffff;
  }
  .showChild {
    position: absolute;
    background-color: #fff5e0;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    left: 50%;
    top: 81%;
    z-index: 9;
    cursor: pointer;
  }
  .back {
    position: absolute;
    .btn_();
    left: 10px;
    top: 10px;
    z-index: 3;
    cursor: pointer;
  }
  .confirm {
    position: absolute;
    .btn_();
    right: 20px;
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
      .skinName {
        color: #fff5e0;
        position: absolute;
        bottom: 10px;
        left: 10px;
      }
    }
    .more {
      display: flex;
      position: relative;
      overflow: auto;
      height: 40%;
      margin-top: 30px;
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
  .childSkin {
    img {
      margin: 10px;
      cursor: pointer;
      width: 125px;
      border: 1px solid rgba(255, 255, 255, 0.42);
    }
    .chose {
      border: 3px solid #518a30ff;
    }
  }
</style>
