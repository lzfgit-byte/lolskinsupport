import type { MessageInfo } from '@ghs/types';
import { ref } from 'vue';
// @ts-ignore
import src from '../loading.gif?url';
import { getImage } from '@/api';
export default (props: any) => {
  const imgSrc = ref(src);
  const percentageRef = ref(0);
  const progressInfo = ref();
  const isError = ref(false);
  const init = async () => {
    if (!props.url) {
      return;
    }
    const handleBus = async (args: MessageInfo) => {
      percentageRef.value = args.percentage;
      progressInfo.value = args.title;
    };
    imgSrc.value = await getImage(props.url);
    if (imgSrc.value === 'data:image/png;base64,') {
      imgSrc.value = src;
    }
  };
  const handleError = () => {
    console.log('图片加载失败:', props.url);
    isError.value = true;
    imgSrc.value = src;
  };
  return { imgSrc, init, handleError, percentageRef, progressInfo, isError };
};
