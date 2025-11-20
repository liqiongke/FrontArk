import { AUTH_TOKEN_KEY, AUTH_TOKEN_EXPIRE_KEY } from './interface';

class TokenUtils {
  // 设置token和过期时间
  static setToken = (token: string, expireTime: number) => {
    localStorage.setItem(AUTH_TOKEN_KEY, token);

    // 保存token过期时间
    if (expireTime) {
      const expireTimestamp = Date.now() + expireTime;
      localStorage.setItem(AUTH_TOKEN_EXPIRE_KEY, expireTimestamp.toString());
    }
  };

  // 获取token的值
  static getToken = () => {
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    if (!token) {
      return null;
    }

    // 检查token是否过期
    const expireTime = localStorage.getItem(AUTH_TOKEN_EXPIRE_KEY);
    if (expireTime) {
      const now = Date.now();
      if (now > parseInt(expireTime, 10)) {
        // token已过期，清除并返回null
        this.clearToken();
        return null;
      }
    }

    return token;
  };

  // 清除本地token
  static clearToken = () => {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(AUTH_TOKEN_EXPIRE_KEY);
  };

  // 处理未授权情况
  static clearTokenAndJumpToLogin = (loginUrl: string) => {
    this.clearToken();

    if (window.location.pathname !== loginUrl) {
      // 清空历史记录
      window.history.replaceState(null, '', loginUrl);
      // 跳转至登录页
      window.location.replace(loginUrl);
    }
  };

  // 检查token是否存在
  static checkToken = (loginUrl: string) => {
    const token = this.getToken();
    if (!token) {
      this.clearTokenAndJumpToLogin(loginUrl);
    }
  };
}

export default TokenUtils;
