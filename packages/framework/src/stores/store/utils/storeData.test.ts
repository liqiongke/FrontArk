import { describe, expect, it, vi } from 'vitest';
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
    // @引用解析所需的查询桩:默认全部未命中(视图/焦点不存在),由具体用例覆盖
    getView: () => undefined,
    getViewParamByKey: () => undefined,
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
    // 参数引用的 path 以 { id } 对象形态声明父节点
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

  it('业务未声明 parentIds/childIds/criteria 时由框架兜底初始化', () => {
    const data = {
      mainTable: { id: 'table', url: '/demo/base/table' },
    } as unknown as DataBase;

    const [, reqStore] = initDataAndReq(data);
    expect(reqStore['table'].parentIds).toEqual([]);
    expect(reqStore['table'].childIds).toEqual([]);
    expect(reqStore['table'].criteria).toEqual({});
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

  it('依赖提取支持字符串与数组首段形式', () => {
    const data = {
      a: { id: 'a', url: '/a' },
      b: { id: 'b', url: '/b', params: [{ field: 'x', path: 'a' }] },
      c: { id: 'c', url: '/c', params: [{ field: 'x', path: ['a', 'rows'] }] },
    } as unknown as DataBase;

    const [, reqStore] = initDataAndReq(data);
    expect(reqStore['b'].parentIds).toContain('a');
    expect(reqStore['c'].parentIds).toContain('a');
    expect(reqStore['a'].childIds).toEqual(expect.arrayContaining(['b', 'c']));
  });

  it('dependsOn 显式声明与 params.path 推导的依赖合并', () => {
    const data = {
      a: { id: 'a', url: '/a' },
      b: { id: 'b', url: '/b' },
      c: { id: 'c', url: '/c', dependsOn: ['a'], params: [{ field: 'x', path: 'b' }] },
    } as unknown as DataBase;

    const [, reqStore] = initDataAndReq(data);
    expect(reqStore['c'].parentIds).toEqual(expect.arrayContaining(['a', 'b']));
  });

  it('依赖自身的声明被忽略', () => {
    const data = {
      a: { id: 'a', url: '/a', dependsOn: ['a'] },
    } as unknown as DataBase;

    const [, reqStore] = initDataAndReq(data);
    expect(reqStore['a'].parentIds).toHaveLength(0);
  });

  it('声明成环时不抛出异常(初始化期报错,运行期由请求链兜底)', () => {
    const data = {
      a: { id: 'a', url: '/a', dependsOn: ['b'] },
      b: { id: 'b', url: '/b', dependsOn: ['a'] },
    } as unknown as DataBase;

    expect(() => initDataAndReq(data)).not.toThrow();
    const [, reqStore] = initDataAndReq(data);
    expect(reqStore['a'].parentIds).toContain('b');
    expect(reqStore['b'].parentIds).toContain('a');
  });

  it('重复 id 的节点保留首个声明(后声明的同名节点被忽略)', () => {
    const data = {
      a: { id: 'same', url: '/a' },
      b: { id: 'same', url: '/b' },
    } as unknown as DataBase;
    const [, reqStore] = initDataAndReq(data);
    expect(reqStore['same'].url).toBe('/a');
  });
});

describe('引用未解析路径的安全失败', () => {
  it('setData 在引用未解析时拒绝写入(不落到数据根节点)', () => {
    const { zGet, zSet, actions } = createRunner({ table: [{ id: 1 }] });
    // 视图缺失 → @Active 未解析
    setData(['@Active:ghost', 'name'], 9, zGet, zSet);
    expect(getData(['name'], zGet)).toBeUndefined();
    expect(actions).toHaveLength(0);
  });

  it('setDataByFn 在引用未解析时不执行回调', () => {
    const { zGet, zSet, actions } = createRunner({ table: [{ id: 1 }] });
    const fn = vi.fn();
    setDataByFn(['@Active:ghost', 'name'], fn, zGet, zSet);
    expect(fn).not.toHaveBeenCalled();
    expect(actions).toHaveLength(0);
  });

  it('getData 在引用未解析时返回 undefined', () => {
    const { zGet } = createRunner({ table: [{ id: 1 }] });
    expect(getData(['@Active:ghost', 'name'], zGet)).toBeUndefined();
  });
});

describe('KeyAttr', () => {
  it('保持为 @key(活动行索引与表格 rowKey 依赖该常量)', () => {
    expect(KeyAttr).toBe('@key');
  });
});
