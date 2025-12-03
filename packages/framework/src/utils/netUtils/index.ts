import axios, { type AxiosInstance } from 'axios';
import { isString } from 'lodash';
import { type ErrorHandler, type Result } from './interface';
import TokenUtils from './tokenUtils';

class NetUtils {
  // 基础url
  static baseUrl: string;
  // 登录页地址
  static loginUrl: string;
  // 登录接口
  static loginAPI: string;
  // 请求接口
  static service: AxiosInstance;
  // 过期时间
  static tokenExpireTime: number;

  /**
   * 初始化网络请求
   * @param baseURL - 基础URL
   * @param errorHandler - 错误处理函数，用于处理请求和响应拦截器中的异常
   */
  static init = (
    baseURL: string,
    loginUrl: string,
    loginAPI: string,
    errorHandler: ErrorHandler,
    tokenExpireTime: number = 7200000,
  ) => {
    this.baseUrl = baseURL;
    this.loginUrl = loginUrl;
    this.loginAPI = loginAPI;
    this.tokenExpireTime = tokenExpireTime;
    this.service = axios.create({
      baseURL: baseURL,
      timeout: 15000,
    });

    // 添加请求拦截器
    this.service.interceptors.request.use(
      (config) => {
        const token = TokenUtils.getToken();
        if (!token) {
          errorHandler(401, '未找到授权Token', 'request');
          return Promise.reject(new Error('未找到授权Token'));
        }
        config.headers.Authorization = token;
        return config;
      },
      (error) => {
        // 请求拦截器异常处理
        errorHandler(500, error.message || '请求拦截器异常', 'request');
        return Promise.reject(error);
      },
    );

    this.service.interceptors.response.use(
      (response) => {
        return response;
      },
      (error) => {
        if (errorHandler) {
          const code = error.response?.status || 500;
          const message = error.response?.data?.message || error.message || '响应拦截器异常';
          errorHandler(code, message, 'response');
        }
        return Promise.reject(error);
      },
    );

    TokenUtils.checkToken(this.loginUrl);
  };

  // 这里的登录接口需要从 .env 中配置 VITE_API_LOGIN
  static login = async <T>(data: any): Promise<Result<T>> => {
    const result = await axios.post(`${this.baseUrl}${this.loginAPI || 'login'}`, data);

    // 校验请求状态
    if (!result || result.status !== 200) {
      return { code: result.status, message: '登录失败' };
    }

    const header = result.headers;
    if (!header) {
      return { code: 400, message: '获取请求头失败' };
    }

    // 获取请求头部的中的token,如果获取不到,是因为跨域资源共享 (CORS) 策略限制,需要在服务器端请求头添加
    // Access-Control-Expose-Headers: Authorization, X-Rate-Limit
    const token = header.authorization || header.Authorization;
    if (!isString(token) || token.length === 0) {
      return { code: 400, message: '未找到授权Token' };
    }
    TokenUtils.setToken(token, this.tokenExpireTime);

    return result.data;
  };

  static checkToken = () => {
    TokenUtils.checkToken(this.loginUrl);
  };

  static handleUnauthorized = () => {
    TokenUtils.clearTokenAndJumpToLogin(this.loginUrl);
  };

  static get = async (url: string, params?: any): Promise<Result<any>> => {
    return (await this.service.get(`${this.baseUrl}${url}`, params)).data;
  };

  static post = async (url: string, data?: any): Promise<Result<any>> => {
    return (await this.service.post(`${this.baseUrl}${url}`, data)).data;
  };
}

export default NetUtils;
