import { describe, expect, it } from 'vitest';
import { KeyAttr } from '@/interface';
import { type TableColumn } from '../interface';
import {
  collectRowKeys,
  createSelectionColumn,
  filterDataColumns,
  resolveHeadCheckState,
  resolveSelectionConfig,
  toggleAllKeys,
  toggleSelectedKey,
} from './selection';

describe('勾选配置归一', () => {
  it('未开启时返回 undefined', () => {
    expect(resolveSelectionConfig(undefined)).toBeUndefined();
    expect(resolveSelectionConfig(false)).toBeUndefined();
  });

  it('true 与对象都归一为配置对象', () => {
    expect(resolveSelectionConfig(true)).toEqual({});
    expect(resolveSelectionConfig({ mode: 'single' })).toEqual({ mode: 'single' });
  });

  it('勾选列默认固定左侧、宽度 48；显式关掉固定时不写 fixed', () => {
    expect(createSelectionColumn({})).toMatchObject({
      key: '__selection__',
      width: 48,
      fixed: 'left',
      selection: true,
      align: 'center',
    });
    expect(createSelectionColumn({ fixed: false, width: 64 })).toMatchObject({
      width: 64,
      fixed: undefined,
      selection: true,
    });
  });
});

describe('勾选切换', () => {
  it('多选：逐行增删，顺序即勾选顺序', () => {
    const first = toggleSelectedKey([], 'a', 'multiple');
    expect(first).toEqual(['a']);
    expect(toggleSelectedKey(first, 'b', 'multiple')).toEqual(['a', 'b']);
    expect(toggleSelectedKey(['a', 'b'], 'a', 'multiple')).toEqual(['b']);
  });

  it('单选：选中新行顶掉上一行，再点同一行即取消', () => {
    const selected = toggleSelectedKey([], 'a', 'single');
    expect(selected).toEqual(['a']);
    expect(toggleSelectedKey(selected, 'b', 'single')).toEqual(['b']);
    expect(toggleSelectedKey(['b'], 'b', 'single')).toEqual([]);
  });
});

describe('行键收集与全选', () => {
  const data = [{ [KeyAttr]: 'a' }, { [KeyAttr]: 'b' }, { noKey: 1 }, { [KeyAttr]: 'b' }];

  it('只收集合法且不重复的行键（缺失键的行不可勾选）', () => {
    expect(collectRowKeys(data)).toEqual(['a', 'b']);
  });

  it('全选并入当前页行键，取消全选只移除当前页行键', () => {
    expect(toggleAllKeys(['x'], ['a', 'b'], true)).toEqual(['x', 'a', 'b']);
    expect(toggleAllKeys(['x', 'a', 'b'], ['a', 'b'], false)).toEqual(['x']);
  });

  it('表头三态：未选 / 半选 / 全选', () => {
    expect(resolveHeadCheckState([], ['a', 'b'])).toBe(false);
    expect(resolveHeadCheckState(['a'], ['a', 'b'])).toBe('indeterminate');
    expect(resolveHeadCheckState(['a', 'b'], ['a', 'b'])).toBe(true);
    // 无数据时不是「全选」
    expect(resolveHeadCheckState(['a'], [])).toBe(false);
  });

  it('业务列过滤：勾选列不进列设置与 CSV 导出', () => {
    const selection = createSelectionColumn({});
    const data: TableColumn = {
      key: 'price_0',
      title: '价格',
      dataIndex: 'price',
      valueType: 'number',
      align: 'right',
    };
    expect(filterDataColumns([selection, data])).toEqual([data]);
  });
});
