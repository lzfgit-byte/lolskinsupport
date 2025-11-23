import { ref } from 'vue';
import type { Comment, Detail } from '@ghs/types';
import type { DetailInfo } from '@ghs/types/src';
import type { VideoType } from '@/components/player/types';
export interface ImgViewerExpose {
  show: (imgs: Detail[]) => void;
  close: () => void;
}
export interface GhsPlayerExpose {
  show: (src: string, title: string, type: VideoType, comments_?: Comment[]) => void;
  showWithTag: (urls: Detail[], title: string, type: VideoType) => void;
  showSeries: (detailInfo: DetailInfo, title: string) => void;
}
export interface WebConfigExpose {
  add: (key: string) => void;
  edit: (key: string) => void;
}
const imgViewerRef = ref<ImgViewerExpose>();
const videoGlobalRef = ref<GhsPlayerExpose>();
const webConfigRef = ref<WebConfigExpose>();
const logRef = ref<{ show: () => void }>();
export default () => {
  return { imgViewerRef, videoGlobalRef, webConfigRef, logRef };
};
