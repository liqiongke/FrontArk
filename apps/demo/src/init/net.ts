// 网络请求初始化
import { NetUtils } from '@jl/framework';
import { message } from 'antd';

const netInit = () => {
  NetUtils.init(
    import.meta.env.VITE_BASE_URL,
    import.meta.env.VITE_LOGIN_URL,
    import.meta.env.VITE_API_LOGIN,
    (code, msg, type) => {
      if (code === 401) {
        NetUtils.handleUnauthorized();
      }
      message.error(`${type}错误[code ${code}]: ${msg}`);
    },
  );
};

export default netInit;
