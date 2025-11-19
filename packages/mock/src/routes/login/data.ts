// 菜单项接口定义
export interface MenuItem {
  id: string;
  title: string;
  path?: string;
  children?: MenuItem[];
}

// 菜单数据
export const menuData: MenuItem[] = [
  {
    id: '1',
    title: '首页',
    path: '/',
  },
  {
    id: '2',
    title: '用户管理',
    children: [
      {
        id: '2-1',
        title: '用户列表',
        path: '/users',
      },
      {
        id: '2-2',
        title: '用户角色',
        path: '/users/roles',
      },
      {
        id: '2-3',
        title: '权限管理',
        path: '/users/permissions',
      },
    ],
  },
  {
    id: '3',
    title: '商品管理',
    children: [
      {
        id: '3-1',
        title: '商品列表',
        path: '/products',
      },
      {
        id: '3-2',
        title: '商品分类',
        path: '/products/categories',
      },
      {
        id: '3-3',
        title: '库存管理',
        path: '/products/inventory',
      },
    ],
  },
  {
    id: '4',
    title: '订单管理',
    children: [
      {
        id: '4-1',
        title: '订单列表',
        path: '/orders',
      },
      {
        id: '4-2',
        title: '订单详情',
        path: '/orders/detail',
      },
    ],
  },
  {
    id: '5',
    title: '系统设置',
    children: [
      {
        id: '5-1',
        title: '基础设置',
        path: '/settings/basic',
      },
      {
        id: '5-2',
        title: '系统日志',
        path: '/settings/logs',
      },
    ],
  },
];
