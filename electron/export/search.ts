import { SearchHistoryEntity } from '@ghs/constant';
import type { Item } from '@ghs/types';
import { getCurrentBusiness } from '../business/business';
import { getCurrentKey, getWebConfigByKey } from '../business/use-init-web-config';

/**
 * 执行搜索
 */
export const search = async (search: string, item: Item): Promise<string> => {
  const business = getCurrentBusiness(getCurrentKey());
  return business.search(search, item);
};
/**
 * 搜索推荐
 */
export const searchRecommend = async (search: string): Promise<string[]> => {
  const ents = await SearchHistoryEntity.find({
    where: { type: getCurrentKey() },
    order: { createTime: 'DESC' },
  });

  const business = getCurrentBusiness(getCurrentKey());
  const wc = getWebConfigByKey(getCurrentKey());
  if (ents.length > wc.historyRemember) {
    await SearchHistoryEntity.delete(ents.slice(wc.historyRemember).map((item) => item.id));
  }
  return [...(await business.adapterRemoteSearch(search)), ...ents.map((item) => item.value)];
};
/**
 * 删除搜索记录
 */
export const deleteSearch = async (searchValue: string) => {
  const one = await SearchHistoryEntity.findOne({
    where: { type: getCurrentKey(), value: searchValue },
  });
  if (one) {
    await one.remove();
  }
};
