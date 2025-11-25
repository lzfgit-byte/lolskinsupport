<template>
  <div h-full w-full box-border pos-relative>
    <div class="back" @click="back">
      <span>返回</span>
    </div>
    <div class="confirm" @click="confirm_">
      <span>确定[{{ choseSkin?.name }}]</span>
    </div>
    <div class="confirm" style="top: 50px" @click="preChose">
      <span>提前选择[{{ choseSkin?.name }}]</span>
    </div>
    <div class="skin-container" h-full w-full pos-relative box-border>
      <div class="skin-more">
        <div h-full style="width: 430px">
          <div
            v-for="item in allSkins"
            :key="item.skinId"
            style="padding: 10px 10px 20px; position: relative; width: 200px; display: inline-flex"
          >
            <img
              :class="isChose(item) ? 'chose' : ''"
              width="168"
              :src="item.mainImg"
              :title="item.description"
              @click="handleChoseSkin(item)"
            />
            <div class="skinName" :title="item.name">{{ item.name }}</div>
          </div>
        </div>
      </div>
      <div class="big">
        <img style="max-width: 90%" :src="choseSkinMainImg" />
      </div>
      <div v-if="skinChild?.length > 0" class="showChild" @click="visible = true">选择炫彩</div>
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
          @click="handleChoseSkin(item)"
        />
      </div>
    </Modal>
  </div>
</template>

<script setup lang="ts">
  import type { Ref } from 'vue';
  import { computed, defineProps, onMounted, ref } from 'vue';
  import { Modal, message } from 'ant-design-vue';
  import { useRouter } from 'vue-router';
  import http from '@/utils/http';
  import type { heroInfo, skinInfo } from '@/type/type';
  import useGlobalState from '@/hooks/use-global-state';
  import {
    f_checkCanAutoConfirm,
    f_checkHasSkins,
    f_confirmChoseSkin,
    f_getHeroChoseSkin,
    f_loadSkin,
    f_setHeroChoseSkin,
  } from '@/utils/business';
  import { notify } from '@/utils/kit-utils';

  const visible = ref(false);
  let router = useRouter();
  const { heroId, autoChose } = useGlobalState();
  let skins_ = ref<skinInfo[]>([]);
  const allSkins = ref<skinInfo[]>();
  const choseSkinId = ref('');
  const choseSkin = computed(() => {
    if (choseSkinId.value) {
      const f = skins_.value.filter((item) => item.skinId === choseSkinId.value);
      if (f?.length > 0) {
        return f[0];
      }
    }
    return {};
  });
  const choseSkinMainImg = computed(() => {
    if (choseSkin.value?.chromasBelongId === '0') {
      return choseSkin.value.mainImg;
    }
    const s = allSkins.value?.filter((item) => item.skinId === choseSkin.value?.chromasBelongId);
    if (s?.length > 0) {
      return s[0].mainImg;
    }
    return '';
  });
  const skinChild: Ref<skinInfo[]> = computed(() => {
    return skins_.value.filter((item_) => choseSkinId.value === item_.chromasBelongId);
  }) as any;

  const getSkins = () => {
    const REQ_URL = `https://game.gtimg.cn/images/lol/act/img/js/hero/${heroId.value}.js`;
    if (!heroId.value) {
      message.warn('请选择英雄');
      return;
    }
    http.axios
      .get(REQ_URL)
      .then((res: any) => {
        skins_.value = res.skins;
        allSkins.value = res.skins.filter((item: skinInfo) => item.chromasBelongId === '0');
        return f_getHeroChoseSkin(heroId.value);
      })
      .then((id) => {
        choseSkinId.value = id || allSkins.value[0].skinId;
        if (autoChose.value && !choseSkinId.value?.endsWith('00')) {
          f_confirmChoseSkin(`选择皮肤【${choseSkin.value?.name}】`, choseSkin.value.mainImg).then(
            (res) => {
              if (res) {
                confirm_();
              }
            }
          );
        }
      });
  };
  const isChose = (item: skinInfo) => {
    if (choseSkin.value?.chromasBelongId === '0') {
      return item.skinId === choseSkinId.value;
    }
    return item.skinId === choseSkin.value?.chromasBelongId;
  };
  const back = () => {
    router.push({ path: '/' });
  };
  const handleChoseSkin = async (item: skinInfo) => {
    choseSkinId.value = item.skinId;
    visible.value = false;
    const res = await f_checkHasSkins(heroId.value, item.skinId);
    if (!res) {
      message.warn('请先下载英雄皮肤');
    }
    preChose();
  };
  const confirm_ = async () => {
    const res = await f_checkHasSkins(heroId.value, choseSkinId.value);
    if (!res) {
      message.warn('请先下载英雄皮肤');
      return;
    }
    f_loadSkin(heroId.value, choseSkin.value.skinId);
  };
  const preChose = async () => {
    const res = await f_checkHasSkins(heroId.value, choseSkinId.value);
    if (!res) {
      message.warn('请先下载英雄皮肤');
      return;
    }
    await f_setHeroChoseSkin(heroId.value, choseSkinId.value);
    message.success('已应用');
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
    padding: 10px;
  }

  .showChild {
    position: absolute;
    border-radius: 2%;
    left: 50%;
    bottom: 20px;
    z-index: 9;
    color: white;
    cursor: pointer;
    padding: 20px;
    border: 1px solid rgba(255, 255, 255, 0.42);
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
    width: auto;
    right: 20px;
    top: 10px;
    z-index: 3;
    cursor: pointer;
  }

  .skinName {
    color: #fff5e0;
    position: absolute;
    bottom: -4px;
    left: 20px;
    white-space: nowrap; /* 不换行 */
    overflow: hidden; /* 超出隐藏 */
    text-overflow: ellipsis; /* 显示省略号 */
    max-width: 140px; /* 必须设置宽度 */
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
