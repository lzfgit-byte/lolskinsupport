import type { CheerioAPI } from 'cheerio';
import type { Cheerio } from 'cheerio/lib/cheerio';
import type { Element } from 'domhandler';
import type { Analysis } from '../../dist';
import type {
  AnalysisDetail,
  AnalysisVideoDetail,
  DetailInfo,
  Item,
  Pagination,
  Tag,
  UrlAppend,
  UrlReplace,
} from '@/business/index';

export type SetTag = '标签' | '收藏' | '历史' | '过滤选项' | '系统配置' | '日志' | '配置';
export interface CContent {
  title: string;
  url: string;
  isCurrent: boolean;
}
export interface CComic {
  url: string;
  extra: Record<string, any>;
}
export interface BaseConfig {
  key: string;
  favicon: string;
  homeUrl: string;
  name: string;
  searchUrl: string;

  imgWidth: string;
  imgHeight: string;

  drawWidth: string;
  inputWidth?: string;
  historyRemember: number;

  setTags: SetTag[];

  ifWinExecCode?: string;
  winWidth?: number;
  winHeight?: number;

  currentUrlReplace: UrlReplace[];
  currentUrl?: string;

  adapterImageCode?: string;
  comicImgMaxWidth?: string;
  [key: string]: any;
}

export interface WebConfig extends BaseConfig {
  // 获取首页条件更改时的 replace 列表
  getUrlReplace: ($: CheerioAPI) => UrlReplace[];
  // 自定义html获取
  adapterGetHtml?: (url: string) => Promise<any>;

  // 获取页面元素
  getItems: ($: CheerioAPI) => Item[];
  // 获取分页数据
  getPagination: ($: CheerioAPI) => Pagination[];
  // 获取全部分类
  getTags: ($: CheerioAPI) => Tag[];

  getDetailInfo: (item: Item, cheerio: any) => Promise<DetailInfo>;

  // 处理排序等问题时调用
  adapterLoadUrl: (url: string, urlReplaces: UrlReplace[]) => string;
  // 处理搜索问题时调用
  adapterSearchUrl: (url: string, item: Item) => string;
  // adapter
  adapterRemoteSearch?: (searchKey: string, cheerio: any) => Promise<string[]>;
  // 漫画处理,获取目录
  getContents?: (url: string, cheerio: any) => Promise<CContent[]>;
  // 漫画处理,获取图片
  getComicImages?: (url: string, cheerio: any) => Promise<CComic[]>;
  // 电视剧处理，多解析原处理
  getAnalysisDetail?: (item: Analysis, cheerio: any) => Promise<AnalysisDetail[]>;
  // 获取剧集的url
  getAnalysisVideoDetail?: (item: AnalysisDetail, cheerio: any) => Promise<AnalysisVideoDetail[]>;
}
