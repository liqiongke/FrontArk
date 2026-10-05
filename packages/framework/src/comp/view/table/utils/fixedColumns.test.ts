import { describe, expect, it } from 'vitest';
import { type TableColumn, type TableColumnFixed } from '../interface';
import {
  fixedCellStyle,
  hasFixedColumns,
  partitionColumnsByFixed,
  resolveFixedOffsets,
} from './fixedColumns';

const col = (
  key: string,
  fixed?: TableColumnFixed,
  width = 100,
): TableColumn => ({
  key,
  title: key,
  dataIndex: key,
  valueType: 'text',
  align: 'left',
  width,
  fixed,
});

const keys = (list: TableColumn[]) => list.map((each) => each.key);

describe('固定列分区', () => {
  it('左固定在前、右固定在后，同侧保持原有相对顺序', () => {
    const columns = [col('c'), col('b', 'left'), col('a', 'left'), col('d', 'right'), col('e')];
    expect(keys(partitionColumnsByFixed(columns))).toEqual(['b', 'a', 'c', 'e', 'd']);
  });

  it('没有固定列时保持同一引用（避免多余重渲染）', () => {
    const columns = [col('a'), col('b')];
    expect(partitionColumnsByFixed(columns)).toBe(columns);
    expect(hasFixedColumns(columns)).toBe(false);
  });

  it('识别固定列', () => {
    expect(hasFixedColumns([col('a'), col('b', 'right')])).toBe(true);
  });
});

describe('固定列偏移', () => {
  it('左侧偏移为本侧固定列宽度累加，非固定列不占用偏移', () => {
    const columns = [col('sel', 'left', 48), col('id', 'left', 120), col('name'), col('price')];
    expect(resolveFixedOffsets(columns, [48, 120, 200, 100])).toEqual({ sel: 0, id: 48 });
  });

  it('右侧偏移从表格尾部反着累加', () => {
    const columns = [col('name'), col('status', 'right', 90), col('time', 'right', 180)];
    expect(resolveFixedOffsets(columns, [200, 90, 180])).toEqual({ time: 0, status: 180 });
  });

  it('两侧同时存在时各自独立累加', () => {
    const columns = [col('a', 'left', 50), col('b'), col('c', 'right', 70), col('d', 'right', 30)];
    expect(resolveFixedOffsets(columns, [50, 300, 70, 30])).toEqual({ a: 0, d: 0, c: 30 });
  });

  it('用渲染宽度而非声明宽度：偏移跟随实际布局', () => {
    // 表格被拉宽后每列实际渲染 150px（声明 100px）
    const columns = [col('a', 'left'), col('b', 'left')];
    expect(resolveFixedOffsets(columns, [150, 150])).toEqual({ a: 0, b: 150 });
  });
});

describe('固定列定位样式', () => {
  it('左固定写 left、右固定写 right，非固定列不写内联样式', () => {
    const offsets = { a: 0, b: 48, d: 0, c: 30 };
    expect(fixedCellStyle(col('a', 'left'), offsets)).toEqual({ left: 0 });
    expect(fixedCellStyle(col('b', 'left'), offsets)).toEqual({ left: 48 });
    expect(fixedCellStyle(col('c', 'right'), offsets)).toEqual({ right: 30 });
    expect(fixedCellStyle(col('e'), offsets)).toBeUndefined();
  });

  it('偏移量缺失时不写样式（避免固定列错误地停在 0 位）', () => {
    expect(fixedCellStyle(col('a', 'left'), {})).toBeUndefined();
  });
});
