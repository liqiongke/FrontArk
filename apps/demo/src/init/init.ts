import netInit from './net';

const init = () => {
  // 全局采用标准密度，页面布局按容器宽度自适应。
  document.documentElement.dataset.density = 'default';
  // 初始化网络相关配置
  netInit();
};

export default init;
