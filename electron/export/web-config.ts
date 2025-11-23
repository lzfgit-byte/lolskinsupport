import { WebConfigEntity } from '@ghs/constant';
import { base64ToStr } from '@ilzf/utils';
import { MessageUtil } from '../utils/message';
import { parseWebConfig, resetWebConfig } from '../business/use-init-web-config';

/**
 * 保存WebConfig
 * @param key
 * @param code
 */
export const saveWebConfigCode = async (key: string, code: string) => {
  const one = await WebConfigEntity.findOne({ where: { key } });
  if (one) {
    one.backCode = one.code;
    one.code = code;
    try {
      parseWebConfig(base64ToStr(code));
      await WebConfigEntity.update(one.id, one);
      MessageUtil.success(`代码更新成功`);
      await resetWebConfig(key);
    } catch (e) {
      MessageUtil.success(`代码更新失败，代码解析失败${e.message}`);
    }

    return;
  }
  try {
    const ent = new WebConfigEntity();
    parseWebConfig(base64ToStr(code));
    ent.key = key;
    ent.code = code;
    ent.sort = 0;
    await ent.save();
    MessageUtil.success('代码保存成功');
  } catch (e) {
    MessageUtil.success(`代码保存失败，代码解析失败${e.message}`);
  }
};
/**
 * 获取webConfig
 */
export const getWebConfigCode = async (key: string) => {
  const one = await WebConfigEntity.findOne({ where: { key } });
  return one?.code;
};
/**
 * 列出webConfig
 */
export const listWebConfig = async () => {
  return await WebConfigEntity.find();
};
