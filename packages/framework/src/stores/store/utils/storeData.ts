import PathUtils from '@/utils/pathUtils';
import { PerfTrackUtils } from '@/utils/sysUtils/perfTrackerUtils';
import { cloneDeep, get, isObject, isString, isUndefined, set } from 'lodash';
import DataBase from 'src/data/dataBase';
import { DataReqStore, DataStore, DPath, IStoreBase } from '../interface';
import { getDataSource, getRealPath } from './storeDataPath';

// 初始化数据请求数据,返回数据请求接口和初始化的数据
export const initDataAndReq = (data: DataBase): [DataStore, DataReqStore] => {
  let result: DataReqStore = {};
  let initData: DataStore = {};

  // 获取声明的所有节点
  for (const key in data) {
    const d = get(data, key);
    if (!isObject(d) || !isString(d.id)) {
      continue;
    }
    if (!isUndefined(get(initData, d.id))) {
      console.warn(`数据请求${d.id}已存在,跳过初始化`);
      continue;
    }
    set(result, d.id, cloneDeep(d));
  }

  // 计算所有数据节点的父节点和子节点
  for (const key in result) {
    const d = get(result, key);
    if (!isObject(d)) {
      continue;
    }
    d.params?.forEach((param) => {
      const parentId = get(param, ['path', 'id']);
      if (!isString(parentId)) {
        return;
      }
      const parentNode = get(result, parentId);
      if (isUndefined(parentNode)) {
        console.warn(`数据请求${parentId}不存在,跳过初始化`);
        return;
      }
      // 更新当前节点
      if (!parentNode.childIds.includes(d.id)) {
        parentNode.childIds.push(d.id);
      }
      // 更新当前节点的parentIds
      if (!d.parentIds.includes(parentId)) {
        d.parentIds.push(parentId);
      }
    });
  }

  return [initData, result];
};

// 将主函数与工具方法合并导出
export const getData = PerfTrackUtils('getData', (path: DPath, zGet: () => IStoreBase) => {
  const rPath = getRealPath(path, zGet);
  if (rPath.length === 0) {
    return undefined;
  }
  const dataSource = getDataSource(rPath[0], zGet());
  return get(dataSource ?? zGet().data, dataSource ? rPath.slice(1) : rPath);
});

// 设置指定路径下的数据
export const setData = (
  path: DPath,
  value: any,
  zGet: () => IStoreBase,
  zSet: (state: IStoreBase | ((state: IStoreBase) => IStoreBase), replace?: false) => void,
) => {
  if (isUndefined(path)) {
    return;
  }
  const rPath = getRealPath(path, zGet);
  if (rPath.length === 0) {
    return;
  }
  zSet((state: IStoreBase) => {
    const dataSource = getDataSource(rPath[0], state);
    set(dataSource ?? state.data, dataSource ? rPath.slice(1) : rPath, value);
    return state;
  });
};

const debounceTimers = new Map<string, number>();
/**设置缓动触发值的更新 */
export const setDataDebounce = (
  path: DPath,
  value: any,
  zGet: () => IStoreBase,
  delay: number = 300,
) => {
  if (isUndefined(path)) {
    return;
  }
  // 1. 获取该 path 对应的唯一 Key
  const newPath = getRealPath(path, zGet);
  const key = PathUtils.toString(newPath);

  // 2. 检查该 path 是否已经有正在等待的更新，如果有，取消它
  if (debounceTimers.has(key)) {
    clearTimeout(debounceTimers.get(key));
  }

  // 3. 创建一个新的定时器
  const timerId = setTimeout(() => {
    zGet().setData(newPath, value);
    debounceTimers.delete(key);
  }, delay);

  // 4. 将新定时器存入 Map
  debounceTimers.set(key, timerId);
};
