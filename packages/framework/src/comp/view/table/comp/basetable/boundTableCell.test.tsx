// @vitest-environment jsdom
import { KeyAttr } from '@/interface';
import { useDataById } from '@/stores/store/hooks/useValue';
import createBaseStore from '@/stores/store/storeBase';
import StoreContext from '@/stores/store/storeContext';
import type { IStoreBase } from '@store/interface';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BoundTableCell from './boundTableCell';

// React 19 act 环境声明:未设置时 act 无法正确刷新渲染批次
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * 单元格隔离回归(渲染计数):
 * 模拟 rc-table 行外壳订阅完整数组后重渲染的场景(行外壳重渲染会以相同 props 重建全部单元格元素),
 * 验证 BoundTableCell 的身份 memo 隔离与内部路径订阅分工:
 * - 计数口径:CountingCtrlText 由 BoundTableCell 内部的 CtrlFactory 渲染,其调用次数即
 *   "单元格容器组件(BoundTableCellBase)的渲染次数" = memo 隔离指标;
 *   字段值变化由 CtrlText 自身的 useData 订阅驱动,不经过容器,容器计数不上涨;
 *   若 memo 失效,行外壳重渲染会连带重渲染容器,计数必然上涨;
 * - 字段值是否真正更新由 DOM 文本断言覆盖(值订阅的效果)。
 */
const { ctrlTextRenders } = vi.hoisted(() => ({
  ctrlTextRenders: new Map<string, number>(),
}));
vi.mock('@ctrl/text/ctrlText', async (importOriginal) => {
  const mod = await importOriginal<any>();
  const RealCtrlText = mod.default;
  const CountingCtrlText: React.FC<any> = (props) => {
    const key = (props.path ?? []).join('§');
    ctrlTextRenders.set(key, (ctrlTextRenders.get(key) ?? 0) + 1);
    return React.createElement(RealCtrlText, props);
  };
  return { ...mod, default: CountingCtrlText };
});

const makeRows = () => [
  { [KeyAttr]: 'r0', id: 'r0', price: 100, stock: 5 },
  { [KeyAttr]: 'r1', id: 'r1', price: 200, stock: 6 },
];

// 通过真实 createBaseStore 构造页面 store(不调用 init/startRequests,不发起网络请求)
const setupStore = (rows: any[]) => {
  const store = createBaseStore();
  (store.setState as any)((state: IStoreBase) => {
    state.data['table'] = rows;
    state.view['table1'] = {
      id: 'table1',
      type: 'VIEW_TABLE',
      dataId: 'table',
      items: [
        { title: '价格', field: 'price' },
        { title: '库存', field: 'stock' },
      ],
    };
  });
  return store;
};

// 行外壳渲染计数:模拟"订阅完整数组、数组引用变化即重渲染"的父级(rc-table 行容器同构场景)
let rowShellRenders = 0;

// 模拟 rc-table 行外壳:重渲染时以相同身份 props 重建全部单元格元素
const RowShell: React.FC = () => {
  rowShellRenders += 1;
  const [rows] = useDataById('table');
  return (
    <div>
      <div data-testid="rows">{rows?.length ?? 0}</div>
      <div data-cell="price-r0">
        <BoundTableCell viewId="table1" columnKey="price_0" rowKey="r0" />
      </div>
      <div data-cell="stock-r0">
        <BoundTableCell viewId="table1" columnKey="stock_1" rowKey="r0" />
      </div>
      <div data-cell="price-r1">
        <BoundTableCell viewId="table1" columnKey="price_0" rowKey="r1" />
      </div>
    </div>
  );
};

const ctrlRenders = (rowKey: string, field: string) =>
  // 与 BoundTableCell 生成的 cellPath 对齐:首段为单段 @Row:<viewId>:<rowKey> 引用
  ctrlTextRenders.get(`@Row:table1:${rowKey}§${field}`) ?? 0;

const cellText = (container: HTMLElement, cell: string) =>
  container.querySelector(`[data-cell="${cell}"] .ctrl-text`)?.textContent;

describe('BoundTableCell(单元格隔离,渲染计数)', () => {
  let container: HTMLElement;
  let root: Root;
  let store: ReturnType<typeof setupStore>;

  beforeEach(() => {
    ctrlTextRenders.clear();
    rowShellRenders = 0;
    store = setupStore(makeRows());
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(
        <StoreContext value={store}>
          <RowShell />
        </StoreContext>,
      );
    });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('行外壳重渲染时仅值变化单元格控件更新,其他行不受影响', () => {
    // 挂载基线:行外壳与三个单元格控件各渲染一次
    expect(rowShellRenders).toBe(1);
    expect(ctrlRenders('r0', 'price')).toBe(1);
    expect(ctrlRenders('r0', 'stock')).toBe(1);
    expect(ctrlRenders('r1', 'price')).toBe(1);
    expect(cellText(container, 'price-r0')).toBe('100');

    // 按下标路径修改 r0 的 price:数组引用变化 → 行外壳重渲染;
    // 但所有单元格容器(含值变化的 price)均以相同身份 props 被 memo 拦截,计数不上涨;
    // price 的新值由 CtrlText 自身 useData 订阅驱动写入 DOM
    act(() => {
      store.getState().setData(['table', 0, 'price'], 999);
    });

    expect(rowShellRenders).toBe(2);
    expect(ctrlRenders('r0', 'price')).toBe(1);
    expect(ctrlRenders('r0', 'stock')).toBe(1);
    expect(ctrlRenders('r1', 'price')).toBe(1);
    expect(cellText(container, 'price-r0')).toBe('999');
    expect(cellText(container, 'stock-r0')).toBe('5');
    expect(cellText(container, 'price-r1')).toBe('200');
  });

  it('@Row 路径写入(焦点行同款寻址)同样只更新对应单元格控件', () => {
    // @Row 引用为单段字符串(与 ViewPathUtils.row/BoundTableCell 生成格式一致)
    act(() => {
      store.getState().setData(['@Row:table1:r0', 'stock'], 8);
    });

    expect(rowShellRenders).toBe(2);
    expect(ctrlRenders('r0', 'stock')).toBe(1);
    expect(ctrlRenders('r0', 'price')).toBe(1);
    expect(ctrlRenders('r1', 'price')).toBe(1);
    expect(cellText(container, 'stock-r0')).toBe('8');
    expect(cellText(container, 'price-r0')).toBe('100');
  });

  it('行键序列不变的同键替换不触发单元格控件更新', () => {
    // 数组整体替换但行键序列不变:单元格身份 props 不变且字段值未变化,全部控件不重渲染
    act(() => {
      store.getState().setData(['table'], [
        { [KeyAttr]: 'r0', id: 'r0', price: 100, stock: 5 },
        { [KeyAttr]: 'r1', id: 'r1', price: 200, stock: 6 },
      ]);
    });

    expect(rowShellRenders).toBe(2);
    expect(ctrlRenders('r0', 'price')).toBe(1);
    expect(ctrlRenders('r0', 'stock')).toBe(1);
    expect(ctrlRenders('r1', 'price')).toBe(1);
  });

  it('显式列 path 优先于行身份，并响应运行时路径配置变化', () => {
    act(() => {
      store.getState().setData('summary', { price: '共享价格', next: '更新路径' });
      store.getState().setView('table1', {
        ...store.getState().getView('table1'),
        items: [
          { field: 'price', path: ['summary', 'price'] },
          { field: 'stock' },
        ],
      });
    });
    expect(cellText(container, 'price-r0')).toBe('共享价格');
    expect(cellText(container, 'price-r1')).toBe('共享价格');
    act(() => store.getState().setData(['table', 0, 'price'], 999));
    expect(cellText(container, 'price-r0')).toBe('共享价格');
    act(() => store.getState().setView('table1', {
      ...store.getState().getView('table1'),
      items: [{ field: 'price', path: ['summary', 'next'] }, { field: 'stock' }],
    }));
    expect(cellText(container, 'price-r0')).toBe('更新路径');
    expect(cellText(container, 'stock-r0')).toBe('5');
    act(() => store.getState().setView('table1', {
      ...store.getState().getView('table1'),
      items: [{ field: 'price' }, { field: 'stock' }],
    }));
    expect(cellText(container, 'price-r0')).toBe('999');
    expect(cellText(container, 'price-r1')).toBe('200');
  });

  it('新增行不触发既有单元格控件更新,新行控件按需渲染', () => {
    act(() => {
      store.getState().setDataByFn(['table'], (rows: any[]) => {
        rows.push({ [KeyAttr]: 'r2', id: 'r2', price: 300, stock: 7 });
      });
    });

    // 行外壳重渲染(行数展示更新),既有单元格控件计数不变
    expect(rowShellRenders).toBe(2);
    expect(container.querySelector('[data-testid="rows"]')?.textContent).toBe('3');
    expect(ctrlRenders('r0', 'price')).toBe(1);
    expect(ctrlRenders('r0', 'stock')).toBe(1);
    expect(ctrlRenders('r1', 'price')).toBe(1);
  });
});
