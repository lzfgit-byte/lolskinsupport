import type { AnalysisDetail, AnalysisVideoDetail } from '@ghs/types/src';
import type { Analysis } from '@ghs/types';
import type { ComicHistory } from '@ghs/constant';
import { getCurrentBusiness } from '../business/business';
import { getCurrentKey } from '../business/use-init-web-config';

/**
 * 获取页面的解析数据
 */
export const getAnalysisDetail = async (item: Analysis): Promise<AnalysisDetail[]> => {
  return getCurrentBusiness(getCurrentKey())?.getAnalysisDetail(item);
};
/**
 * 获取 视频播放详细 AnalysisVideoDetail
 */
export const getAnalysisVideoDetail = async (
  item: AnalysisDetail
): Promise<AnalysisVideoDetail[]> => {
  return getCurrentBusiness(getCurrentKey())?.getAnalysisVideoDetail(item);
};

export const getSeriesCurrentContent = async (): Promise<ComicHistory> => {
  return getCurrentBusiness(getCurrentKey())?.getSeriesCurrentContent();
};
