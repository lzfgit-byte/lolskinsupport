import * as process from 'node:process';
import axios from 'axios';
// vite vue3 判断是不是开发环境
export const isDev = process.env.NODE_ENV === 'development';
const instance = axios.create({
  baseURL: isDev ? '/api' : '',
  timeout: 10000,
});

instance.interceptors.request.use(
  (config) => {
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

instance.interceptors.response.use(
  (response) => {
    return response.data;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// 封装 get 请求
export const get = (url: string, params = {}): Promise<any> => {
  return instance.get(url, {
    params,
  });
};

// 封装 post 请求
export const post = (url: string, data = {}) => {
  return instance.post(url, data);
};

// 导出实例
export default instance;
