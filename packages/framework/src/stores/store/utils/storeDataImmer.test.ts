import { KeyAttr } from '@/interface';
import createBaseStore from '@/stores/store/storeBase';
import type { IStoreBase } from '../interface';
import { describe, expect, it } from 'vitest';

/**
 * 使用真实 createBaseStore(zustand + immer)验证 setData 写路径的结构共享语义。
 * storeData.test.ts 的 zSet 桩直接执行 recipe,无法覆盖 immer 引用行为;
 * 本文件补齐"修改列表元素字段时,数组与目标记录引用变化、其余记录引用保持"的回归,
 * 这是表格单元格行级更新判定(shouldCellUpdate: record !== prevRecord)的前提。
 * 采用 createBaseStore 而非裸 store 桩:@Active/@Row 引用解析依赖 store 上的
 * getView/getViewParamByKey 等 action,桩上缺失会导致路径解析失败。
 */
const makeRows = () => [
  { [KeyAttr]: 'r0', id: 'r0', price: 100 },
  { [KeyAttr]: 'r1', id: 'r1', price: 200 },
  { [KeyAttr]: 'r2', id: 'r2', price: 300 },
];

const setupStore = (rows: any[]) => {
  const store = createBaseStore();
  (store.setState as any)((state: IStoreBase) => {
    state.data['table'] = rows;
  });
  return store;
};

describe('setData 结构共享(真实 immer)', () => {
  it('修改列表元素字段:数组与目标记录引用变化,其余记录引用保持', () => {
    const store = setupStore(makeRows());
    const prevTable = store.getState().data['table'];
    const prevRow0 = prevTable[0];
    const prevRow1 = prevTable[1];
    const prevRow2 = prevTable[2];

    store.getState().setData(['table', 0, 'price'], 999);

    const nextTable = store.getState().data['table'];
    expect(nextTable).not.toBe(prevTable);
    expect(nextTable[0]).not.toBe(prevRow0);
    expect(nextTable[0].price).toBe(999);
    expect(nextTable[1]).toBe(prevRow1);
    expect(nextTable[2]).toBe(prevRow2);
    expect(store.getState().getData(['table', 0, 'price'])).toBe(999);
  });

  it('@Active 焦点行写入只影响焦点记录,其余记录引用保持', () => {
    const store = setupStore(makeRows());
    // 构造焦点上下文:视图 table1 绑定数据节点 table,焦点行键值 r1
    (store.setState as any)((state: IStoreBase) => {
      state.view['table1'] = { id: 'table1', type: 'VIEW_TABLE', dataId: 'table' };
      state.viewParams['table1'] = { '@Active': 'r1' };
    });
    const prevTable = store.getState().data['table'];
    const prevRow0 = prevTable[0];
    const prevRow1 = prevTable[1];
    const prevRow2 = prevTable[2];

    store.getState().setData(['@Active:table1', 'price'], 777);

    const nextTable = store.getState().data['table'];
    expect(nextTable[1]).not.toBe(prevRow1);
    expect(nextTable[1].price).toBe(777);
    expect(nextTable[0]).toBe(prevRow0);
    expect(nextTable[2]).toBe(prevRow2);
  });

  it('setDataByFn 函数修改目标行:同样保持未修改记录引用', () => {
    const store = setupStore(makeRows());
    const prevTable = store.getState().data['table'];
    const prevRow1 = prevTable[1];

    store.getState().setDataByFn(['table', 1], (row: any) => {
      row.price += 1;
    });

    const nextTable = store.getState().data['table'];
    expect(nextTable).not.toBe(prevTable);
    expect(nextTable[1]).not.toBe(prevRow1);
    expect(nextTable[1].price).toBe(201);
    expect(nextTable[0]).toBe(prevTable[0]);
    expect(nextTable[2]).toBe(prevTable[2]);
  });

  it('写入相同值时不产生无意义引用变化(immer 原地等值赋值)', () => {
    const store = setupStore(makeRows());
    const prevTable = store.getState().data['table'];
    const prevRow0 = prevTable[0];

    store.getState().setData(['table', 0, 'price'], 100);

    const nextTable = store.getState().data['table'];
    expect(nextTable).toBe(prevTable);
    expect(nextTable[0]).toBe(prevRow0);
  });
});
