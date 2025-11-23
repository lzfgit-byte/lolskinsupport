import { ViewedHistoryEntity } from '@ghs/constant';
import { getCurrentKey } from '../business/use-init-web-config';

/**
 * 加载历史列表
 */
export const listHistory = async (): Promise<ViewedHistoryEntity[]> => {
  return await ViewedHistoryEntity.find({
    where: { type: getCurrentKey() },
    order: { createTime: 'DESC' },
  });
};
