// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KeyAttr } from '@/interface';
import StoreContext from '@/stores/store/storeContext';
import createBaseStore from '@/stores/store/storeBase';
import { ParamKey, PathKey } from '@/stores/store/interface';
import NetUtils from '@/utils/netUtils';
import { ViewType } from '../interface';
import ViewForm from '../form/viewForm';
import ViewTable from './viewTable';
import { RenderMode } from './interface';
import type * as AntdModule from 'antd';
import type * as ValueModule from '@/stores/store/hooks/useValue';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const metrics = vi.hoisted(() => ({
  tableEntries: 0, cellShells: 0, structures: 0, fields: new Map<string, number>(),
}));

// 当前 antd 的 CJS Cell 函数体每次执行都会调用 useCellRender，即使内容命中缓存。
// 只替换内存中的 Hook 导出并原样转发，不修改依赖文件，也不使用祖先 Profiler 推测 Cell。
const cellProbe = await vi.hoisted(async () => {
  const { createRequire } = await import('node:module');
  const require = createRequire(import.meta.url);
  const cellModule = require('@rc-component/table/lib/Cell/useCellRender') as {
    default: (...args: unknown[]) => unknown;
  };
  const original = cellModule.default;
  cellModule.default = (...args: unknown[]) => {
    metrics.cellShells += 1;
    return original(...args);
  };
  return { restore: () => { cellModule.default = original; } };
});
afterAll(() => cellProbe.restore());

vi.mock('./utils/useRowIdentityList', async (importOriginal) => {
  const mod = await importOriginal<{ default: (viewId: string) => unknown }>();
  return { ...mod, default: (viewId: string) => {
    metrics.structures += 1;
    return mod.default(viewId);
  } };
});

// 这里只计 Table 的父级入口；不把 wrapper 次数宣称为内部 Cell 执行次数。
vi.mock('antd', async (importOriginal) => {
  const mod = await importOriginal<typeof AntdModule>();
  const TableEntry = React.forwardRef<any, any>((props, ref) => {
    metrics.tableEntries += 1;
    return <mod.Table {...props} ref={ref} />;
  });
  return { ...mod, Table: TableEntry };
});
// useData 在真实 CtrlText 函数体内调用，计数包含其自订阅更新，区别于外部 wrapper。
vi.mock('@/stores/store/hooks/useValue', async (importOriginal) => {
  const mod = await importOriginal<typeof ValueModule>();
  return {
    ...mod,
    useData: (path: any) => {
      const key = JSON.stringify(path);
      metrics.fields.set(key, (metrics.fields.get(key) ?? 0) + 1);
      return mod.useData(path);
    },
  };
});

const rows = () => [
  { [KeyAttr]: 'a', price: '100', stock: '5' },
  { [KeyAttr]: 'b', price: '100', stock: '6' },
];
const fieldCount = (key: string, field: string) =>
  metrics.fields.get(JSON.stringify([`@Row:table1:${key}`, field])) ?? 0;

// 原生 setter 避开 React 的 value tracker，模拟真实输入事件。
const typeInto = (input: HTMLInputElement, value: string) => {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

describe('真实 Form + ViewTable 的防抖与结构隔离', () => {
  let store: ReturnType<typeof createBaseStore>;
  let root: Root;
  let container: HTMLDivElement;
  const renderPage = (strict = false) => act(() => {
    const page = <StoreContext value={store}>
      <ViewForm viewId="form1" />
      <ViewTable viewId="table1" />
    </StoreContext>;
    root.render(strict ? <React.StrictMode>{page}</React.StrictMode> : page);
  });
  const editInput = () => container.querySelector('.view-form-container input') as HTMLInputElement;
  const tableText = () => container.querySelector('.ant-table')?.textContent;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
    vi.stubGlobal('matchMedia', vi.fn(() => ({
      matches: false, addListener() {}, removeListener() {},
      addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; },
    })));
    const getStyle = window.getComputedStyle;
    vi.spyOn(window, 'getComputedStyle').mockImplementation((el) => getStyle(el));
    store = createBaseStore();
    store.setState({
      data: { table: rows() },
      view: {
        table1: { id: 'table1', type: ViewType.Table, dataId: 'table', height: 400,
          renderMode: RenderMode.Subscription,
          items: [{ field: 'price', title: '价格' }, { field: 'stock', title: '库存' }] },
        form1: { id: 'form1', type: ViewType.Form, path: ['@Active:table1'],
          items: [{ field: 'price', title: '价格' }] },
      },
      req: { table: { id: 'table', url: '/list', criteria: {}, parentIds: [], childIds: [] } },
      viewParams: { table1: { [ParamKey.Active]: 'a' } },
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    renderPage();
    act(() => vi.advanceTimersByTime(100));
    metrics.tableEntries = 0;
    metrics.structures = 0;
    metrics.fields.clear();
    // 挂载期至少有真实 Cell 外壳执行，证明探针拦截的是 antd 实际使用的模块
    expect(metrics.cellShells).toBeGreaterThan(0);
    metrics.cellShells = 0;
  });

  afterEach(() => {
    act(() => { store.getState().cancelData(); root.unmount(); });
    container.remove();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it.each([false, true])('输入后仅目标字段更新，Table 父级与 Cell 外壳不执行（StrictMode=%s）', (strict) => {
    if (strict) {
      renderPage(true);
      act(() => vi.advanceTimersByTime(100));
      metrics.tableEntries = 0;
      metrics.structures = 0;
      metrics.fields.clear();
    }
    const shellsBeforeEdit = metrics.cellShells;
    typeInto(editInput(), '999');
    expect(editInput().value).toBe('999');
    act(() => vi.advanceTimersByTime(299));
    expect(tableText()).not.toContain('999');
    act(() => vi.advanceTimersByTime(1));
    expect(tableText()).toContain('999');
    expect(metrics.tableEntries).toBe(0);
    expect(metrics.structures).toBe(0);
    // 输入与提交都不得带动真实 Ant Design Cell 外壳执行
    expect(metrics.cellShells).toBe(shellsBeforeEdit);
    expect(fieldCount('a', 'price')).toBeGreaterThan(0);
    expect(fieldCount('a', 'stock')).toBe(0);
    expect(fieldCount('b', 'price')).toBe(0);
    expect(fieldCount('b', 'stock')).toBe(0);
  });

  it('同值不同焦点行立即切换草稿，旧任务仍写回原记录', () => {
    typeInto(editInput(), '999');
    act(() => store.getState().setViewParamByKey('table1', ParamKey.Active, 'b'));
    expect(editInput().value).toBe('100');
    act(() => vi.advanceTimersByTime(300));
    expect(store.getState().getData(['@Row:table1:a', 'price'])).toBe('999');
    expect(editInput().value).toBe('100');
    expect(metrics.tableEntries).toBe(0);
  });

  it('取消同值提交前的草稿也能恢复输入，且不清空其他字段任务', () => {
    typeInto(editInput(), '999');
    act(() => {
      store.getState().setDataDebounce(['@Row:table1:b', 'stock'], '77');
      store.getState().cancelDataScope(['@Active:table1']);
    });
    expect(editInput().value).toBe('100');
    act(() => vi.advanceTimersByTime(300));
    expect(store.getState().getData(['@Row:table1:a', 'price'])).toBe('100');
    expect(store.getState().getData(['@Row:table1:b', 'stock'])).toBe('77');
  });

  it('同值写入不触发 Table、结构订阅或字段控件', () => {
    act(() => store.getState().setData(['@Row:table1:a', 'price'], '100'));
    expect(metrics.tableEntries).toBe(0);
    expect(metrics.structures).toBe(0);
    expect(metrics.cellShells).toBe(0);
    expect(metrics.fields.size).toBe(0);
  });

  it('列配置替换后使用新字段，不被旧内容缓存阻断', () => {
    act(() => store.getState().setView('table1', {
      ...store.getState().getView('table1'),
      items: [{ field: 'stock', title: '当前库存' }],
    }));
    expect(metrics.tableEntries).toBeGreaterThan(0);
    expect(tableText()).toContain('当前库存');
    expect(tableText()).not.toContain('100');
    act(() => store.getState().setData(['@Row:table1:a', 'stock'], '777'));
    expect(tableText()).toContain('777');
  });

  it('未挂载的行字段在表格重新挂载时读取最新提交值', () => {
    act(() => root.render(<StoreContext value={store}><ViewForm viewId="form1" /></StoreContext>));
    typeInto(editInput(), '888');
    act(() => vi.advanceTimersByTime(300));
    expect(store.getState().getData(['@Row:table1:a', 'price'])).toBe('888');
    renderPage();
    expect(tableText()).toContain('888');
  });

  it('同键整批替换不触发 Table，字段仍显示最新值', () => {
    act(() => store.getState().setData('table', rows().map((row) => ({ ...row, price: '321' }))));
    expect(metrics.tableEntries).toBe(0);
    expect(tableText()).toContain('321');
    expect(fieldCount('a', 'stock')).toBe(0);
    expect(fieldCount('b', 'stock')).toBe(0);
  });

  it('增删重排触发结构更新，单元格仍按身份读取', () => {
    act(() => store.getState().setDataByFn('table', (data) => {
      data.reverse();
      data.push({ [KeyAttr]: 'c', price: '333', stock: '8' });
    }));
    expect(metrics.tableEntries).toBeGreaterThan(0);
    expect(tableText()).toContain('333');
    typeInto(editInput(), '888');
    act(() => vi.advanceTimersByTime(300));
    expect(store.getState().getData(['table', 1, 'price'])).toBe('888');
  });

  it.each([RenderMode.Record, RenderMode.Subscription])('模式 %s 使用 path 优先于 dataId', (mode) => {
    act(() => {
      store.getState().setData('other', [{ [KeyAttr]: 'c', price: '456', stock: '7' }]);
      store.getState().setView('table1', {
        ...store.getState().getView('table1'), path: ['other'], renderMode: mode,
      });
    });
    expect(tableText()).toContain('456');
    expect(tableText()).not.toContain('100');
  });

  it('搜索重置取消待写条件，300ms 后不会复活', async () => {
    vi.spyOn(NetUtils, 'get').mockResolvedValue({ code: 200, data: rows() } as any);
    act(() => store.getState().setView('table1', {
      ...store.getState().getView('table1'), searchItems: [{ field: 'name', title: '名称' }],
    }));
    const search = container.querySelector('.search-panel input') as HTMLInputElement;
    typeInto(search, 'pending');
    const reset = container.querySelector('.search-panel button[aria-label="重置"]');
    expect(reset).not.toBeNull();
    await act(async () => { reset!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(search.value).toBe('');
    await act(async () => vi.advanceTimersByTimeAsync(300));
    expect(store.getState().getData([PathKey.Req, 'table', 'criteria', 'name'])).toBeUndefined();
  });
});
