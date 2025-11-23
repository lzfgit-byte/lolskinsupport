<template>
  <div h-auto w-full relative flex justify-center>
    <img ref="imagesRef" :src="imgSrc" alt="" @click="handleImgView" />
    <canvas v-show="false" ref="canvas"></canvas>
  </div>
</template>
<script setup lang="ts">
  import { computed, onMounted, ref } from 'vue';
  import { Md5 } from 'ts-md5'; //
  import type { PropType } from 'vue-demi';
  import { hashString } from '@ilzf/utils';
  import { message } from 'ant-design-vue';
  import { keys } from 'lodash';
  import src from '@/components/image/loading.gif?url';
  import { f_getImage } from '@/utils/business';
  import useGlobalState from '@/hooks/use-global-state';
  import useGlobalRef from '@/hooks/use-global-ref';
  import bus from '@/utils/bus';
  import { ImgEmitEnum } from '@/components/imgViewer/hooks/useImgShow';
  import { ComicEmitEnum, imagesBase64 } from '@/components/comic/hooks/useComicState';
  const props = defineProps({
    url: String,
    extra: Object as PropType<Record<string, any>>,
  });
  const imgSrc = ref(src);
  const canvas = ref<HTMLCanvasElement>();
  const imagesRef = ref<HTMLImageElement>();
  const { webConfig } = useGlobalState();
  const { imgViewerRef } = useGlobalRef();
  const maxWidth = computed(() => webConfig.value?.comicImgMaxWidth || '80vw');
  const init = async () => {
    if (!props.url) {
      return;
    }
    imgSrc.value = await f_getImage(props.url);
    if (webConfig.value.adapterImageCode) {
      new Function(webConfig.value.adapterImageCode)()(
        imgSrc,
        props?.extra,
        Md5,
        props?.url,
        canvas
      );
    }
  };
  const openImageView = () => {
    imgViewerRef.value.show([
      {
        type: 'image',
        url: imgSrc.value,
        title: `${+imagesBase64[hashString(props.url)] + 1}/${keys(imagesBase64).length}`,
      },
    ]);
    imagesRef.value.scrollIntoView({ behavior: 'smooth' });
  };
  const registerEvent = () => {
    bus.on(ImgEmitEnum.nextImg, (hashStr: string) => {
      if (hashString(imgSrc.value) === hashStr) {
        const index = imagesBase64[hashString(props.url)];
        if (index === keys(imagesBase64).length - 1) {
          message.warn('已经是最后一页');
          return;
        }
        bus.emit(ComicEmitEnum.comicNext, index + 1);
      }
    });
    bus.on(ImgEmitEnum.preImg, (hashStr: string) => {
      if (hashString(imgSrc.value) === hashStr) {
        const index = imagesBase64[hashString(props.url)];
        if (index === 0) {
          message.warn('已经是第一页');
          return;
        }
        imgViewerRef.value.close();
        bus.emit(ComicEmitEnum.comicPre, index - 1);
      }
    });
    bus.on(ComicEmitEnum.comicNext, (index_) => {
      const index = imagesBase64[hashString(props.url)];
      if (index === index_) {
        openImageView();
      }
    });
    bus.on(ComicEmitEnum.comicPre, (index_) => {
      const index = imagesBase64[hashString(props.url)];
      if (index === index_) {
        openImageView();
      }
    });
  };
  const handleImgView = () => {
    openImageView();
  };
  onMounted(() => {
    init();
    registerEvent();
  });
</script>

<style scoped lang="less">
  img {
    max-width: v-bind(maxWidth);
  }
</style>
