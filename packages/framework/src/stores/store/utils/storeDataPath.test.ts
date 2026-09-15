import { describe, expect, it } from 'vitest';
import { KeyAttr } from '@/interface';
import { getActivePath, getArrayIndexByKey, getRealPath } from './storeDataPath';
import { ParamKey } from '../interface';
import type { IStoreBase } from '../interface';

const rows = [
  { [KeyAttr]: 'a', name: 'row-a' },
  { [KeyAttr]: 'b', name: 'row-b' },
];

/**
 * 构造最小可用的 store 状态桩
 * storeDataPath 的各函数仅消费 getView/getViewParamByKey/getData 与数据树
 * overrides 类型放宽为 Record<string,any>:测试桩无需满足 IStoreBase 的完整签名,整体已断言
 */
const createFakeState = (overrides: Record<string, any> = {}) =>
  ({
    data: {},
    req: {},
    view: {},
    viewParams: {},
    handler: {},
    ...overrides,
  }) as unknown as IStoreBase;

describe('getRealPath', () => {
  const zGet = () => createFakeState();

  it('undefined 返回空数组', () => {
    expect(getRealPath(undefined, zGet)).toEqual([]);
  });

  it('数字路径返回 [数字]', () => {
    expect(getRealPath(3, zGet)).toEqual([3]);
  });

  it('字面量数组路径原样返回', () => {
    expect(getRealPath(['table', 0, 'name'], zGet)).toEqual(['table', 0, 'name']);
  });

  it('普通字符串路径返回 [字符串]', () => {
    expect(getRealPath('table', zGet)).toEqual(['table']);
  });

  it('@Active 引用路径解析为视图参数中的焦点路径', () => {
    const activePath = ['table', 2];
    const state = createFakeState({
      getViewParamByKey: (viewId: string, key: string) =>
        viewId === 'table1' && key === ParamKey.ActivePath ? activePath : undefined,
    });
    expect(getRealPath('@Active:table1', () => state)).toEqual(activePath);
  });

  it('@Active 引用路径在焦点路径缺失时返回空数组', () => {
    const state = createFakeState({
      getViewParamByKey: () => undefined,
    });
    expect(getRealPath('@Active:table1', () => state)).toEqual([]);
  });

  it('字面量路径缓存生效:相同内容返回同一引用', () => {
    const first = getRealPath(['data', 'table'], zGet);
    const second = getRealPath(['data', 'table'], zGet);
    expect(second).toBe(first);
    expect(second).toEqual(['data', 'table']);
  });
});

describe('getArrayIndexByKey', () => {
  it('按 KeyAttr 命中返回下标', () => {
    expect(getArrayIndexByKey(rows, 'b')).toBe(1);
  });

  it('重复查询命中缓存索引,结果一致', () => {
    expect(getArrayIndexByKey(rows, 'a')).toBe(0);
    expect(getArrayIndexByKey(rows, 'a')).toBe(0);
  });

  it('数组引用变更后重建索引(immer 结构共享模拟)', () => {
    const nextRows = [...rows, { [KeyAttr]: 'c', name: 'row-c' }];
    expect(getArrayIndexByKey(nextRows, 'c')).toBe(2);
  });

  it('未命中返回 -1', () => {
    expect(getArrayIndexByKey(rows, 'missing')).toBe(-1);
  });

  it('空数组与非数组输入返回 -1', () => {
    expect(getArrayIndexByKey([], 'a')).toBe(-1);
    expect(getArrayIndexByKey(undefined, 'a')).toBe(-1);
  });
});

describe('getActivePath', () => {
  const tableState = () =>
    createFakeState({
      getView: (viewId?: string) =>
        viewId === 'table1' ? { id: 'table1', path: ['table'] } : undefined,
      getData: (path: any) =>
        JSON.stringify(path) === JSON.stringify(['table']) ? rows : undefined,
    });

  it('根据焦点行 KeyAttr 计算焦点路径', () => {
    expect(getActivePath('table1', tableState(), 'b')).toEqual(['table', 1]);
  });

  it('未声明 path 时回退 dataId 计算焦点路径(与 ViewTable 列取数约定一致)', () => {
    const state = createFakeState({
      getView: (viewId?: string) =>
        viewId === 'table1' ? { id: 'table1', dataId: 'table' } : undefined,
      getData: (path: any) =>
        JSON.stringify(path) === JSON.stringify(['table']) ? rows : undefined,
    });
    expect(getActivePath('table1', state, 'a')).toEqual(['table', 0]);
  });

  it('焦点行不存在时返回 undefined', () => {
    expect(getActivePath('table1', tableState(), 'missing')).toBeUndefined();
  });

  it('循环引用超过 32 层时返回空数组防护', () => {
    // 构造 40 层 @Active 链式引用,触发 deep 防护
    const views: Record<string, any> = {};
    for (let i = 0; i < 40; i++) {
      views[`v${i}`] = { id: `v${i}`, path: `@Active:v${i + 1}` };
    }
    const state = createFakeState({
      getView: (viewId?: string) => views[viewId as string],
    });
    expect(getActivePath('v0', state, 'any')).toEqual([]);
  });
});
