/**
 * 主进程的preload
 */
window.onload = () => {
  console.log('load:', window.location.href);
};
window.onmessage = (env: any) => {
  // console.log(env);
};
