export interface skinInfo{
    loadingImg?:string
    iconImg?:string
    mainImg?:string
    chromasBelongId?:string
    name?:string
}
export interface heroInfo {
    heroId?:number
    name?:string
    title?:string
    alias?:string
    skins?:skinInfo[]
}
export interface mainHeroInfo{
    heroId?:string
    title?:string
    alias?:string
}
export default {}