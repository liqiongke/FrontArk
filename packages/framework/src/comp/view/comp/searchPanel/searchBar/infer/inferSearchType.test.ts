import { describe, expect, it } from 'vitest';

import { type SearchPlaneItem } from '../../interface';
import { inferSearchType } from './inferSearchType';
import { parseTypedQuery } from './parseTypedQuery';
import { normalizeSearchValue } from './normalizeValue';

// 单据搜索的典型字段声明:覆盖正则、日期、枚举、别名、兜底五类推断入口
const items: SearchPlaneItem[] = [
  { title: '运输单号', field: 'waybillNo', keywords: ['运单', 'tr'], regExp: /^TR\d{6,}$/ },
  { title: '产品名称', field: 'name', keywords: ['品名', '名称'], primary: true },
  { title: '金额', field: 'price', valueKind: 'number' },
  { title: '单据状态', field: 'status', valueKind: 'enum', ctrl: { type: 'SELECT' as never, items: [{ label: '待收货', value: 'pending' }] } },
  { title: '创建时间', field: 'createTime', keywords: ['日期'], valueKind: 'dateRange' },
];
describe('parseTypedQuery', () => {
  it('解析 key:value 与 key=value', () => {
    expect(parseTypedQuery('tr:TR000001')).toEqual({ key: 'tr', value: 'TR000001' });
    expect(parseTypedQuery('运单=TR1')).toEqual({ key: '运单', value: 'TR1' });
  });

  it('不把普通文本误判为显式语法', () => {
    expect(parseTypedQuery('TR000001')).toBeUndefined();
    expect(parseTypedQuery('2026-10-01')).toBeUndefined();
  });

  it('保留空值,以便仅锁定类型', () => {
    expect(parseTypedQuery('tr:')).toEqual({ key: 'tr', value: '' });
  });
});
describe('inferSearchType', () => {
  it('P0 已锁定时不再改写类型', () => {
    const result = inferSearchType('任意内容', items, { lockedField: 'price' });
    expect(result).toEqual({ field: 'price', confidence: 'locked', rule: 'locked' });
  });

  it('P1 显式语法命中别名并带出值', () => {
    const result = inferSearchType('tr:TR000001', items);
    expect(result.field).toBe('waybillNo');
    expect(result.confidence).toBe('exact');
    expect(result.value).toBe('TR000001');
  });

  it('P1 key 未命中时保留输入,交还用户', () => {
    const result = inferSearchType('xx:123', items);
    expect(result.confidence).toBe('none');
    expect(result.value).toBe('xx:123');
  });

  it('P2 值形状优先于正则:日期文本归到日期字段', () => {
    expect(inferSearchType('2026-10-01', items)).toMatchObject({ field: 'createTime', confidence: 'inferred' });
    expect(inferSearchType('2026-10-01 ~ 2026-10-03', items)).toMatchObject({ field: 'createTime' });
    expect(inferSearchType('今天', items)).toMatchObject({ field: 'createTime' });
    expect(inferSearchType('近7天', items)).toMatchObject({ field: 'createTime' });
  });

  it('P2 数字文本归到数字字段', () => {
    expect(inferSearchType('199.5', items)).toMatchObject({ field: 'price', rule: 'shape-number' });
  });

  it('P3 正则完整命中单号', () => {
    expect(inferSearchType('TR123456', items)).toMatchObject({
      field: 'waybillNo',
      confidence: 'exact',
      rule: 'regexp',
    });
  });

  it('P4 正则字面量前缀命中:tr 定位到运输单号', () => {
    expect(inferSearchType('tr', items)).toMatchObject({ field: 'waybillNo', confidence: 'inferred', rule: 'prefix' });
  });

  it('P5 枚举 label 命中', () => {
    expect(inferSearchType('待收货', items)).toMatchObject({ field: 'status', rule: 'option' });
  });

  it('P6 别名命中', () => {
    expect(inferSearchType('品名', items)).toMatchObject({ field: 'name', rule: 'keyword' });
  });

  it('P7 未识别时回落到兜底字段且不锁定', () => {
    expect(inferSearchType('随便什么', items)).toMatchObject({ field: 'name', confidence: 'none', rule: 'primary' });
  });
});
describe('normalizeSearchValue', () => {
  it('文本去首尾空白', () => {
    expect(normalizeSearchValue('text', '  abc  ')).toEqual({ ok: true, value: 'abc' });
  });

  it('数字非法时给出提示', () => {
    expect(normalizeSearchValue('number', 'abc')).toEqual({ ok: false, message: '请输入合法数字' });
    expect(normalizeSearchValue('number', '12.5')).toEqual({ ok: true, value: 12.5 });
  });

  it('日期归一为 YYYY-MM-DD', () => {
    expect(normalizeSearchValue('date', '2026/10/1')).toEqual({ ok: true, value: '2026-10-01' });
  });

  it('区间文本展开为起止日期,起止颠倒时自动交换', () => {
    expect(normalizeSearchValue('dateRange', '2026-10-01 ~ 2026-10-03')).toEqual({
      ok: true,
      value: ['2026-10-01', '2026-10-03'],
    });
    expect(normalizeSearchValue('dateRange', '2026-10-05 至 2026-10-01')).toEqual({
      ok: true,
      value: ['2026-10-01', '2026-10-05'],
    });
  });

  it('区间控件未选完时拒绝提交', () => {
    expect(normalizeSearchValue('dateRange', ['', ''])).toEqual({ ok: false, message: '请选择完整的起止日期' });
  });

  it('枚举按 label 反查为业务值', () => {
    const status = items[3];
    expect(normalizeSearchValue('enum', '待收货', status)).toEqual({ ok: true, value: 'pending' });
  });
});