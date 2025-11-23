import { CollectEntity } from '@ghs/constant';
import type { Item } from '@ghs/types';
import { isFalsity } from '@ilzf/utils';
import { getCurrentKey } from '../business/use-init-web-config';
import { LogMsgUtil } from '../utils/message';
/**
 * 收藏操作在这里 列出收藏
 */
export const listCollect = async (key: string = null): Promise<CollectEntity[]> => {
  LogMsgUtil.sendLogMsg('刷新收藏');
  return await CollectEntity.find({
    where: { type: key || getCurrentKey() },
    order: { count: 'DESC', createTime: 'DESC' },
  });
};
/**
 * 判断是否已经收藏
 */
export const isCollect = async (item: Item): Promise<boolean> => {
  const list = await CollectEntity.find({ where: { url: item.jumpUrl } });
  return list.length > 0;
};
/**
 * 保存或是更新收藏
 */
export const saveCollect = async (item: Item) => {
  const one = await CollectEntity.findOne({ where: { url: item.jumpUrl } });
  if (!isFalsity(one)) {
    one.count = ++one.count;
    await CollectEntity.update(one.id, one);
    LogMsgUtil.sendLogMsg(`收藏成功更新-->${JSON.stringify(one)}`);
    return;
  }
  const entity = new CollectEntity();
  entity.url = item.jumpUrl;
  entity.value = JSON.stringify(item);
  entity.count = 0;
  entity.type = getCurrentKey();
  await entity.save();
  LogMsgUtil.sendLogMsg(`收藏成功更新-->${JSON.stringify(entity)}`);
};
/**
 * 取消收藏
 */
export const cancelCollect = async (item: Item) => {
  const one = await CollectEntity.findOne({ where: { url: item.jumpUrl } });
  if (!isFalsity(one)) {
    await CollectEntity.delete(one.id);
    LogMsgUtil.sendLogMsg(`取消收藏成功-->${JSON.stringify(one)}`);
  }
};
