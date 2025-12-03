import { theme, type ThemeConfig } from 'antd';

// 紧凑主题样式
const themeCompact: ThemeConfig = {
  algorithm: theme.compactAlgorithm,
  token: {
    borderRadius: 2,
  },
  components: {
    Table: {},
    Input: {},
  },
};

export default themeCompact;
