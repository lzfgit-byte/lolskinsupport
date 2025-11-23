import { computed, onMounted, onUnmounted, ref } from 'vue';
import type { CComic, CContent } from '@ghs/types';
import { message } from 'ant-design-vue';
import { hashString, isString, waitTime } from '@ilzf/utils';
import type { ComicHistory } from '@ghs/constant';
import { useScroll } from '@vueuse/core';
import { watchEffect } from 'vue-demi';
import {
  f_getComicIImages,
  f_getContent,
  f_getCurrentContentUrl,
  f_updateCurrentComic,
} from '@/utils/business';
import bus from '@/utils/bus';
import { ImgEmitEnum } from '@/components/imgViewer/hooks/useImgShow';
export let imagesBase64: Record<string, number> = {};
export const ComicEmitEnum = {
  comicNext: 'comicNext',
  comicPre: 'comicPre',
};
export default (url: string) => {
  const containerRef = ref<HTMLDivElement>();
  const contents = ref<CContent[]>([]);
  const comicImages = ref<CComic[]>([]);
  const drawValue = ref(true);
  const currentContent = ref<ComicHistory>();
  const { y } = useScroll(containerRef, {
    behavior: 'smooth',
  });
  const percent = computed(() =>
    containerRef.value?.scrollHeight ? y.value / containerRef.value?.scrollHeight : 0
  );
  const loadContent = async () => {
    contents.value = await f_getContent(url);
  };
  const getImages = async (url: string) => {
    if (!url) {
      message.warn('目录地址为空');
      return;
    }
    if (isString(url) && url.trim() === '') {
      message.warn('目录地址为空');
      return;
    }
    offComicEmit();
    imagesBase64 = {};
    comicImages.value = await f_getComicIImages(url);
    comicImages.value.forEach((item, index) => {
      imagesBase64[hashString(item.url)] = index;
    });
    currentContent.value = await f_getCurrentContentUrl();
    containerRef.value.scrollTo({ top: 0, behavior: 'smooth' });
  };

  watchEffect(() => {
    if (containerRef.value?.scrollHeight) {
      f_updateCurrentComic(y.value)?.then(() => 1);
    }
  });
  onMounted(async () => {
    await loadContent();
    currentContent.value = await f_getCurrentContentUrl();
    if (currentContent.value) {
      await getImages(currentContent.value.contentUrl);
      await waitTime();
      y.value = currentContent.value.currentImage;
      document
        .querySelector('.currentContentInDraw')
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else if (contents.value.length === 1) {
      // 就一个目录，则加载
      await getImages(contents.value[0].url);
    }
  });
  const offComicEmit = () => {
    bus.off(ComicEmitEnum.comicPre);
    bus.off(ComicEmitEnum.comicNext);
    bus.off(ImgEmitEnum.preImg);
    bus.off(ImgEmitEnum.nextImg);
  };
  onUnmounted(() => {
    offComicEmit();
  });
  return { containerRef, contents, comicImages, getImages, drawValue, currentContent, percent };
};
