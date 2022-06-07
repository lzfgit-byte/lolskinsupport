export interface skinInfo {
  loadingImg?: string;
  iconImg?: string;
  mainImg?: string;
  chromasBelongId?: string; //0 为主皮肤 其他为附加炫彩
  name?: string; //哥特萝莉 安妮
  description?: string; //她的母亲死了。她的父亲死了。但安妮还活着，领会着暗中之美。
  skinId?: string;
}
export interface heroInfo {
  heroId?: number;
  name?: string; //黑暗之女
  title?: string; //安妮
  alias?: string; //Annie
  skins?: skinInfo[];
}
export interface mainHeroInfo {
  heroId?: number;
  name?: string; //黑暗之女
  title?: string; //安妮
  alias?: string; //Annie
  keywords?: string; //搜索关键字
}
export default {};
