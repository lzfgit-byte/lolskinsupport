import { ConfigEntity } from '@ghs/constant';
import { MessageUtil } from '../utils/message';
import { restartApp } from '../utils/KitUtil';

/**
 * 获取系统配置
 */
export const listSystemConfig = async () => {
  return await ConfigEntity.find();
};

/**
 * 更新系统配置
 */
export const updateSystemConfig = async (key: string, value: string) => {
  const ent = await ConfigEntity.findOne({ where: { name: key } });
  if (!ent) {
    MessageUtil.error('更新的设置在数据库不存在');
    return;
  }
  ent.value = value;
  return await ConfigEntity.update(ent.id, ent);
};

/**
 * 重启程序
 */
export const restartAPP = () => {
  restartApp();
};
