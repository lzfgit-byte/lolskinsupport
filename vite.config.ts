import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import electron from 'vite-plugin-electron'
import electronRenderer from 'vite-plugin-electron/renderer'
import polyfillExports from 'vite-plugin-electron/polyfill-exports'
import electronConfig from './vite-electron.config'
import {resolve} from "path";

export default defineConfig({
  base: './',
  plugins: [
    vue(),
    electron(electronConfig),
    electronRenderer(),
    polyfillExports(),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '~@': resolve(__dirname, './src'),
    },
  },
  build: {
    emptyOutDir: false,
  },
})
