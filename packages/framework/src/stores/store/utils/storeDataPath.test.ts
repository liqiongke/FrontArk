import { describe, expect, it } from 'vitest';
import { KeyAttr } from '@/interface';
import ViewPathUtils from '@/utils/viewPathUtils';
import { getActivePath, getArrayIndexByKey, getRealPath, readData, resolvePath } from './storeDataPath';
import createBaseStore from '../storeBase';
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

// @Active 动态解析的完整桩:视图声明 + 焦点键值 + 数据树
const createActiveState = (activeKey?: string) =>
  createFakeState({
    view: { table1: { id: 'table1', path: ['table'] } },
    viewParams: { table1: { [ParamKey.Active]: activeKey } },
    data: { table: rows },
  });

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

  it('@Active 引用路径按当前焦点键值动态解析(不依赖缓存的 @ActivePath)', () => {
    expect(getRealPath('@Active:table1', () => createActiveState('b'))).toEqual(['table', 1]);
  });

  it('@Active 未选中焦点行时返回 undefined(安全失败,禁止拼接后读写错误位置)', () => {
    expect(getRealPath('@Active:table1', () => createActiveState(undefined))).toBeUndefined();
  });

  it('@Active 焦点行不存在时返回 undefined', () => {
    expect(getRealPath('@Active:table1', () => createActiveState('missing'))).toBeUndefined();
  });

  it('@Row 引用按行键值解析为行数据路径(与渲染下标无关)', () => {
    expect(getRealPath(ViewPathUtils.row('table1', 'b'), () => createActiveState())).toEqual([
      'table',
      1,
    ]);
  });

  it('@Row 行键值不存在时返回 undefined(安全失败)', () => {
    expect(
      getRealPath(ViewPathUtils.row('table1', 'missing'), () => createActiveState()),
    ).toBeUndefined();
  });

  it('@Row 引用与字段名拼接为单元格路径', () => {
    expect(
      getRealPath([ViewPathUtils.row('table1', 'a'), 'name'], () => createActiveState()),
    ).toEqual(['table', 0, 'name']);
  });

  it('数组路径首位的未解析引用使整体返回 undefined(禁止拼接后落错位置)', () => {
    expect(
      getRealPath(['@Active:table1', 'name'], () => createActiveState(undefined)),
    ).toBeUndefined();
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

describe('快照纯读取与绑定安全', () => {
  it('旧快照不通过 action 闭包读取新数据、焦点或视图', () => {
    const store = createBaseStore();
    store.setState({ data: { table: rows }, view: { table1: { dataId: 'table' } },
      viewParams: { table1: { [ParamKey.Active]: 'a' } } });
    const old = store.getState();
    old.setData(['table', 0, 'name'], 'new-a');
    old.setViewParamByKey('table1', ParamKey.Active, 'b');
    expect(readData(old, ['@Active:table1', 'name'])).toBe('row-a');
    expect(readData(old, ['@Row:table1:a', 'name'])).toBe('row-a');
    expect(readData(store.getState(), ['@Active:table1', 'name'])).toBe('row-b');
    expect(readData(store.getState(), ['@Row:table1:a', 'name'])).toBe('new-a');
  });

  it('嵌套动态数据源解析完整路径且不遗漏尾段', () => {
    const state = createFakeState({
      view: { groups: { dataId: 'groups' }, lines: { path: ['@Active:groups', 'lines'] } },
      viewParams: { groups: { [ParamKey.Active]: 'g1' } },
      data: { groups: [{ [KeyAttr]: 'g1', lines: [{ [KeyAttr]: 'a', price: 3 }] }] },
    });
    expect(resolvePath(state, ['@Row:lines:a', 'price'])).toEqual(['groups', 0, 'lines', 0, 'price']);
    expect(readData(state, ['@Row:lines:a', 'price'])).toBe(3);
  });

  it('重复键、跨类型同形键拒绝定位，数字键可兼容读取', () => {
    expect(getArrayIndexByKey([{ [KeyAttr]: 'a' }, { [KeyAttr]: 'a' }], 'a')).toBe(-1);
    expect(getArrayIndexByKey([{ [KeyAttr]: 1 }, { [KeyAttr]: '1' }], '1')).toBe(-1);
    expect(getArrayIndexByKey([{ [KeyAttr]: 1 }], '1')).toBe(0);
  });

  it('行引用循环和非法 URI 编码安全失败', () => {
    const state = createFakeState({ view: { loop: { path: ['@Row:loop:a'] } } });
    expect(resolvePath(state, '@Row:loop:a')).toBeUndefined();
    expect(resolvePath(state, '@Row:loop:%')).toBeUndefined();
  });
});

describe('getActivePath', () => {
  const tableState = () => createActiveState();

  it('根据焦点行 KeyAttr 计算焦点路径', () => {
    expect(getActivePath('table1', tableState(), 'b')).toEqual(['table', 1]);
  });

  it('未声明 path 时回退 dataId 计算焦点路径(与 ViewTable 列取数约定一致)', () => {
    const state = createFakeState({
      view: { table1: { id: 'table1', dataId: 'table' } },
      data: { table: rows },
    });
    expect(getActivePath('table1', state, 'a')).toEqual(['table', 0]);
  });

  it('焦点行不存在时返回 undefined', () => {
    expect(getActivePath('table1', tableState(), 'missing')).toBeUndefined();
  });

  it('视图不存在时返回 undefined(安全失败)', () => {
    expect(getActivePath('ghost', tableState(), 'a')).toBeUndefined();
  });

  it('循环引用超过 32 层时返回 undefined 防护', () => {
    // 构造 40 层 @Active 链式引用,触发 deep 防护
    const views: Record<string, any> = {};
    for (let i = 0; i < 40; i++) {
      views[`v${i}`] = { id: `v${i}`, path: `@Active:v${i + 1}` };
    }
    const state = createFakeState({
      view: views,
    });
    expect(getActivePath('v0', state, 'any')).toBeUndefined();
  });
});
