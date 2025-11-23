import type { Item } from '@ghs/types';
import { useRouter } from 'vue-router';
import useGlobalState from '@/hook/useGlobalState';
import useGlobalRef from '@/hook/use-global-ref';
import { getDetailPage } from '@/api';
import { message } from '@/utils/kit-util';

export default () => {
  const { segmentedValue, drawerOpen, segmentedData, webConfig } = useGlobalState();
  const { loading, webKey } = useGlobalState();
  const { imgViewerRef, videoGlobalRef, webConfigRef } = useGlobalRef();
  const router = useRouter();
  const showDetail = async (item: Item) => {
    loading.value = true;
    const detail = await getDetailPage(item);
    if (detail === null) {
      loading.value = false;
      return;
    }
    loading.value = false;
    if (detail.detailType === 'mp4' || detail.detailType === 'm3u8') {
      if (detail.details.length === 1) {
        if (detail.details[0]?.url === '') {
          message.warn('视频地址为空');
          return;
        }
        videoGlobalRef.value.show(
          detail.details[0].url,
          detail.details[0].title,
          detail.detailType,
          detail.details[0].comments
        );
      } else {
        videoGlobalRef.value.showWithTag(
          detail.details,
          detail.details[0].title,
          detail.detailType
        );
      }
    } else if (detail.detailType === 'image') {
      imgViewerRef.value.show(detail.details);
    } else if (detail.detailType === 'win') {
    } else if (detail.detailType === 'comic') {
      await router.push({ path: '/comic-reader', query: { url: detail.details[0].url } });
    } else if (detail.detailType === 'series') {
      videoGlobalRef.value.showSeries(detail, item.title);
    }
  };

  const handleDrawOpen = () => {
    drawerOpen.value = true;
  };

  const handleAddCode = () => {
    webConfigRef.value.add('');
  };
  const handleEditCode = () => {
    webConfigRef.value.edit(webKey.value);
  };
  const clearLogs = () => {};

  return {
    showDetail,
    drawerOpen,
    handleDrawOpen,
    segmentedValue,
    segmentedData,
    handleAddCode,
    handleEditCode,
    clearLogs,
  };
};
