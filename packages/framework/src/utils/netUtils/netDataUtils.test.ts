import { describe, expect, it } from 'vitest';
import { KeyAttr } from '@/interface';
import { NetDataUtils } from './netDataUtils';

// SysDataProps 的必填运行字段对纯函数测试无意义,放宽类型聚焦 initData 行为
const req = { id: 'table', parentIds: [], childIds: [], criteria: {} } as any;

describe('NetDataUtils.initData', () => {
  it('基础类型与 null/undefined 原样返回(保持值不丢失)', () => {
    expect(NetDataUtils.initData(1, req)).toBe(1);
    expect(NetDataUtils.initData('x', req)).toBe('x');
    expect(NetDataUtils.initData(false, req)).toBe(false);
    expect(NetDataUtils.initData(null, req)).toBeNull();
    expect(NetDataUtils.initData(undefined, req)).toBeUndefined();
  });

  it('对象浅拷贝注入 key,不修改入参(冻结对象安全)', () => {
    const data = Object.freeze({ id: 1, name: 'n' });
    const result = NetDataUtils.initData(data, req);
    expect(result).toEqual({ id: 1, name: 'n', [KeyAttr]: '1' });
    expect(result).not.toBe(data);
    expect(data).toEqual({ id: 1, name: 'n' });
  });

  it('数组元素递归注入 key,入参数组不被修改', () => {
    const data = [{ id: 1 }, { id: 2 }];
    const result = NetDataUtils.initData(data, req);
    expect(result[0][KeyAttr]).toBe('1');
    expect(result[1][KeyAttr]).toBe('2');
    expect(data[0]).not.toHaveProperty(KeyAttr);
    expect(data[1]).not.toHaveProperty(KeyAttr);
  });

  it('keyAttr 显式声明取字段,0 值也是合法键值(不能用 falsy 判断)', () => {
    const result = NetDataUtils.initData({ code: 0 }, { ...req, keyAttr: 'code' });
    expect(result[KeyAttr]).toBe('0');
  });

  it('keyAttr 数组形式拼接多字段', () => {
    const result = NetDataUtils.initData({ a: 1, b: 'x' }, { ...req, keyAttr: ['a', 'b'] });
    expect(result[KeyAttr]).toBe('1_x');
  });

  it('未声明 keyAttr 时按 id/key/code 顺序兜底', () => {
    expect(NetDataUtils.initData({ id: 'i1' }, req)[KeyAttr]).toBe('i1');
    expect(NetDataUtils.initData({ key: 'k1' }, req)[KeyAttr]).toBe('k1');
    expect(NetDataUtils.initData({ code: 'c1' }, req)[KeyAttr]).toBe('c1');
  });

  it('无键值字段时生成随机 key', () => {
    const result = NetDataUtils.initData({ name: 'n' }, req);
    expect(String(result[KeyAttr])).toMatch(/^key_/);
  });

  it('已带 key 的对象原样返回(保持同一引用)', () => {
    const data = { [KeyAttr]: 'k', v: 1 };
    expect(NetDataUtils.initData(data, req)).toBe(data);
  });
});
