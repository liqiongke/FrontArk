import { describe, expect, it } from 'vitest';
import { KeyAttr } from '@/interface';
import { getData, initDataAndReq, setData, setDataByFn } from './storeData';
import type DataBase from '@/data/dataBase';
import { PathKey, type IStoreBase, type ZSet } from '../interface';

/**
 * 构造最小可用的 store 状态与更新函数桩
 * zSet 桩直接执行 recipe(测试环境无 immer),与生产中 immer recipe 的原地修改语义等效
 */
const createRunner = (data: Record<string, any> = {}) => {
  const state = {
    data: structuredClone(data),
    req: {},
    view: {},
    viewParams: {},
    handler: {},
  } as unknown as IStoreBase;
  const zGet = () => state;
  // 记录每次更新的 action 标注,供断言 devtools 动作标注
  const actions: Array<{ type: string; [key: string]: unknown }> = [];
  const zSet: ZSet = (recipe, _replace, action) => {
    const next = (recipe as (s: IStoreBase) => IStoreBase)(state);
    if (next) {
      Object.assign(state, next);
    }
    if (action) {
      actions.push(action);
    }
  };
  return { zGet, zSet, actions };
};

describe('getData', () => {
  it('按路径取数据树中的值', () => {
    const { zGet } = createRunner({ table: { rows: [1, 2] } });
    expect(getData(['table', 'rows'], zGet)).toEqual([1, 2]);
  });

  it('数据节点字符串路径等价于数据树首段', () => {
    const { zGet } = createRunner({ table: { rows: [1, 2] } });
    expect(getData('table', zGet)).toEqual({ rows: [1, 2] });
  });

  it('@Data 系统头路径从数据树取值(dataSource 分流)', () => {
    const { zGet } = createRunner({ table: 'core' });
    expect(getData([PathKey.Data, 'table'], zGet)).toBe('core');
  });

  it('路径无数据时返回 undefined', () => {
    const { zGet } = createRunner({});
    expect(getData(['missing'], zGet)).toBeUndefined();
  });
});

describe('setData', () => {
  it('按路径写入数据', () => {
    const { zGet, zSet } = createRunner({ table: { rows: [] } });
    setData(['table', 'total'], 3, zGet, zSet);
    expect(getData(['table', 'total'], zGet)).toBe(3);
  });

  it('写入时携带 devtools 动作标注', () => {
    const { zGet, zSet, actions } = createRunner({ table: {} });
    setData(['table', 'total'], 1, zGet, zSet);
    expect(actions[0].type).toBe('setData');
    expect(actions[0].path).toBe('table.total');
  });

  it('@Data 系统头路径写入数据树', () => {
    const { zGet, zSet } = createRunner({});
    setData([PathKey.Data, 'table'], [1], zGet, zSet);
    expect(getData(['table'], zGet)).toEqual([1]);
  });

  it('空路径不产生更新', () => {
    const { zGet, zSet, actions } = createRunner({ table: 1 });
    setData([], 9, zGet, zSet);
    expect(actions).toHaveLength(0);
  });
});

describe('setDataByFn', () => {
  it('以函数方式修改目标数据', () => {
    const { zGet, zSet } = createRunner({ table: { count: 1 } });
    setDataByFn(
      ['table'],
      (data: any) => {
        data.count += 1;
      },
      zGet,
      zSet,
    );
    expect(getData(['table', 'count'], zGet)).toBe(2);
  });

  it('函数更新时携带 devtools 动作标注', () => {
    const { zGet, zSet, actions } = createRunner({ table: { count: 1 } });
    setDataByFn(
      ['table'],
      () => {},
      zGet,
      zSet,
    );
    expect(actions[0].type).toBe('setDataByFn');
    expect(actions[0].path).toBe('table');
  });
});

describe('initDataAndReq', () => {
  it('根据 Data 声明初始化请求节点并维护父子关系', () => {
    // 参数引用的 path 以 { id } 对象形态声明父节点(现有实现按 path.id 解析父节点)
    // 节点按 SysDataProps 契约预置 parentIds/childIds
    const data = {
      mainTable: { id: 'table', url: '/demo/base/table', keyAttr: 'id', childIds: [], parentIds: [] },
      formData: {
        id: 'formData',
        childIds: [],
        parentIds: [],
        params: [{ field: 'id', path: { id: 'table' } }],
      },
    } as unknown as DataBase;

    const [initData, reqStore] = initDataAndReq(data);
    expect(initData).toEqual({});
    expect(reqStore['table'].url).toBe('/demo/base/table');
    expect(reqStore['formData'].parentIds).toContain('table');
    expect(reqStore['table'].childIds).toContain('formData');
  });

  it('参数引用的父节点不存在时跳过该引用', () => {
    const data = {
      formData: {
        id: 'formData',
        childIds: [],
        parentIds: [],
        params: [{ field: 'id', path: { id: 'ghost' } }],
      },
    } as unknown as DataBase;

    const [, reqStore] = initDataAndReq(data);
    expect(reqStore['formData'].parentIds).toHaveLength(0);
  });

  it('重复 id 的节点以最后一个声明为准(现状语义)', () => {
    const data = {
      a: { id: 'same', url: '/a' },
      b: { id: 'same', url: '/b' },
    } as unknown as DataBase;
    const [, reqStore] = initDataAndReq(data);
    expect(reqStore['same'].url).toBe('/b');
  });
});

describe('KeyAttr', () => {
  it('保持为 @key(活动行索引与表格 rowKey 依赖该常量)', () => {
    expect(KeyAttr).toBe('@key');
  });
});
