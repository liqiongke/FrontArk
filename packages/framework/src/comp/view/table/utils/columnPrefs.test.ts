import { describe, expect, it } from 'vitest';
import { type TableColumn } from '../interface';
import {
  buildColumnOrder,
  filterVisibleColumns,
  moveColumn,
  orderColumns,
} from './columnPrefs';

const col = (key: string): TableColumn => ({
  key,
  title: key,
  dataIndex: key,
  valueType: 'text',
  align: 'left',
});

const columns = [col('a_0'), col('b_1'), col('c_2')];
const keys = (list: TableColumn[]) => list.map((each) => each.key);

describe('列顺序与可见性偏好', () => {
  it('未设置顺序时原样返回配置顺序（保持同一引用，避免多余重渲染）', () => {
    expect(orderColumns(columns, undefined)).toBe(columns);
    expect(orderColumns(columns, [])).toBe(columns);
  });

  it('按用户顺序重排，配置新增的列追加到末尾', () => {
    expect(keys(orderColumns(columns, ['c_2', 'a_0']))).toEqual(['c_2', 'a_0', 'b_1']);
    // 新增列（配置里多出来的）不会被漏掉
    const withNew = [...columns, col('d_3')];
    expect(keys(orderColumns(withNew, ['c_2', 'a_0']))).toEqual(['c_2', 'a_0', 'b_1', 'd_3']);
  });

  it('顺序里已失效的 key 被忽略，不会产生空列', () => {
    expect(keys(orderColumns(columns, ['gone_9', 'b_1']))).toEqual(['b_1', 'a_0', 'c_2']);
  });

  it('buildColumnOrder 把顺序落成完整 key 序列', () => {
    expect(buildColumnOrder(columns, ['c_2'])).toEqual(['c_2', 'a_0', 'b_1']);
    expect(buildColumnOrder(columns, undefined)).toEqual(['a_0', 'b_1', 'c_2']);
  });

  it('过滤可见列，无隐藏时保持同一引用', () => {
    expect(filterVisibleColumns(columns, [])).toBe(columns);
    expect(keys(filterVisibleColumns(columns, ['b_1']))).toEqual(['a_0', 'c_2']);
  });
});

describe('拖拽换位', () => {
  const order = ['a', 'b', 'c', 'd'];

  it('把拖拽列放到目标列的位置，其余列顺势位移', () => {
    // 向下拖：b 落到 d 的位置
    expect(moveColumn(order, 'b', 'd')).toEqual(['a', 'c', 'd', 'b']);
    // 向上拖：d 落到 b 的位置
    expect(moveColumn(order, 'd', 'b')).toEqual(['a', 'd', 'b', 'c']);
  });

  it('与目标相邻时不动，避免同一目标上连续 dragover 来回跳', () => {
    expect(moveColumn(order, 'a', 'b')).toBe(order);
    expect(moveColumn(order, 'b', 'a')).toBe(order);
    // 幂等：连续触发同一对换位，结果稳定
    const once = moveColumn(order, 'a', 'd');
    expect(moveColumn(once, 'a', 'd')).toBe(once);
  });

  it('key 不存在或拖到自身时原样返回', () => {
    expect(moveColumn(order, 'a', 'a')).toBe(order);
    expect(moveColumn(order, 'x', 'a')).toBe(order);
    expect(moveColumn(order, 'a', 'x')).toBe(order);
  });
});
