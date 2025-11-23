<template>
  <div h-full w-full box-border pos-relative>
    <div class="back" @click="back">
      <span>返回</span>
    </div>
    <div class="confirm" @click="confirm_">
      <span>确定</span>
    </div>
    <div class="skin-container" h-full w-full pos-relative box-border>
      <div class="skin-more">
        <div v-for="item in allSkins" :key="item.skinId" style="padding: 10px; position: relative">
          <img width="168" :src="item.mainImg" :title="item.description" @click="preSkin(item)" />
          <div class="skinName">{{ item.name }}</div>
        </div>
      </div>
      <div class="big">
        <img :src="bigImg" />
        <div class="skinName">{{ bigImgName }}</div>
      </div>
      <div v-if="showClor" class="showChild" @click="visible = true"></div>
    </div>

    <Modal
      v-model:visible="visible"
      title="炫彩"
      wrap-class-name="modal-skin"
      @ok="visible = false"
    >
      <div class="childSkin">
        <img
          v-for="item in skinChild"
          :key="item.skinId"
          width="25"
          :src="item.chromaImg"
          :title="item.name"
          @click="preSkin(item)"
        />
      </div>
    </Modal>
  </div>
</template>

<script setup lang="ts">
  import { defineProps, onMounted, ref } from 'vue';
  import { Modal, message } from 'ant-design-vue';
  import { useRouter } from 'vue-router';
  import http from '@/utils/http';
  import type { heroInfo, skinInfo } from '@/type/type';
  import useGlobalState from '@/hooks/use-global-state';

  const emits = defineEmits(['back']);
  const visible = ref(false);
  let router = useRouter();
  const bigImg = ref();
  const { heroId } = useGlobalState();
  const allSkins = ref<skinInfo[]>();
  const bigImgName = ref('');
  let heroInfo$: heroInfo;
  let skins_: skinInfo[];
  const choseId = ref('');
  const getSkins = () => {
    const REQ_URL = `https://game.gtimg.cn/images/lol/act/img/js/hero/${heroId.value}.js`;
    // 读取配置文件
    // const path = 'C:\\Fraps\\data\\My\\Config.ini';
    // const exist = fs.existsSync(path);
    // if (!exist) {
    // fs.writeFileSync(path, ConfigIni, { encoding: 'utf-8' });
    // }
    if (choseId.value) {
      return;
    }
    http.axios.get(REQ_URL).then((res: any) => {
      heroInfo$ = res.hero;
      skins_ = res.skins;
      allSkins.value = res.skins.filter((item) => item.mainImg);
      bigImg.value = allSkins.value[0].mainImg;
      // choseId.value = parseInt(config.SKIN_CHAMPION_ACTIVED[heroInfo$.alias] || 0);
      pickId = choseId.value;
      res.skins?.forEach((item) => {
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
  };

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
  };
  const getColorfulSkin = (skinId) => {
    return skins_.filter((item) => item.chromasBelongId === skinId);
  };
  const back = () => {
    router.push({ path: '/' });
  };
  const confirm_ = () => {
    if (!pickId && pickId !== 0) {
      message.warn('未选择皮肤');
    }
  };
  onMounted(() => {
    getSkins();
  });
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

  .skinName {
    color: #fff5e0;
    position: absolute;
    bottom: 10px;
    left: 10px;
  }
  .skin-container {
    display: inline-flex;
    justify-content: start;
    flex: 1;
    .big {
      display: flex;
      justify-content: center;
      align-items: center;
      img {
        width: 100%;
      }
    }

    .skin-more {
      display: flex;
      flex-direction: column;
      position: relative;
      overflow: auto;
      margin-top: 10px;
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
