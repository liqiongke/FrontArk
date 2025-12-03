import { KeyAttr } from '@/interface';
import PathUtils from '@/utils/pathUtils';
import { isArray, isNumber, isString, isUndefined } from 'lodash';
import { DPath, IStoreBase, ParamKey, PathKey, PathSplit } from '../interface';

/**
 * 将引用路径转换成实际的数据路径
 * @param path 原始路径
 * @param zGet 获取store状态的函数
 * @param viewIds 已处理的视图ID列表，防止循环引用
 * @returns 转换后的路径数组
 */
export const getRealPath = (
  path: DPath | undefined,
  zGet: () => IStoreBase,
  viewIds: Array<string> = [],
): Array<string | number> => {
  // 1. 处理 undefined：返回空数组
  if (isUndefined(path)) {
    return [];
  }

  // 2. 处理数字：直接作为路径的一部分返回
  if (isNumber(path)) {
    return [path];
  }

  // 3. 处理数组：递归处理每一项并合并
  if (isArray(path) && path.length > 0) {
    const firstElement = path[0];
    // 仅检查首位是否为特殊引用
    const isSpecialPath = isString(firstElement) && firstElement.startsWith(PathKey.SysHead);

    if (!isSpecialPath) {
      return path;
    }
    // 如果首位是特殊引用：
    // 1. 递归解析首位，得到绝对路径的头部（解析成功即为绝对路径的起点）
    const resolvedHead = getRealPath(firstElement, zGet, viewIds);

    // 2. 拼接头部和尾部
    return [...resolvedHead, ...path.slice(1)];
  }

  // 4. 处理字符串
  if (isString(path) && path.length > 0) {
    // 处理按照焦点行路径获取数据 (@Active)
    if (path.startsWith(PathKey.Active)) {
      const [_, viewId] = path.split(PathSplit);
      const activePath = zGet().getViewParamByKey(viewId, ParamKey.ActivePath);
      return isArray(activePath) ? activePath : [];
    }
    // 普通字符串直接返回
    return [path];
  }

  return [];
};

/**
 * 根据路径获取值
 */
export const getDataSource = (pathKey: any, store: IStoreBase) => {
  switch (pathKey) {
    case PathKey.Req:
      return store.req;
    case PathKey.View:
      return store.view;
    case PathKey.ViewParam:
      return store.viewParams;
    case PathKey.Data:
      return store.data;
  }
};

/**
 * 根据key值获取焦点行的实际路径
 * @param viewId
 * @param state
 * @param activeKey
 * @param deep 递归深度，默认0层
 * @returns
 */
export const getActivePath = (
  viewId: string,
  state: IStoreBase,
  activeKey: string,
  deep: number = 0,
): DPath => {
  // 预防循环引用
  if (deep > 32) {
    return [];
  }

  const view = state.getView(viewId);
  if (isUndefined(view)) {
    return [];
  }
  let path = view.path;
  if (isArray(path) && path.length > 0) {
    const firstItem = path[0];
    if (isString(firstItem) && firstItem.startsWith(PathKey.Active)) {
      const [_, newViewId] = firstItem.split(PathSplit);
      return getActivePath(newViewId, state, activeKey, deep + 1);
    }
  }

  if (isString(path) && path.startsWith(PathKey.Active)) {
    const [_, newViewId] = path.split(PathSplit);
    return getActivePath(newViewId, state, activeKey, deep + 1);
  }

  const data = state.getData(view.path);
  const index = data.findIndex((item: any) => item[KeyAttr] === activeKey);
  return index >= 0 ? PathUtils.mergePath(view.path, index) : undefined;
};
