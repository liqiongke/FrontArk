// 菜单项接口定义
export interface MenuItem {
  key: string;
  label: string;
  children?: MenuItem[];
}

// 菜单数据
export const menuData: MenuItem[] = [
  {
    key: '/',
    label: '首页',
  },
  {
    key: '/base',
    label: '基础数据',
    children: [
      {
        key: '/base/dict',
        label: '字典',
      },
      {
        key: '/base/setting',
        label: '设置',
      },
    ],
  },
  {
    key: '/demo',
    label: 'Demo',
    children: [
      {
        key: '/demo/base',
        label: '基础组件',
        children: [
          {
            key: '/demo/base/table',
            label: '表格',
          },
          {
            key: '/demo/base/form',
            label: '表单',
          },
        ],
      },
      {
        key: '/demo/composite',
        label: '组合组件',
        children: [
          {
            key: '/demo/composite/formAndTable',
            label: '表单&表格',
          },
        ],
      },
    ],
  },
];
