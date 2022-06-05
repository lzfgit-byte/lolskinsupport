
export { }
//此处添加给windows的新变量
declare global {
  interface Window {
    removeLoading: () => void
  }
}
