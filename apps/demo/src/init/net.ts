// 网络请求初始化
import { NetUtils, notify } from '@jl/framework';
import { createHashNavigation, isDesktop } from './platform';

const netInit = () => {
  NetUtils.init(
    import.meta.env.VITE_BASE_URL,
    import.meta.env.VITE_LOGIN_URL,
    import.meta.env.VITE_API_LOGIN,
    (code, msg, type) => {
      if (code === 401) {
        NetUtils.handleUnauthorized();
      }
      notify.error(`${type}错误[code ${code}]: ${msg}`);
    },
    undefined,
    isDesktop ? createHashNavigation() : undefined,
  );
};

export default netInit;
