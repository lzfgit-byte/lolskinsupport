import { ref, watchEffect } from 'vue-demi';
import { computed, onMounted } from 'vue';
import { useElementSize } from '@vueuse/core';

export default () => {
  const bodyRef = ref<HTMLDivElement>();
  const imgContainerRef = ref<HTMLDivElement>();
  const scale = ref(100);
  const scaleComp = computed(() => `scale(${scale.value}%)`);

  const translateX = ref(0);
  const translateXComp = computed(() => `translateX(${translateX.value}px)`);

  const translateY = ref(0);
  const translateYComp = computed(() => `translateY(${translateY.value}px)`);

  const { width, height } = useElementSize(bodyRef);
  const { width: imgWidth, height: imgHeight } = useElementSize(imgContainerRef);

  watchEffect(() => {
    scale.value = 100 * Math.min(height.value / imgHeight.value, width.value / imgWidth.value);
  });

  const isMove = ref(false);
  onMounted(() => {
    bodyRef.value.addEventListener('wheel', (evt) => {
      const step = 10;
      if (evt.deltaY > 0) {
        scale.value -= step;
        if (scale.value < 10) {
          scale.value = 10;
        }
      } else {
        scale.value += step;
      }
    });
    let oldPos = [];

    imgContainerRef.value.addEventListener('mousedown', (evt) => {
      isMove.value = true;
      oldPos = [evt.pageX, evt.pageY];
    });
    imgContainerRef.value.addEventListener('mouseup', (evt) => {
      isMove.value = false;
    });

    imgContainerRef.value.addEventListener('mousemove', (evt) => {
      if (isMove.value) {
        translateX.value += evt.pageX - oldPos[0];
        translateY.value += evt.pageY - oldPos[1];
        oldPos = [evt.pageX, evt.pageY];
      }
    });
    imgContainerRef.value.addEventListener('mouseleave', (evt) => {
      isMove.value = false;
    });
  });
  return {
    bodyRef,
    imgContainerRef,
    scaleComp,
    translateXComp,
    translateYComp,
    translateX,
    translateY,
    scale,
  };
};
