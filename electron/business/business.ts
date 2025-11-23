import type {
  Analysis,
  CComic,
  CContent,
  DetailInfo,
  Item,
  Page,
  Pagination,
  Tag,
  WebConfig,
} from '@ghs/types';
import * as cheerio from 'cheerio';
import type { CheerioAPI } from 'cheerio';
// @ts-ignore
import type { Cheerio } from 'cheerio/lib/cheerio';
import type { Element } from 'domhandler';
import { isFalsity, isFunction } from '@ilzf/utils';
import { ComicHistory, SearchHistoryEntity, ViewedHistoryEntity } from '@ghs/constant';
import type { AnalysisDetail, AnalysisVideoDetail } from '@ghs/types/src';
import { getHtml } from '../export';
import { LogMsgUtil, MessageUtil } from '../utils/message';
import { NormalFunc } from './common-func';
import { getWebConfigByKey } from './use-init-web-config';

class BaseBusiness extends NormalFunc {
  private key: string;
  private comicDetailUrl = '';
  private currentUrl = '';
  private currentItem: Item = null;
  private searchLock = false;
  private searchCache = {};
  $: CheerioAPI;
  webConfig: WebConfig;
  public constructor(key: string, code: WebConfig) {
    super();
    this.key = key;
    this.webConfig = code;
  }

  private getComicUrl(): string {
    return this.comicDetailUrl;
  }

  private setComicUrl(url: string) {
    this.comicDetailUrl = url;
  }

  // 获取页面的元素数据
  private getItems(): Item[] {
    return this.webConfig.getItems(this.$);
  }

  // 获取页面的分页数据;
  private getPagination(): Pagination[] {
    return this.webConfig.getPagination(this.$);
  }

  // 获取首页的标签数据
  private getTags(): Tag[] {
    return this.webConfig.getTags(this.$);
  }

  // 存储搜索历史记录
  private async saveSearchKey(key: string) {
    const one = await SearchHistoryEntity.findOne({
      where: { value: key, type: this.webConfig.key },
    });
    if (!isFalsity(one)) {
      return;
    }
    const ent = new SearchHistoryEntity();
    ent.type = this.webConfig.key;
    ent.value = key;
    await ent.save();
  }

  // 存储观看历史
  private async saveViewHistory(item: Item) {
    const [list, count] = await ViewedHistoryEntity.findAndCount({
      where: { type: this.webConfig.key },
      order: { createTime: 'desc' },
    });
    if (count > this.webConfig.historyRemember) {
      list.splice(this.webConfig.historyRemember, count).forEach((item) => {
        ViewedHistoryEntity.delete(item.id);
      });
    }

    const ent = new ViewedHistoryEntity();
    ent.type = this.webConfig.key;
    ent.value = JSON.stringify(item);
    ent.url = item.jumpUrl;

    const one = await ViewedHistoryEntity.findOne({ where: { url: item.jumpUrl } });
    if (isFalsity(one)) {
      await ent.save();
      LogMsgUtil.sendLogMsg(`历史观看记录保存成功: ${ent.value}`);
    } else {
      one.createTime = new Date();
      await ViewedHistoryEntity.update(one.id, one);
    }
  }

  /**
   * 获取页面数据，包含首页，搜索页
   */
  public async getPage(url = null): Promise<Page> {
    if (url === null && this.currentUrl === '') {
      url = this.webConfig.homeUrl;
      this.currentUrl = url;
    } else if (url === null && this.currentUrl !== '') {
      url = this.currentUrl;
    } else {
      url = this.webConfig.adapterLoadUrl(url, this.webConfig.currentUrlReplace);
      this.currentUrl = url;
    }
    this.webConfig.currentUrl = this.currentUrl;
    LogMsgUtil.sendLogMsg('页面加载：', this.webConfig.key, 'url>', url, '\ncu>', this.currentUrl);

    const html = isFunction(this.webConfig?.adapterGetHtml)
      ? await this.webConfig?.adapterGetHtml(url)
      : await getHtml(url);
    this.$ = cheerio.load(html);
    this.searchLock = false;
    return {
      items: this.getItems(),
      pagination: this.getPagination(),
      tags: this.getTags(),
      urlReplace: this.webConfig.getUrlReplace(this.$),
    };
  }

  /**
   *item 点击后，获取详细信息
   */
  public async getDetailPage(item: Item): Promise<DetailInfo> {
    this.saveViewHistory(item).then();
    LogMsgUtil.sendLogMsg(this.webConfig.key, 'jumpUrl', item.jumpUrl);
    this.currentItem = item;
    return this.webConfig.getDetailInfo(item, cheerio);
  }

  /**
   * 搜索
   */
  public search(keyword: string, item: Item): string {
    if (isFalsity(keyword)) {
      return;
    }
    this.saveSearchKey(keyword).then();
    if (!isFunction(this.webConfig.adapterSearchUrl)) {
      MessageUtil.error('未定义搜索方法');
      return;
    }
    return this.webConfig.adapterSearchUrl(keyword, item);
  }

  public async adapterRemoteSearch(searchKey: string): Promise<string[]> {
    if (!this.webConfig.adapterRemoteSearch) {
      return [];
    }
    if (this.searchCache[searchKey]) {
      LogMsgUtil.sendLogMsg('缓存命中');
      return this.searchCache[searchKey];
    }
    if (this.searchLock) {
      LogMsgUtil.sendLogMsg('锁定');
      return this.searchCache[searchKey] || [];
    }
    this.searchLock = true;
    const res = await this.webConfig.adapterRemoteSearch(searchKey, cheerio);
    this.searchCache[searchKey] = res;
    this.searchLock = false;
    return res;
  }

  /**
   * 漫画获取目录
   */
  public async getContents(url: string): Promise<CContent[]> {
    if (!isFunction(this.webConfig.getContents)) {
      MessageUtil.error('未定义漫画目录获取方法');
      return [];
    }
    this.setComicUrl(url);
    return this.webConfig?.getContents(url, cheerio);
  }

  public async getComicImages(url: string): Promise<CComic[]> {
    if (!isFunction(this.webConfig.getComicImages)) {
      MessageUtil.error('未定义漫画图片获取方法');
      return [];
    }
    const detailEnt = await ComicHistory.findOne({ where: { detailUrl: this.getComicUrl() } });
    if (detailEnt) {
      if (detailEnt.contentUrl !== url) {
        detailEnt.contentUrl = url;
        detailEnt.currentImage = 0;
      }
      await ComicHistory.update(detailEnt.id, detailEnt);
    } else {
      const comicHistory = new ComicHistory();
      comicHistory.detailUrl = this.getComicUrl();
      comicHistory.contentUrl = url;
      comicHistory.currentImage = 0;
      await comicHistory.save();
    }
    return await this.webConfig?.getComicImages(url, cheerio);
  }

  /**
   * 获取历史记录里的最新漫画阅读记录
   */
  public async getComicCurrentContent(): Promise<ComicHistory> {
    const detailEnt = await ComicHistory.findOne({ where: { detailUrl: this.getComicUrl() } });
    if (detailEnt) {
      return detailEnt;
    }
    return null;
  }

  public async updateCurrentComic(per: number) {
    const detailEnt = await ComicHistory.findOne({ where: { detailUrl: this.getComicUrl() } });
    if (isFalsity(per)) {
      LogMsgUtil.sendLogMsg(`更新当前漫画进度失败per为:${per}`);
      return;
    }
    detailEnt.currentImage = per;
    await ComicHistory.update(detailEnt.id, detailEnt);
  }

  /**
   * 获取历史记录里的最新漫画阅读记录
   */
  public async getSeriesCurrentContent(): Promise<ComicHistory> {
    const detailEnt = await ComicHistory.findOne({
      where: { detailUrl: this.currentItem.jumpUrl },
    });
    if (detailEnt) {
      return detailEnt;
    }
    return null;
  }

  public async saveOrUpdateSeriesWatchHistory(analysisDetail: AnalysisDetail) {
    if (!this.currentItem) {
      LogMsgUtil.sendLogMsg('未找到当前item');
      return;
    }
    const detailEnt = await ComicHistory.findOne({
      where: { detailUrl: this.currentItem.jumpUrl },
    });
    if (detailEnt) {
      detailEnt.contentUrl = analysisDetail.url;
      await ComicHistory.update(detailEnt.id, detailEnt);
    } else {
      const comicHistory = new ComicHistory();
      comicHistory.detailUrl = this.currentItem.jumpUrl;
      comicHistory.contentUrl = analysisDetail.url;
      comicHistory.currentImage = 0;
      await comicHistory.save();
    }
  }

  public async clearCurrentUrl() {
    this.currentUrl = '';
  }

  public async getAnalysisDetail(item: Analysis): Promise<AnalysisDetail[]> {
    return this.webConfig?.getAnalysisDetail(item, cheerio);
  }

  public async getAnalysisVideoDetail(item: AnalysisDetail): Promise<AnalysisVideoDetail[]> {
    await this.saveOrUpdateSeriesWatchHistory(item);
    return this.webConfig?.getAnalysisVideoDetail(item, cheerio);
  }
}

/**
 * business 缓存
 */
const cache: Record<string, BaseBusiness> = {};
export const getCurrentBusiness = (key: string) => {
  let res: BaseBusiness = cache[key];
  if (isFalsity(res)) {
    res = new BaseBusiness(key, getWebConfigByKey(key));
    cache[key] = res;
  }
  return res;
};
export const resetCurrentBusiness = (key: string) => {
  if (cache[key]) {
    delete cache[key];
  }
};
