export interface MessageInfo {
  key?: string;
  msg?: string;
  percentage?: number;
  title?: string;
  type?: 'error' | 'info' | 'success' | 'warning';
  close?: boolean;
}
