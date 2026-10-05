/**
 * 路由页面元信息。
 *
 * 标题同时驱动顶部页签与内容区标题，描述用于内容区副标题，
 * 因此集中在此维护，避免 MainLayout 与页签两处各写一份。
 */
export interface PageMeta {
  title: string;
  description: string;
  hideHeader?: boolean;
}

export const pageMeta: Record<string, PageMeta> = {
  '/': { title: '首页', description: '浏览基础组件与组合示例。' },
  '/home': { title: '首页', description: '浏览基础组件与组合示例。' },
  '/base/table': {
    title: '表格',
    description: '查询产品数据，点击数据行可在上方表单中查看和编辑。',
    hideHeader: true,
  },
  '/base/form': { title: '表单', description: '预览字段控件，体验数据绑定与表单交互。' },
  '/base/modal': { title: '弹出框', description: '在对话框中查看和编辑信息。' },
  '/base/drawer': { title: '抽屉', description: '在侧边面板中处理信息，保留当前页面上下文。' },
  '/base/tab': { title: '标签页', description: '在表格与表单之间切换，保留各页签的内容状态。' },
  '/composite/formAndTable': { title: '表单与表格', description: '组合组件示例。' },
};

/** 按路径读取页面元信息，未登记的路径返回 undefined（由调用方决定兜底标题） */
export const getPageMeta = (pathname: string): PageMeta | undefined => pageMeta[pathname];
