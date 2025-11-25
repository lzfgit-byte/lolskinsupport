export * from './event';
export * from './system';
export * from './shortcuts';
export * from './table';
export const SKIN_PATH = 'SKIN_PATH';
export const GAME_PATH = 'GAME_PATH';
export const OVERLAY_PATH = 'OVERLAY_PATH';
export const OVERLAY_CONFIG_PATH = 'OVERLAY_CONFIG_PATH';
export const MOD_TOOLS_PATH = 'MOD_TOOLS_PATH';
export const INSTALLED_PATH = 'INSTALLED_PATH';
export const HERO_SKIN = 'HERO_SKIN';
export interface ShowSliderConfirmType {
  title: string;
  msg?: string;
  okText?: string;
  cancelText?: string;
  delay?: number;
  src?: string;
}
