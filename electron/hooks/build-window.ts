/**
 * 构建进度通知。
 *
 * 自动构建皮肤是后台行为：页面日志抽屉不动，进度和结果用侧边通知窗口提示 ——
 * 样式和 `showSliderConfirm` 完全一致（`use-confirm-window.ts` 的同一套卡片和滑入动画），
 * 只是把按钮换成进度条，由 `autoBuildSkin()` 持续 `updateBuildWindow()`。
 *
 * 进程内只保留一个通知；再次开始构建会先把旧的关掉。
 */

import {
  showProgressNotice,
  type ProgressNoticeHandle,
  type ProgressNoticePayload,
} from './use-confirm-window';

export type BuildProgressPayload = ProgressNoticePayload;

let notice: ProgressNoticeHandle | null = null;

/** 打开（或复用）构建进度通知 */
export const showBuildWindow = (title = '正在构建皮肤') => {
  if (notice) {
    notice.close();
  }
  notice = showProgressNotice({ title, width: 340, height: 98 });
  notice.update({ title, percent: 0, message: '准备中…', state: 'running' });
};

/** 更新进度 / 状态 */
export const updateBuildWindow = (payload: BuildProgressPayload) => {
  notice?.update(payload);
};

/** 关闭通知；delayMs > 0 时延迟关闭（成功后留一点时间看结果） */
export const closeBuildWindow = (delayMs = 0) => {
  if (!notice) {
    return;
  }
  const current = notice;
  notice = null;
  current.close(delayMs);
};

export const isBuildWindowOpen = (): boolean => !!notice && notice.isVisible();
