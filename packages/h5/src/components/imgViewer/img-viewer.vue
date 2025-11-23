<template>
  <teleport to="#app">
    <transition
      :duration="300"
      enter-active-class="animate__animated animate__fadeInDown"
      leave-active-class="animate__animated animate__fadeOutDown"
    >
      <div
        v-show="visible && images.length > 0"
        class="ghsiv-con"
        h-full
        w-full
        absolute
        z-1002
        left-0
        top-0
      >
        <transition
          enter-active-class="animate__animated animate__slideInDown"
          leave-active-class="animate__animated animate__slideOutUp"
        >
          <div
            v-show="!drawerOpen"
            class="ghsiv-header"
            absolute
            flex
            items-center
            w-full
            left-0
            bottom-0
            z-1003
          >
            <div class="ghsiv-left" flex justify-start items-center p-l-4 h-full>
              <span>{{ showCurrent }} / {{ images.length }}</span>
            </div>
            <div class="ghsiv-extra" flex items-center justify-end p-r-4 h-full gap-10px>
              <van-button
                :type="choseUrl === 'minUrl' ? 'primary' : ''"
                size="small"
                @click="choseUrl = 'minUrl'"
              >
                缩
              </van-button>
              <van-button
                v-if="images?.length > 0 && images[current].fullUrl"
                :type="choseUrl === 'fullUrl' ? 'primary' : ''"
                size="small"
                @click="choseUrl = 'fullUrl'"
              >
                全
              </van-button>
              <van-button
                v-if="comments?.length > 0"
                type="primary"
                size="small"
                @click="drawerOpen = !drawerOpen"
              >
                评
              </van-button>
              <van-button type="primary" size="small" @click="handleBackClick"> 关 </van-button>
              <van-button type="primary" size="small" @click="preImg"> 上 </van-button>
              <van-button type="primary" size="small" @click="nextImg"> 下 </van-button>
            </div>
          </div>
        </transition>

        <div
          id="img-view-id"
          ref="bodyRef"
          class="ghsiv-body"
          absolute
          h-full
          w-full
          flex
          justify-center
          items-center
          top-0
          left-0
          z-1001
        >
          <div ref="imgContainerRef" class="img-container" w-full h-full>
            <transition enter-active-class="animate__animated animate__slideInDown">
              <GhsImg
                :key="imgUrl"
                class="img-img"
                :url="imgUrl"
                :force="force"
                v-bind="imgAttrs"
                :global="true"
                @click="nextImg"
              ></GhsImg>
            </transition>
          </div>
        </div>
      </div>
    </transition>
    <GhsImg
      v-for="item in preloadUrl"
      :key="item"
      style="display: none"
      :url="item"
      :force="force"
    ></GhsImg>
  </teleport>
  <van-popup v-model:show="drawerOpen" position="bottom" :style="{ height: '80%' }">
    <div h-full w-full overflow-auto @wheel.stop="() => 1">
      <GhsComment
        v-for="item in comments"
        :key="item.comment"
        :datetime="item.datetime"
        :comment="item.comment"
      >
      </GhsComment>
    </div>
  </van-popup>
</template>
<script setup lang="ts">
  import { useIdle, useVModel } from '@vueuse/core';
  import type { Detail } from '@ghs/types';
  import type { PropType } from 'vue';
  import { ref, watchEffect } from 'vue';
  import { isFalsity } from '@ilzf/utils';
  import useImgViewer from '@/components/imgViewer/hooks/useImgViewer';
  import useImgShow from '@/components/imgViewer/hooks/useImgShow';
  import GhsImg from '@/components/image/ghs-img.vue';
  import useReadModel from '@/components/imgViewer/hooks/useReadModel';
  import GhsComment from '@/components/comment/ghs-comment.vue';
  import useComments from '@/components/imgViewer/hooks/useComments';
  const props = defineProps({
    force: Boolean,
    readerMode: Boolean,
    imgAttrs: Object,
    imagesArr: Array as PropType<Detail[]>,
    currentImg: String,
    totalImg: String,
  });
  const emits = defineEmits(['update:currentImg', 'update:totalImg']);
  const { idle } = useIdle(2 * 1000); // 2s
  const {
    bodyRef,
    imgContainerRef,
    scaleComp,
    translateXComp,
    translateYComp,
    translateX,
    translateY,
    scale,
  } = useImgViewer();
  // 业务
  const {
    showCurrent,
    visible,
    imgUrl,
    preImg,
    nextImg,
    images,
    choseUrl,
    current,
    handleBackClick,
    preloadUrl,
  } = useImgShow(translateX, translateY, scale);
  const { comments, getDrawerContainer, drawerOpen } = useComments(visible);
  const currentImg_ = useVModel(props, 'currentImg', emits);
  const totalImg_ = useVModel(props, 'totalImg', emits);
  watchEffect(() => {
    currentImg_.value = `${current.value}`;
    totalImg_.value = `${images?.value?.length}`;
  });
  const percentage = ref();
  const expose = {
    show: (ims: Detail[]) => {
      translateX.value = 0;
      translateY.value = 0;
      current.value = 0;
      scale.value = 100;
      choseUrl.value = 'minUrl';
      images.value = ims.map((item) => ({ ...item, minUrl: item.url }));
      visible.value = true;
      comments.value = ims
        .map((item) => item.comments)
        .reduce((acc, cur) => acc.concat(cur), [])
        .filter((item) => !isFalsity(item));
    },
    close: () => {
      visible.value = false;
    },
  };
  useReadModel(props, expose);
  defineExpose(expose);
</script>

<style scoped lang="less">
  @titleWidth: 0%;
  @extraWidth: 80%;
  .ghsiv-con {
    background: rgba(0, 0, 0, 0.54);
    .ghsiv-header {
      background: rgba(0, 0, 0, 0.72);
      color: #bdb5b5;
      height: 40px;
      .ghsiv-left {
        width: @extraWidth;
      }
      .ghsiv-title {
        width: @titleWidth;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .ghsiv-extra {
        width: @extraWidth;
      }
    }
    .ghsiv-body {
      .ghsiv-dir {
        top: 50%;
        transform: translateY(-50%);
        cursor: pointer;
      }
      .img-container {
        transition: all 0.2s linear;
        transform: v-bind(translateXComp) v-bind(translateYComp) v-bind(scaleComp);
        box-shadow: rgba(100, 100, 111, 0.2) 0 7px 29px 0;
      }
    }
  }
</style>
