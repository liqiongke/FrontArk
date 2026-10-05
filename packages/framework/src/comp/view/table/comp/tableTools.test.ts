import { describe, expect, it } from 'vitest';
import { buildCsv } from './tableTools';

const columns = [
  { title: '产品ID', dataIndex: 'id' },
  { title: '产品名称', dataIndex: 'name' },
];

describe('表格数据导出为 CSV', () => {
  it('首行为表头，随后按列顺序输出数据行', () => {
    const csv = buildCsv(columns, [
      { id: 'PRD1', name: '甲' },
      { id: 'PRD2', name: '乙' },
    ]);
    expect(csv).toBe('产品ID,产品名称\r\nPRD1,甲\r\nPRD2,乙');
  });

  it('含分隔符/引号/换行的字段加引号并转义内部引号', () => {
    const csv = buildCsv(columns, [{ id: 'a,b', name: '带"引号"的名称' }]);
    expect(csv).toContain('"a,b"');
    expect(csv).toContain('"带""引号""的名称"');
    // 换行同样需要引号包裹，否则会被解析成新的一行
    expect(buildCsv(columns, [{ id: 'x', name: '第一行\n第二行' }])).toContain('"第一行\n第二行"');
  });

  it('缺失字段与空值输出为空字符串，不产生 undefined 字样', () => {
    const csv = buildCsv(columns, [{ id: 'PRD1' }, { id: null, name: undefined }]);
    expect(csv).toContain('PRD1,');
    expect(csv).not.toContain('undefined');
    expect(csv).not.toContain('null');
  });

  it('无数据时只输出表头', () => {
    expect(buildCsv(columns, [])).toBe('产品ID,产品名称');
  });
});
