<template>
  <teleport to="#app" :disabled="readerMode">
    <transition
      :duration="300"
      enter-active-class="animate__animated animate__fadeInDown"
      leave-active-class="animate__animated animate__fadeOutDown"
    >
      <div
        v-show="(visible || readerMode) && images.length > 0"
        class="ghsiv-con"
        h-full
        w-full
        absolute
        z-1002
        left-0
        top-0
        @click="handleBackClick"
      >
        <transition
          enter-active-class="animate__animated animate__slideInDown"
          leave-active-class="animate__animated animate__slideOutUp"
        >
          <div
            v-show="!drawerOpen && !idle"
            class="ghsiv-header"
            absolute
            flex
            items-center
            w-full
            left-0
            top-0
            z-1003
          >
            <div class="ghsiv-left" flex justify-start items-center p-l-4 h-full>
              <span>{{ showCurrent }} / {{ images.length }}</span>
            </div>
            <div class="ghsiv-title" flex justify-center items-center p-l-4 h-full>
              <span :title="imgUrl">
                {{ images.length > 0 && (images[current]?.title || imgUrl) }}
              </span>
              <span m-l-4> {{ percentage }} </span>
            </div>
            <div class="ghsiv-extra" flex items-center justify-end p-r-4 h-full gap-10px>
              <a-button
                :type="choseUrl === 'minUrl' ? 'primary' : ''"
                size="small"
                style="color: white"
                @click="choseUrl = 'minUrl'"
              >
                缩略
              </a-button>
              <a-button
                v-if="images?.length > 0 && images[current].fullUrl"
                :type="choseUrl === 'fullUrl' ? 'primary' : ''"
                size="small"
                style="color: white"
                @click="choseUrl = 'fullUrl'"
              >
                全图
              </a-button>
              <CommentOutlined
                v-if="comments?.length > 0"
                :style="{ fontSize: '14px', color: '#FFF' }"
                @click="drawerOpen = !drawerOpen"
              />
              <CloseCircleOutlined v-if="!readerMode" @click="visible = false" />
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
          <div ref="imgContainerRef" class="img-container" w-auto>
            <transition enter-active-class="animate__animated animate__zoomIn">
              <Component
                :is="GhsImg2"
                :key="imgUrl"
                class="img-img"
                :url="imgUrl"
                :force="force"
                v-bind="imgAttrs"
                :global="true"
                @contextmenu.stop="nextImg"
              ></Component>
            </transition>
          </div>

          <div class="ghsiv-dir" absolute left-4 flex justify-center items-center z-9999999>
            <LeftCircleOutlined @click="preImg" />
          </div>
          <div class="ghsiv-dir" absolute right-4 flex justify-center items-center z-9999999>
            <RightCircleOutlined @click="nextImg" />
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
  <a-drawer
    v-model:open="drawerOpen"
    title=""
    placement="right"
    :closable="false"
    :mask-closable="true"
    :content-wrapper-style="{}"
    :body-style="{ padding: '10px' }"
    width="55%"
    :get-container="getDrawerContainer"
    :style="{ position: 'absolute' }"
  >
    <div h-full w-full overflow-auto @wheel.stop="() => 1">
      <GhsComment
        v-for="item in comments"
        :key="item.comment"
        :datetime="item.datetime"
        :comment="item.comment"
      >
      </GhsComment>
    </div>
  </a-drawer>
</template>
<script setup lang="ts">
  import type { PropType } from 'vue-demi';
  import { useIdle, useVModel } from '@vueuse/core';
  import {
    CloseCircleOutlined,
    CommentOutlined,
    LeftCircleOutlined,
    RightCircleOutlined,
  } from '@ant-design/icons-vue';
  import { watchEffect } from 'vue-demi';
  import type { Detail } from '@ghs/types';
  import { ref } from 'vue';
  import { isFalsity } from '@ilzf/utils';
  import GhsImg2 from '@/components/image/ghs-img-plain.vue';
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
  @titleWidth: 60%;
  @extraWidth: 20%;
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
