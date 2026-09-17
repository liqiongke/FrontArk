// @vitest-environment jsdom
import { KeyAttr } from '@/interface';
import createBaseStore from '@/stores/store/storeBase';
import StoreContext from '@/stores/store/storeContext';
import type { IStoreBase } from '@store/interface';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, describe, expect, it } from 'vitest';
import useRowIdentityList, { type RowIdentityState } from './useRowIdentityList';

// React 19 act 环境声明:未设置时 act 无法正确刷新渲染批次
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

// store 实例类型(UseBoundStore),context 与 mountProbe 均以此为准
type TestStore = ReturnType<typeof createBaseStore>;

/**
 * 结构订阅 hook 行为回归:
 * - 字段编辑(数组引用变化但行键序列不变)时行列表引用复用,表格外壳不因值写入更新;
 * - 行序列变化(新增/删除/重排)时行列表重建,行身份对象跨版本复用;
 * - 行键缺失/重复/非字符串时标记回退,由 ViewTable 退回 Record 模式。
 */
const makeRows = (count: number) =>
  Array.from({ length: count }, (_, i) => ({
    [KeyAttr]: `r${i}`,
    id: `r${i}`,
    price: i * 100,
  }));

// 通过真实 createBaseStore 构造页面 store(不调用 init/startRequests,不发起网络请求)
const setupStore = (rows: any[]) => {
  const store = createBaseStore();
  (store.setState as any)((state: IStoreBase) => {
    state.data['table'] = rows;
    state.view['table1'] = { id: 'table1', type: 'VIEW_TABLE', dataId: 'table' };
    return state;
  });
  return store;
};

// 挂载探针组件捕获 hook 返回值(缓存对象引用,断言复用语义)
let captured: RowIdentityState | undefined;
const Probe: React.FC = () => {
  captured = useRowIdentityList('table1');
  return null;
};

const mountProbe = (store: TestStore) => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(<StoreContext value={store}><Probe /></StoreContext>);
  });
  return {
    rerender: () =>
      act(() => {
        root.render(<StoreContext value={store}><Probe /></StoreContext>);
      }),
    unmount: () =>
      act(() => {
        root.unmount();
      }),
  };
};

describe('useRowIdentityList(结构订阅)', () => {
  let mounted: { rerender: () => void; unmount: () => void };

  beforeEach(() => {
    captured = undefined;
  });

  const mountWith = (rows: any[]) => {
    const store = setupStore(rows);
    mounted = mountProbe(store);
    return store;
  };

  it('数据就绪时生成与数据等长且顺序一致的行身份列表', () => {
    const rows = makeRows(3);
    const store = mountWith(rows);

    expect(captured!.fallback).toBe(false);
    expect(captured!.rows).toHaveLength(3);
    expect(captured!.rows.map((row) => row[KeyAttr])).toEqual(['r0', 'r1', 'r2']);
    expect(captured!.rawData).toBe(store.getState().data['table']);
    mounted.unmount();
  });

  it('字段修改(数组引用变化但行键序列不变)时行列表引用复用', () => {
    const store = mountWith(makeRows(3));
    const prevRows = captured!.rows;

    act(() => {
      store.getState().setData(['table', 0, 'price'], 1);
    });

    expect(captured!.rows).toBe(prevRows);
    expect(captured!.fallback).toBe(false);
    mounted.unmount();
  });

  it('同键记录替换(新对象同键)时行列表引用复用', () => {
    const store = mountWith(makeRows(3));
    const prevRows = captured!.rows;

    act(() => {
      store.getState().setData(['table'], [
        { ...makeRows(1)[0], price: 42 },
        ...makeRows(2).map((row, i) => ({ ...row, [KeyAttr]: `r${i + 1}` })),
      ]);
    });

    expect(captured!.rows).toBe(prevRows);
    mounted.unmount();
  });

  it('新增行时行列表重建,已有行身份对象跨版本复用', () => {
    const store = mountWith(makeRows(2));
    const prevRows = captured!.rows;

    act(() => {
      store.getState().setDataByFn(['table'], (rows: any[]) => {
        rows.push({ [KeyAttr]: 'r2', id: 'r2', price: 200 });
      });
    });

    expect(captured!.rows).not.toBe(prevRows);
    expect(captured!.rows).toHaveLength(3);
    expect(captured!.rows[0]).toBe(prevRows[0]);
    expect(captured!.rows[2][KeyAttr]).toBe('r2');
    mounted.unmount();
  });

  it('删除行时行列表重建,序列指向剩余记录', () => {
    const store = mountWith(makeRows(3));
    const prevRows = captured!.rows;

    act(() => {
      store.getState().setDataByFn(['table'], (rows: any[]) => {
        rows.splice(1, 1);
      });
    });

    expect(captured!.rows).not.toBe(prevRows);
    expect(captured!.rows.map((row) => row[KeyAttr])).toEqual(['r0', 'r2']);
    mounted.unmount();
  });

  it('重排时行列表按新顺序重建', () => {
    const store = mountWith(makeRows(3));
    const prevRows = captured!.rows;

    act(() => {
      store.getState().setDataByFn(['table'], (rows: any[]) => {
        rows.reverse();
      });
    });

    expect(captured!.rows).not.toBe(prevRows);
    expect(captured!.rows.map((row) => row[KeyAttr])).toEqual(['r2', 'r1', 'r0']);
    mounted.unmount();
  });

  it('数据非数组时为稳定空列表,恢复数组后重新生成', () => {
    const store = mountWith(makeRows(2));
    const readyRows = captured!.rows;

    act(() => {
      store.getState().setData(['table'], undefined);
    });
    expect(captured!.rows).toHaveLength(0);
    expect(captured!.fallback).toBe(false);

    act(() => {
      store.getState().setData(['table'], makeRows(2));
    });
    expect(captured!.rows).toHaveLength(2);
    expect(captured!.rows).not.toBe(readyRows);
    mounted.unmount();
  });

  it('行键缺失时回退 Record 模式并保留原始数据', () => {
    const rows = [{ [KeyAttr]: 'r0', id: 'r0' }, { id: 'r1' }];
    mountWith(rows);

    expect(captured!.fallback).toBe(true);
    expect(captured!.rawData).toBe(rows);
    mounted.unmount();
  });

  it('行键重复时回退 Record 模式', () => {
    mountWith([
      { [KeyAttr]: 'r0', id: 'r0' },
      { [KeyAttr]: 'r0', id: 'r0-dup' },
    ]);

    expect(captured!.fallback).toBe(true);
    mounted.unmount();
  });

  it('行键为数字时回退 Record 模式(超出 @Row 字符串键解析能力)', () => {
    mountWith([{ [KeyAttr]: 1, id: 1 }]);

    expect(captured!.fallback).toBe(true);
    mounted.unmount();
  });

  it('基础路径变化时按新路径提取行身份', () => {
    const store = mountWith(makeRows(2));
    const prevRows = captured!.rows;

    act(() => {
      (store.setState as any)((state: IStoreBase) => {
        state.data['table2'] = makeRows(1).map((row) => ({ ...row, [KeyAttr]: 'x0' }));
        state.view['table1'] = { id: 'table1', type: 'VIEW_TABLE', dataId: 'table2' };
        return state;
      });
    });

    expect(captured!.rows).not.toBe(prevRows);
    expect(captured!.rows.map((row) => row[KeyAttr])).toEqual(['x0']);
    mounted.unmount();
  });
});
