import PathUtils from '@/utils/pathUtils';
import logger from '@/utils/sysUtils/logger';
import { cloneDeep, get, isArray, isFunction, isObject, isString, isUndefined, set } from 'lodash';
import type DataBase from '@/data/dataBase';
import { type DataReqStore, type DataStore, type DPath, type IStoreBase, type ZSet } from '../interface';
import { getDataSource, getRealPath, readData } from './storeDataPath';

// 判断是否为数据节点 id:以 @ 开头的是系统引用(如 @Active:xxx),不构成父子依赖
const isDataNodeId = (value: unknown): value is string =>
  isString(value) && value.length > 0 && !value.startsWith('@');

// 从 params.path 声明中提取被依赖的数据节点 id(字符串/数组首段/{id}对象三种形式)
const extractParentId = (path: unknown): string | undefined => {
  if (isDataNodeId(path)) {
    return path;
  }
  if (isArray(path) && path.length > 0) {
    return isDataNodeId(path[0]) ? path[0] : undefined;
  }
  if (isObject(path)) {
    const id = get(path, 'id');
    return isDataNodeId(id) ? id : undefined;
  }
  return undefined;
};

// 建立父子依赖(双向登记,去重)
const addDependency = (reqStore: DataReqStore, childId: string, parentId: string) => {
  if (parentId === childId) {
    logger.error(`数据节点${childId}依赖自身,忽略该依赖`);
    return;
  }
  const parentNode = get(reqStore, parentId);
  const childNode = get(reqStore, childId);
  if (isUndefined(parentNode)) {
    logger.warn(`数据节点${childId}依赖的父节点${parentId}不存在,跳过该依赖`);
    return;
  }
  if (!parentNode.childIds.includes(childId)) {
    parentNode.childIds.push(childId);
  }
  if (!childNode.parentIds.includes(parentId)) {
    childNode.parentIds.push(parentId);
  }
};

// 环检测(DFS):声明成环会导致请求链相互等待,初始化期暴露,运行期由请求链 visited 兜底
const detectDependencyCycles = (reqStore: DataReqStore) => {
  const done = new Set<string>();
  const inStack = new Set<string>();
  const dfs = (id: string, chain: string[]) => {
    if (done.has(id)) {
      return;
    }
    if (inStack.has(id)) {
      logger.error(`数据节点依赖存在循环:${[...chain, id].join('→')},请检查 params.path/dependsOn 声明`);
      return;
    }
    inStack.add(id);
    const node = get(reqStore, id);
    if (!isUndefined(node)) {
      node.parentIds.forEach((parentId: string) => dfs(parentId, [...chain, id]));
    }
    inStack.delete(id);
    done.add(id);
  };
  Object.keys(reqStore).forEach((id) => dfs(id, []));
};

/**
 * 初始化数据请求数据,返回数据请求接口和初始化的数据
 * 契约:
 * 1. 节点 id 重复时保留首个声明并报错,后声明的同名节点被忽略(避免先注册的视图引用被静默改写)
 * 2. parentIds/childIds/criteria 由框架兜底初始化,业务无需(也不应)预声明
 * 3. 父子依赖来源:params.path 数据引用(字符串/数组首段/{id}对象)与 dependsOn 显式声明
 */
export const initDataAndReq = (data: DataBase): [DataStore, DataReqStore] => {
  const result: DataReqStore = {};
  const initData: DataStore = {};

  // 第一遍:登记全部节点,重复 id 保留首个声明
  for (const key in data) {
    const d = get(data, key);
    if (!isObject(d) || !isString(d.id)) {
      continue;
    }
    if (!isUndefined(get(result, d.id))) {
      logger.error(`数据节点${d.id}重复声明,保留首个声明,忽略:${key}`);
      continue;
    }
    set(result, d.id, cloneDeep(d));
  }

  // 第二遍:兜底初始化运行字段(业务声明不携带这些字段,避免未声明时读写崩溃)
  for (const id in result) {
    const d = result[id];
    d.parentIds = isArray(d.parentIds) ? d.parentIds : [];
    d.childIds = isArray(d.childIds) ? d.childIds : [];
    d.criteria = isObject(d.criteria) ? d.criteria : {};
  }

  // 第三遍:建立父子依赖
  for (const id in result) {
    const d = result[id];
    d.params?.forEach((param) => {
      const parentId = extractParentId(get(param, 'path'));
      if (!isUndefined(parentId)) {
        addDependency(result, id, parentId);
      }
    });
    if (isArray(d.dependsOn)) {
      d.dependsOn.forEach((parentId) => {
        if (isString(parentId)) {
          addDependency(result, id, parentId);
        }
      });
    }
  }

  detectDependencyCycles(result);

  return [initData, result];
};

/**
 * 获取指定路径的数据
 * 注意:返回值必须保持引用稳定(zustand v5 的 selector 依赖 useSyncExternalStore,
 * 要求快照可缓存),路径无数据时返回 undefined,不可返回新建对象/数组,否则会导致无限重渲染
 */
export const getData = (path: DPath, zGet: () => IStoreBase) => readData(zGet(), path);

// 设置指定路径下的数据
export const setData = (path: DPath, value: any, zGet: () => IStoreBase, zSet: ZSet) => {
  if (isUndefined(path)) {
    return;
  }
  const rPath = getRealPath(path, zGet);
  // 引用未解析时拒绝写入:禁止拼接后落到数据根节点等错误位置
  if (isUndefined(rPath)) {
    logger.warn(`setData 路径未解析,拒绝写入:${JSON.stringify(path)}`);
    return;
  }
  if (rPath.length === 0) {
    return;
  }
  zSet(
    (state: IStoreBase) => {
      const dataSource = getDataSource(rPath[0], state);
      set(dataSource ?? state.data, dataSource ? rPath.slice(1) : rPath, value);
      return state;
    },
    false,
    { type: 'setData', path: PathUtils.toString(rPath) },
  );
};

export const setDataByFn = (
  path: DPath,
  dataFn: (data: any) => void,
  zGet: () => IStoreBase,
  zSet: ZSet,
) => {
  if (isUndefined(path) || !isFunction(dataFn)) {
    return;
  }
  const rPath = getRealPath(path, zGet);
  // 引用未解析时拒绝执行:同上,防止回调意外写入错误位置
  if (isUndefined(rPath)) {
    logger.warn(`setDataByFn 路径未解析,拒绝执行:${JSON.stringify(path)}`);
    return;
  }
  if (rPath.length === 0) {
    return;
  }
  zSet(
    (state: IStoreBase) => {
      const dataSource = getDataSource(rPath[0], state);
      const path = dataSource ? rPath.slice(1) : rPath;
      if (path.length === 0) {
        dataFn(dataSource ?? state.data);
      } else {
        dataFn(get(dataSource ?? state.data, path));
      }

      return state;
    },
    false,
    { type: 'setDataByFn', path: PathUtils.toString(rPath) },
  );
};
