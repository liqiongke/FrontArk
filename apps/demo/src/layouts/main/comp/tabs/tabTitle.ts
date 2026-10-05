import type { MenuItem } from '../../../../interface/menu';
import { getPageMeta } from '../../pageMeta';

/** 在菜单树中按路由 key 查找菜单名 */
const findMenuLabel = (items: MenuItem[], key: string): string | undefined => {
  for (const item of items) {
    if (item.key === key) {
      return item.label;
    }
    const childLabel = item.children ? findMenuLabel(item.children, key) : undefined;
    if (childLabel) {
      return childLabel;
    }
  }
  return undefined;
};

/** 取路径最后一段作为兜底标题 */
const lastSegment = (pathname: string): string => {
  const segments = pathname.split('/').filter(Boolean);
  return segments.length > 0 ? segments[segments.length - 1] : '首页';
};

/**
 * 解析页签标题，优先级：
 * 1. 页面元信息（内容区标题与页签保持一致）
 * 2. 后端菜单名（覆盖未登记元信息的路由）
 * 3. 路径最后一段（保证任何路由都有可读标题）
 */
export const resolveTabTitle = (pathname: string, menuItems: MenuItem[] = []): string =>
  getPageMeta(pathname)?.title ?? findMenuLabel(menuItems, pathname) ?? lastSegment(pathname);
