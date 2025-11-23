import { onMounted, ref } from 'vue-demi';
import type { Ref } from 'vue';
import { computed, onUnmounted } from 'vue';
import type { Detail } from '@ghs/types';
import { hashString } from '@ilzf/utils';
export const ImgEmitEnum = {
  nextImg: 'nextImg',
  preImg: 'preImg',
};
export default (transX: Ref<number>, transY: Ref<number>, scale: Ref<number>) => {
  const images = ref<Detail[]>([]);
  const current = ref(0);
  const showCurrent = computed(() => current.value + 1);
  const visible = ref(false);
  const choseUrl = ref<'fullUrl' | 'minUrl'>('minUrl');
  const imgUrl = computed(() =>
    images.value.length > 0 ? images.value[current.value][choseUrl.value] : ''
  );
  const alreadyCache = [];
  const preloadUrl = computed(() => {
    const allImgLength = images.value.length;
    const executeCacheLength = +(allImgLength / 4).toFixed(0);
    const cacheLength = executeCacheLength ? Math.min(3, executeCacheLength) : 0;
    if (!cacheLength) {
      return [];
    }
    const afterRes = [];
    let currentNor = current.value;
    while (+cacheLength > 0 && currentNor < allImgLength - 1 && afterRes.length < cacheLength) {
      afterRes.push(images.value[++currentNor].url);
    }
    // 前边的
    const beforeRes = [];
    let currentNorBefore = current.value;
    while (+cacheLength > 0 && currentNorBefore > 0 && beforeRes.length < cacheLength) {
      beforeRes.push(images.value[--currentNorBefore].url);
    }
    if (beforeRes.length < +cacheLength) {
      let c = +cacheLength - beforeRes.length;
      while (c >= 1 && beforeRes.length < cacheLength) {
        beforeRes.push(images.value[allImgLength - c].url);
        c--;
      }
    }
    const all = [...afterRes, ...beforeRes].filter((item) => !alreadyCache.includes(item));
    alreadyCache.push(...all);
    return all;
  });
  const beforeChange = () => {
    choseUrl.value = 'minUrl';
    transX.value = 0;
    transY.value = 0;
    scale.value = 100;
  };
  const preImg = () => {
    // bus.emit(ImgEmitEnum.preImg, hashString(imgUrl.value));
    if (images.value.length === 1) {
      return;
    }
    beforeChange();
    if (current.value > 0) {
      current.value--;
    } else {
      current.value = images.value.length - 1;
    }
  };
  const nextImg = () => {
    // bus.emit(ImgEmitEnum.nextImg, hashString(imgUrl.value));
    if (images.value.length === 1) {
      return;
    }
    beforeChange();
    if (current.value < images.value.length - 1) {
      current.value++;
    } else {
      current.value = 0;
    }
  };
  const handleBackClick = (evt: PointerEvent) => {
    visible.value = false;
  };
  const func = (event: KeyboardEvent) => {
    if (event.type === 'keydown') {
      if (event.key === 'ArrowRight') {
        nextImg();
        // bus.emit(ImgEmitEnum.nextImg, hashString(imgUrl.value));
      }
      if (event.key === 'ArrowLeft') {
        preImg();
        // bus.emit(ImgEmitEnum.preImg, hashString(imgUrl.value));
      }
    }
  };
  onMounted(() => {
    window.addEventListener('keydown', func);
  });

  onUnmounted(() => {
    window.removeEventListener('keydown', func);
  });
  return {
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
  };
};
