import { KeyAttr } from '@/interface';
import PathUtils from '@/utils/pathUtils';
import { isArray, isNumber, isString, isUndefined } from 'lodash';
import { type DPath, type IStoreBase, ParamKey, PathKey, PathSplit } from '../interface';

// 字面量路径解析缓存:路径是有限集合(声明在业务代码中),按序列化结果缓存避免高频订阅场景重复解析
// 仅缓存不含 @引用 的字面量路径;含 @Active 等引用的路径依赖 viewParams 动态值,不可缓存
const literalPathCache = new Map<string, Array<string | number>>();
const LITERAL_PATH_CACHE_MAX = 2000;

const cacheLiteralPath = (key: string, resolved: Array<string | number>) => {
  if (literalPathCache.size >= LITERAL_PATH_CACHE_MAX) {
    literalPathCache.clear();
  }
  literalPathCache.set(key, resolved);
  return resolved;
};

/**
 * 将引用路径转换成实际的数据路径
 * @param path 原始路径
 * @param zGet 获取store状态的函数
 * @param viewIds 已处理的视图ID列表，防止循环引用
 * @returns 转换后的路径数组(返回值为缓存引用,调用方只读,不可修改)
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
    const key = `n:${path}`;
    return literalPathCache.get(key) ?? cacheLiteralPath(key, [path]);
  }

  // 3. 处理数组：递归处理每一项并合并
  if (isArray(path) && path.length > 0) {
    const firstElement = path[0];
    // 仅检查首位是否为特殊引用
    const isSpecialPath = isString(firstElement) && firstElement.startsWith(PathKey.SysHead);

    if (!isSpecialPath) {
      // 字面量数组路径:解析结果恒定,按序列化结果缓存(JSON 序列化对字符串/数字数组是单射的)
      const key = `a:${JSON.stringify(path)}`;
      return literalPathCache.get(key) ?? cacheLiteralPath(key, [...path]);
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
      const viewId = path.split(PathSplit)[1];
      const activePath = zGet().getViewParamByKey(viewId, ParamKey.ActivePath);
      return isArray(activePath) ? activePath : [];
    }
    // 普通字符串直接返回
    const key = `s:${path}`;
    return literalPathCache.get(key) ?? cacheLiteralPath(key, [path]);
  }

  return [];
};

/**
 * 活动行索引缓存
 * 以数组引用为键:immer 的结构共享保证未被修改的数组引用不变(索引持续有效),
 * 数组一旦被修改会生成新引用,旧索引随 WeakMap 自动失效,无需手动清理
 */
const activeIndexCache = new WeakMap<object, Map<string | number, number>>();

const buildActiveIndex = (data: Array<any>) => {
  const indexMap = new Map<string | number, number>();
  data.forEach((item, index) => {
    const key = item?.[KeyAttr];
    if (!isUndefined(key)) {
      indexMap.set(key, index);
    }
  });
  return indexMap;
};

/**
 * 按 KeyAttr 在数组中定位下标,优先使用引用级缓存索引,未命中时回退 findIndex
 * @param data 数据数组(通常是表格等列表数据)
 * @param activeKey 活动行的 KeyAttr 值
 * @returns 下标,未找到返回 -1
 */
export const getArrayIndexByKey = (data: unknown, activeKey: string | number): number => {
  if (!isArray(data) || data.length === 0) {
    return -1;
  }
  let indexMap = activeIndexCache.get(data);
  if (isUndefined(indexMap)) {
    indexMap = buildActiveIndex(data);
    activeIndexCache.set(data, indexMap);
  }
  const index = indexMap.get(activeKey);
  if (!isUndefined(index)) {
    return index;
  }
  // 兜底:索引未命中时回退 findIndex,命中后重建索引以覆盖极端的索引过期场景
  const fallbackIndex = data.findIndex((item) => item?.[KeyAttr] === activeKey);
  if (fallbackIndex >= 0) {
    activeIndexCache.set(data, buildActiveIndex(data));
  }
  return fallbackIndex;
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
  // 与 ViewTable 列取数约定一致:未声明 path 时回退 dataId(数据节点 id 即数据树路径首段),
  // 否则仅声明 dataId 的表格视图无法计算焦点路径,@Active 引用整体失效
  const path = view.path ?? (isString(view.dataId) ? [view.dataId] : undefined);
  if (isArray(path) && path.length > 0) {
    const firstItem = path[0];
    if (isString(firstItem) && firstItem.startsWith(PathKey.Active)) {
      const newViewId = firstItem.split(PathSplit)[1];
      return getActivePath(newViewId, state, activeKey, deep + 1);
    }
  }

  if (isString(path) && path.startsWith(PathKey.Active)) {
    const newViewId = path.split(PathSplit)[1];
    return getActivePath(newViewId, state, activeKey, deep + 1);
  }

  const data = state.getData(path);
  // 使用引用级缓存索引 O(1) 定位,替代对全量数据的 findIndex O(n) 扫描
  const index = getArrayIndexByKey(data, activeKey);
  return index >= 0 ? PathUtils.mergePath(path, index) : undefined;
};
