import netInit from './net';

const init = () => {
  // 全局密度：紧凑（替代原 antd compactAlgorithm）
  document.documentElement.dataset.density = 'compact';
  // 初始化网络相关配置
  netInit();
};

export default init;
