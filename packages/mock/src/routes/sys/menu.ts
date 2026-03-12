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
    label: '基础组件',
    children: [
      {
        key: '/base/table',
        label: '表格',
      },
      {
        key: '/base/form',
        label: '表单',
      },
      {
        key: '/base/modal',
        label: '弹出框',
      },
      {
        key: '/base/drawer',
        label: '抽屉',
      },
      {
        key: '/base/tab',
        label: '标签页',
      },
    ],
  },
  {
    key: '/composite',
    label: '组合组件',
    children: [
      {
        key: '/composite/formAndTable',
        label: '表单&表格',
      },
    ],
  },
];
