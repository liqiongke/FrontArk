import { KeyAttr } from '@/interface';
import { PerfTrackUtils } from '@/utils/sysUtils/perfTrackerUtils';
import { get, isArray, isNumber, isString, isUndefined } from 'lodash';
import { type DPath, type IStoreBase, type IStoreData, ParamKey, PathKey } from '../interface';

const literalPathCache = new Map<string, Array<string | number>>();
const activeIndexCache = new WeakMap<object, Map<string, number>>();

/** 所有读取只使用传入快照，不调用闭包绑定实时 get() 的 store action。 */
export const readView = (state: IStoreData, viewId?: string) =>
  isString(viewId) ? get(state.view, viewId) : undefined;

export const getDataSource = (pathKey: unknown, state: IStoreData) => {
  switch (pathKey) {
    case PathKey.Req: return state.req;
    case PathKey.View: return state.view;
    case PathKey.ViewParam: return state.viewParams;
    case PathKey.Data: return state.data;
  }
};

/** 数字键在兼容模式下可读取；字符串/数字同形键和重复键一律视为歧义。 */
export const getArrayIndexByKey = (data: unknown, rowKey: string | number): number => {
  if (!isArray(data)) return -1;
  let indexMap = activeIndexCache.get(data);
  if (!indexMap) {
    indexMap = new Map();
    data.forEach((item, index) => {
      const key = item?.[KeyAttr];
      if ((!isString(key) && !isNumber(key)) || String(key).length === 0) return;
      const normalized = String(key);
      indexMap!.set(normalized, indexMap!.has(normalized) ? -1 : index);
    });
    activeIndexCache.set(data, indexMap);
  }
  return indexMap.get(String(rowKey)) ?? -1;
};

const readResolved = (state: IStoreData, path: Array<string | number>) => {
  const source = getDataSource(path[0], state);
  const parts = isUndefined(source) ? path : path.slice(1);
  const root = source ?? state.data;
  return parts.length === 0 ? root : get(root, parts);
};

/** 递归解析完整绑定路径；所有 @Active/@Row 共用循环保护与同一快照。 */
export const resolvePath = (
  state: IStoreData,
  path: DPath,
  visited: readonly string[] = [],
): Array<string | number> | undefined => {
  if (isUndefined(path)) return [];
  const parts = isArray(path) ? path : [path];
  const head = parts[0];
  if (isString(head) && (head.startsWith('@Active:') || head.startsWith('@Row:'))) {
    if (visited.length >= 32 || visited.includes(head)) return undefined;
    const active = head.startsWith('@Active:');
    const payload = head.slice(active ? '@Active:'.length : '@Row:'.length);
    const separator = payload.indexOf(':');
    if (!active && separator <= 0) return undefined;
    const viewId = active ? payload : payload.slice(0, separator);
    let rowKey: string | number | undefined;
    try {
      rowKey = active
        ? get(state.viewParams, [viewId, ParamKey.Active])
        : decodeURIComponent(payload.slice(separator + 1));
    } catch {
      return undefined;
    }
    if (!isString(rowKey) && !isNumber(rowKey)) return undefined;
    const view = readView(state, viewId);
    const source = view?.path ?? (isString(view?.dataId) ? [view.dataId] : undefined);
    if (isUndefined(source)) return undefined;
    const base = resolvePath(state, source, [...visited, head]);
    if (isUndefined(base)) return undefined;
    const index = getArrayIndexByKey(readResolved(state, base), rowKey);
    return index < 0 ? undefined : [...base, index, ...parts.slice(1)];
  }
  const key = JSON.stringify(parts);
  let cached = literalPathCache.get(key);
  if (!cached) {
    if (literalPathCache.size >= 2000) literalPathCache.clear();
    cached = [...parts];
    literalPathCache.set(key, cached);
  }
  return cached;
};

// 统计放在统一读取入口，保留 getData 调试指标对 Hook 与命令式读取的覆盖；不代表 render 次数。
export const readData = PerfTrackUtils('getData', (state: IStoreData, path: DPath): any => {
  const resolved = resolvePath(state, path);
  return isUndefined(resolved) ? undefined : readResolved(state, resolved);
});

/** 请求与视图数据绑定使用同一解析契约。 */
export const readReqNodeId = (state: IStoreData, viewId: string): string | undefined => {
  const view = readView(state, viewId);
  const source = view?.path ?? view?.dataId;
  if (isUndefined(source)) return undefined;
  const resolved = resolvePath(state, source);
  const id = resolved?.[0] === PathKey.Data ? resolved[1] : resolved?.[0];
  return isString(id) && !id.startsWith('@') ? id : undefined;
};

/** 保留命令式调用接口，入口处只取一次快照。 */
export const getRealPath = (path: DPath, zGet: () => IStoreBase, viewIds: string[] = []) =>
  resolvePath(zGet(), path, viewIds);

export const getActivePath = (
  viewId: string,
  state: IStoreData,
  activeKey: string | number,
  deep = 0,
): DPath => {
  if (deep >= 32) return undefined;
  const view = readView(state, viewId);
  const source = view?.path ?? (isString(view?.dataId) ? [view.dataId] : undefined);
  if (isUndefined(source)) return undefined;
  const base = resolvePath(state, source, [`@Active:${viewId}`]);
  if (isUndefined(base)) return undefined;
  const index = getArrayIndexByKey(readResolved(state, base), activeKey);
  return index < 0 ? undefined : [...base, index];
};

export type BindingSegment = string | number | { rowKey: string };
export type DataBinding = BindingSegment[];

/** 冻结数据源及各层行身份；祖先列表重排也不能让防抖任务串行。 */
export const captureBinding = (state: IStoreData, path: DPath): DataBinding | undefined => {
  if (isUndefined(path)) return undefined;
  const resolved = resolvePath(state, path);
  if (isUndefined(resolved) || resolved.length === 0) return undefined;
  const source = getDataSource(resolved[0], state);
  const canonical = isUndefined(source) ? [PathKey.Data, ...resolved] : resolved;
  const binding: DataBinding = [canonical[0]];
  let value: any = getDataSource(canonical[0], state);
  for (const part of canonical.slice(1)) {
    const record = value?.[part];
    if (isArray(value) && /^\d+$/.test(String(part)) && !isUndefined(record?.[KeyAttr])) {
      const key = record[KeyAttr];
      if ((!isString(key) && !isNumber(key)) || getArrayIndexByKey(value, key) < 0) {
        return undefined;
      }
      binding.push({ rowKey: String(key) });
    } else {
      binding.push(part);
    }
    value = record;
  }
  return binding;
};

/** 到提交时重新按被冻结的身份定位，原记录不存在时拒绝写入。 */
export const resolveBinding = (state: IStoreData, binding: DataBinding): DPath => {
  const path: Array<string | number> = [binding[0] as string];
  let value: any = getDataSource(path[0], state);
  for (const segment of binding.slice(1)) {
    const part = typeof segment === 'object' ? getArrayIndexByKey(value, segment.rowKey) : segment;
    if (typeof segment === 'object' && part === -1) return undefined;
    path.push(part);
    value = value?.[part];
  }
  return path;
};

export const bindingKey = (state: IStoreData, path: DPath): string | undefined => {
  const binding = captureBinding(state, path);
  return isUndefined(binding) ? undefined : JSON.stringify(binding);
};

/** 按路径段比较，name 不会匹配 nameExtra，@Data 别名与行身份可互通。 */
export const bindingMatches = (binding: DataBinding, scope: DataBinding, exact = false) =>
  (!exact || binding.length === scope.length) &&
  scope.length <= binding.length &&
  scope.every((part, index) => JSON.stringify(part) === JSON.stringify(binding[index]));
