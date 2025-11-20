import { cloneDeep, get, isArray, isObject, isString, isUndefined, set } from 'lodash';
import { DataReqStore, DataStore, DPath, IStoreBase } from '../interface';
import { DataBase } from '../../../interface';

// 初始化数据请求数据,返回数据请求接口和初始化的数据
export const initDataReq = (data: DataBase): [DataStore, DataReqStore] => {
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

// 获取指定路径下的数据
export const getData = (path: DPath, zGet: () => IStoreBase) => {
  const { data } = zGet();
  if ((isString(path) && path.length > 0) || (isArray(path) && path.length > 0)) {
    return get(data, path);
  }
  return;
};

// 设置指定路径下的数据
export const setData = (
  path: DPath,
  value: any,
  zSet: (state: IStoreBase | ((state: IStoreBase) => IStoreBase), replace?: false) => void,
) => {
  if (isUndefined(path)) {
    return;
  }
  zSet((state: IStoreBase) => {
    set(state.data, path, value);
    return state;
  });
};
