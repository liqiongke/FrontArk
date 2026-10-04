import { describe, expect, it } from 'vitest';
import { getPageItems } from './pagination';

describe('分页页码序列', () => {
  it('总页数较少时全部列出，不出现无意义的省略号', () => {
    expect(getPageItems(1, 1)).toEqual([1]);
    expect(getPageItems(3, 5)).toEqual([1, 2, 3, 4, 5]);
    // 槽位上限为 siblingCount * 2 + 5 = 7
    expect(getPageItems(4, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('页数较多时保留首末页，缺口折叠为省略号', () => {
    // 当前页靠前：只有右侧有缺口
    expect(getPageItems(1, 20)).toEqual([1, 2, 'ellipsis-end', 20]);
    expect(getPageItems(2, 20)).toEqual([1, 2, 3, 'ellipsis-end', 20]);
    // 当前页居中：两侧都有缺口
    expect(getPageItems(10, 20)).toEqual([1, 'ellipsis-start', 9, 10, 11, 'ellipsis-end', 20]);
    // 当前页靠后：只有左侧有缺口
    expect(getPageItems(19, 20)).toEqual([1, 'ellipsis-start', 18, 19, 20]);
    expect(getPageItems(20, 20)).toEqual([1, 'ellipsis-start', 19, 20]);
  });

  it('当前页左右不缺页时不插入省略号', () => {
    // 当前页为 3 时左侧 2 紧随首页，无需省略
    expect(getPageItems(3, 20)).toEqual([1, 2, 3, 4, 'ellipsis-end', 20]);
    // 当前页为 18 时右侧 19 紧邻末页，无需省略
    expect(getPageItems(18, 20)).toEqual([1, 'ellipsis-start', 17, 18, 19, 20]);
  });

  it('支持调整当前页两侧的页数', () => {
    expect(getPageItems(10, 20, 0)).toEqual([1, 'ellipsis-start', 10, 'ellipsis-end', 20]);
    expect(getPageItems(10, 20, 2)).toEqual([
      1,
      'ellipsis-start',
      8,
      9,
      10,
      11,
      12,
      'ellipsis-end',
      20,
    ]);
  });

  it('入参越界时先夹紧，保证输出始终可用', () => {
    expect(getPageItems(0, 20)).toEqual([1, 2, 'ellipsis-end', 20]);
    expect(getPageItems(-5, 20)).toEqual([1, 2, 'ellipsis-end', 20]);
    expect(getPageItems(99, 20)).toEqual([1, 'ellipsis-start', 19, 20]);
    // 总页数为 0/非法时至少给出第 1 页
    expect(getPageItems(1, 0)).toEqual([1]);
  });
});
