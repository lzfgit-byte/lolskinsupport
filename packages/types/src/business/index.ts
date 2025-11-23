export interface Pagination {
  url: string;
  title: string;
  isCurrent: boolean;
}
export interface Tag {
  title?: string;
  url?: string;
}
export enum ItemType {
  video = 'video',
  image = 'image',
  text = 'text',
  comic = 'comic',
}
// 将上边枚举转换为联合类型
export type ItemTypeUnion = keyof typeof ItemType;
export enum ItemDetailType {
  mp4 = 'mp4',
  m3u8 = 'm3u8',
  image = 'image',
  win = 'win',
  comic = 'comic',
  // 序列
  series = 'series',
}
// 将上边枚举转换为联合类型
export type ItemDetailTypeUnion = keyof typeof ItemDetailType;
export enum RenderType {
  force = 'force',
  normal = 'normal',
}
// 将上边枚举转换为联合类型
export type RenderTypeUnion = keyof typeof RenderType;
export interface Detail {
  type?: ItemDetailTypeUnion;
  url?: string;
  fullUrl?: string;
  quality?: string;
  title?: string;
  comments?: Comment[];
}
export interface Item {
  coverImg: string;
  title: string;
  type: ItemTypeUnion;
  jumpUrl: string;
  // 渲染类型,强制渲染,正常渲染
  renderType: RenderTypeUnion;
  tags: Tag[];
}
export interface UrlAppend {
  value: string;
  param: string;
  // 展示的名字
  title: string;
  // 是否当前的过滤条件
  current: boolean;
}
export interface UrlReplace {
  // 分组
  schema: string;
  urlAppend: UrlAppend[];
}
export interface Comment {
  datetime: string;
  comment: string;
  image?: string;
}

/**
 *
 */
export interface Analysis {
  url: string;
  title: string;
  total: number;
}
export interface AnalysisDetail {
  url: string;
  title: string;
}
export interface AnalysisVideoDetail {
  type?: string | 'mp4' | 'm3u8';
  url?: string;
  name?: string;
  description?: string;
  [x: string]: any;
}
/**
 *点击Item,后获取详细信息
 */
export interface DetailInfo {
  detailType: ItemDetailTypeUnion;
  // 渲染类型,强制渲染,正常渲染
  renderType: RenderTypeUnion;
  details: Detail[];
  relations: Item[];
  // 系列明细，支持电视剧
  analysis?: Analysis[];
}

/**
 * 每一页的类型
 */
export interface Page {
  // 分页
  pagination: Pagination[];
  tags: Tag[];
  items: Item[];
  urlReplace?: UrlReplace[];
}

export * from './web-config';
