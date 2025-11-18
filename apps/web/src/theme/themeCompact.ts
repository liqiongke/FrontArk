import { theme } from 'antd';

// 紧凑主题样式
const themeCompact = {
  algorithm: theme.compactAlgorithm,
  cssVar: true,
  token: {
    borderRadius: 2,
  },
  components: {
    Table: {},
    Input: {},
  },
};

export default themeCompact;
