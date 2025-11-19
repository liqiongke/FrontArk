import axios, { type AxiosInstance } from 'axios';
import { isString } from 'lodash';
import { type ErrorHandler, AUTH_TOKEN_KEY } from './interface';

class NetUtils {
  static service: AxiosInstance;

  /**
   * 初始化网络请求
   * @param baseURL - 基础URL
   * @param errorHandler - 错误处理函数，用于处理请求和响应拦截器中的异常
   */
  static init = (baseURL: string, errorHandler: ErrorHandler) => {
    this.service = axios.create({
      baseURL: baseURL,
      timeout: 15000,
    });

    // 添加请求拦截器
    this.service.interceptors.request.use(
      (config) => {
        // 添加授权Token
        const token = NetUtils.getToken();
        if (!token) {
          errorHandler(401, '未找到授权Token', 'request');
          return Promise.reject(new Error('未找到授权Token'));
        }
        config.headers.Authorization = `Bearer ${token}`;
        return config;
      },
      (error) => {
        // 请求拦截器异常处理
        errorHandler(500, error.message || '请求拦截器异常', 'request');
        return Promise.reject(error);
      },
    );

    // 添加响应拦截器
    this.service.interceptors.response.use(
      (response) => {
        return response;
      },
      (error) => {
        // 响应拦截器异常处理
        if (errorHandler) {
          const code = error.response?.status || 500;
          const message = error.response?.data?.message || error.message || '响应拦截器异常';
          errorHandler(code, message, 'response');
        }
        return Promise.reject(error);
      },
    );

    const token = this.getToken();
    console.log('token', token);
    if (!token) {
      this.handleUnauthorized();
    }
  };

  // 获取token的值
  static getToken = () => {
    return localStorage.getItem(AUTH_TOKEN_KEY);
  };

  // 跳转到登录页
  static handleUnauthorized = () => {
    localStorage.removeItem(AUTH_TOKEN_KEY);

    // 检查当前路径是否已经是登录页，如果是则不跳转
    const loginUrl = import.meta.env.VITE_LOGIN_URL;
    if (window.location.pathname !== loginUrl) {
      window.history.replaceState(null, '', import.meta.env.VITE_LOGIN_URL);
      window.location.replace(loginUrl);
    }
  };

  // 这里要单独处理登录请求，因为登录请求没有授权Token
  // 这里的登录地址需要去 .env 中配置 VITE_LOGIN_URL
  static login = async (data: any) => {
    const result = await axios.post(
      `${import.meta.env.VITE_BASE_URL}${import.meta.env.VITE_LOGIN_URL}`,
      data,
    );

    // 校验请求状态
    if (result.status !== 200) {
      return Promise.reject(new Error('登录失败'));
    }

    // 获取请求头部的token
    const token = result.headers['authorization'];
    if (!isString(token) || token.length === 0) {
      return Promise.reject(new Error('未找到授权Token'));
    }
    localStorage.setItem(AUTH_TOKEN_KEY, token);
    return result.data;
  };

  static get(url: string, params?: any) {
    return this.service.get(url, { params });
  }

  static post(url: string, data?: any) {
    return this.service.post(url, data);
  }
}

export default NetUtils;
