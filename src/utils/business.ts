import type {
  Analysis,
  AnalysisDetail,
  AnalysisVideoDetail,
  BaseConfig,
  CComic,
  CContent,
  DetailInfo,
  Item,
  Page,
  UrlReplace,
  WebConfig,
} from '@ghs/types';
import type { CollectEntity, ComicHistory, ConfigEntity, ViewedHistoryEntity } from '@ghs/constant';

import { debounce } from 'lodash';
import { getCurrentBusiness } from '../../electron/business/business';
import { getCurrentKey } from '../../electron/business/use-init-web-config';
import { executeJs, pluginGetMove, pluginMoveFiles } from '../../electron/export';
import { executeFunction } from '@/utils/ipc';

/**
 * 获取图片
 * @param url
 */
export const f_getHtml = async (url: string): Promise<string> => {
  return executeFunction('getHtml', url);
};
/**
 * 使用新窗口获取数据
 * @param url
 */
export const f_getImage = async (url: string): Promise<string> => {
  return executeFunction('getImage', url);
};
/**
 * 使用新窗口获取数据的封装
 * @param code
 * @param url
 */
export const f_winGetDataCode = async (code: string, url: string): Promise<any> => {
  return executeFunction('winGetDataCode', { code, url });
};

/**
 * 使用新窗口打开的封装
 * @param url
 * @param code
 * @param width
 * @param height
 */
export const f_winOpenAny = async (url: string, code: string, width: number, height: number) => {
  return executeFunction('winOpenAny', url, code, width, height);
};

/**
 * 获取远程data的string格式
 * @param url
 */
export const f_getDataString = async (url: string): Promise<string> => {
  return executeFunction('getDataString', url);
};

// 后边是前端前端控制器
/**
 *获取所有的配置项
 */
export const f_listAllWebConfigs = async (): Promise<WebConfig[]> => {
  return executeFunction('listAllWebConfigs');
};
/**
 * 获取当前的key的封装
 */
export const f_getCurrentKey = async (): Promise<string> => {
  return executeFunction('getCurrentKeyExp');
};
/**
 * 获取当前的config
 */
export const f_getCurrentWebConfig = async (key: string): Promise<BaseConfig> => {
  return executeFunction('getCurrentWebConfig', key);
};
/**
 * 设置当前的key的封装
 */
export const f_setCurrentKeyExp = async (key: string) => {
  return executeFunction('setCurrentKeyExp', key);
};
/**
 * 获取主页基本信息的封装
 * @param key
 */
export const f_getPage = async (key: string): Promise<Page> => {
  return executeFunction('getPage', key);
};
/**
 * 代理加载页面功能
 * @param url 页面URL
 */
export const f_loadPage = async (url: string): Promise<Page> => {
  return executeFunction('loadPage', url);
};

/**
 * 调用搜索功能
 */
export const f_search = async (search: string, item: Item): Promise<string> => {
  return executeFunction('search', search, item);
};
/**
 * 搜索推荐
 */
export const f_searchRecommend = async (search: string): Promise<string[]> => {
  return executeFunction('searchRecommend', search);
};

/**
 * 收藏操作在这里 列出收藏
 */
export const f_listCollect = async (key: string = null): Promise<CollectEntity[]> => {
  return executeFunction('listCollect', key);
};
/**
 * 判断是否已经收藏
 */
export const f_isCollect = async (item: Item): Promise<boolean> => {
  return executeFunction('isCollect', item);
};
/**
 * 保存或是更新收藏
 */
export const f_saveCollect = async (item: Item) => {
  return executeFunction('saveCollect', item);
};
/**
 * 取消收藏 cancelCollect
 */
export const f_cancelCollect = async (item: Item) => {
  return executeFunction('cancelCollect', item);
};
/**
 * 获取detail
 */
export const f_getDetailPage = async (item: Item): Promise<DetailInfo> => {
  return executeFunction('getDetailPage', item);
};
// 0-------------------历史记录------------------------0
/**
 * 列出观看记录
 */
export const f_listHistory = async (): Promise<ViewedHistoryEntity[]> => {
  return executeFunction('listHistory');
};
// 0-----------------------缓存操作-----------------------------0
/**
 * 根据特定后缀去删除文件
 * @param fileSuffix
 */
export const f_cacheSuffixClean = (fileSuffix?: any) => {
  return executeFunction('cache_suffix_clean', fileSuffix);
};
export const f_cacheDirSize = () => {
  return executeFunction('cache_dir_size');
};
export const f_cacheDirDb = () => {
  return executeFunction('cache_dir_db');
};
/**
 * 存储db path
 * @param path
 */
export const f_appSetDbDir = (path: string): Promise<boolean> => {
  return executeFunction('app_set_db_dir', path);
};
/**
 * 处理排序方法
 */
export const f_adapterLoadUrl = (url: string, urlReps: UrlReplace[]): Promise<boolean> => {
  return executeFunction('adapterLoadUrl', url, urlReps);
};
/**
 * 导入
 */
export const f_importFavorite = (path: string) => {
  return executeFunction('importFavorite', path);
};
/**
 *
 */
/**
 * 删除搜索记录
 */
export const f_deleteSearch = async (searchValue: string) => {
  return executeFunction('deleteSearch', searchValue);
};
/**
 * 保存WebConfig
 * @param key
 * @param code
 */
export const f_saveWebConfigCode = async (key: string, code: string) => {
  return executeFunction('saveWebConfigCode', key, code);
};
/**
 * 获取webConfig
 */
export const f_getWebConfigCode = async (key: string) => {
  return executeFunction('getWebConfigCode', key);
};
/**
 * 列出webConfig
 */
export const f_listWebConfig = async () => {
  return executeFunction('listWebConfig');
};

/**
 * 获取系统配置
 */
export const f_listSystemConfig = async (): Promise<ConfigEntity[]> => {
  return executeFunction('listSystemConfig');
};
/**
 * 更新系统配置
 */
export const f_updateSystemConfig = async (key: string, value: string) => {
  return executeFunction('updateSystemConfig', key, value);
};
/**
 * 重启程序
 */
export const f_restartAPP = () => {
  return executeFunction('restartAPP');
};
/**
 * 获取目录
 */
export const f_getContent = (url: string): Promise<CContent[]> => {
  return executeFunction('getContent', url);
};
/**
 * 获取漫画图片
 */
export const f_getComicIImages = (url: string): Promise<CComic[]> => {
  return executeFunction('getComicIImages', url);
};
/**
 * 获取当前的目录url
 */
export const f_getCurrentContentUrl = (): Promise<ComicHistory> => {
  return executeFunction('getCurrentContentUrl');
};
/**
 * 获取当前的目录url
 */
export const f_updateCurrentComic = debounce((per: number) => {
  return executeFunction('updateCurrentComic', per);
}, 100);
/**
 *清楚当前的url
 */
export const f_clearCurrentUrl = async () => {
  return executeFunction('clearCurrentUrl');
};
/**
 * 获取页面的解析数据
 */
export const f_getAnalysisDetail = async (item: Analysis): Promise<AnalysisDetail[]> => {
  return executeFunction('getAnalysisDetail', item);
};
/**
 * 获取 视频播放详细 AnalysisVideoDetail
 */
export const f_getAnalysisVideoDetail = async (
  item: AnalysisDetail
): Promise<AnalysisVideoDetail[]> => {
  return executeFunction('getAnalysisVideoDetail', item);
};
export const f_getSeriesCurrentContent = async (): Promise<ComicHistory> => {
  return executeFunction('getSeriesCurrentContent');
};
export const f_getServers = async (): Promise<string[]> => {
  return executeFunction('getServers');
};
export const f_executeJs = async (url: string, code: string, show = false): Promise<any> => {
  return executeFunction('executeJs', url, code, show);
};
/**
 *
 */
export const f_pluginMoveFiles = async (keyword: string, sourceDir: string, targetDir: string) => {
  return executeFunction('pluginMoveFiles', keyword, sourceDir, targetDir);
};
export const f_pluginGetMove = async () => {
  return executeFunction('pluginGetMove');
};
