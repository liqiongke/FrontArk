import { theme, type ThemeConfig } from 'antd';

// 默认主题样式
const themeDefault: ThemeConfig = {
  algorithm: theme.defaultAlgorithm,
  token: {
    borderRadius: 2,
  },
  components: {
    Table: {},
    Input: {},
  },
};

export default themeDefault;
