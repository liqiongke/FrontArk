// 网络请求初始化
import { message } from 'antd';
import { NetUtils } from 'framework';

const netInit = () => {
  NetUtils.init(import.meta.env.BASE_URL, (code, msg, type) => {
    if (code === 401) {
      NetUtils.handleUnauthorized();
    }
    message.error(`${type}错误[code ${code}]: ${msg}`);
  });
};

export default netInit;
