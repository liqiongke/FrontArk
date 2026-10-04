// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KeyAttr } from '@/interface';
import StoreContext from '@/stores/store/storeContext';
import createBaseStore from '@/stores/store/storeBase';
import { ParamKey, PathKey } from '@/stores/store/interface';
import NetUtils from '@/utils/netUtils';
import { ViewType } from '../interface';
import ViewForm from '../form/viewForm';
import ViewTab from '../tab/viewTab';
import { Ctrl } from '@/comp/control/interface';
import ViewTable from './viewTable';
import { RenderMode, SummaryType } from './interface';
import { resetTableRenderProbes, tableRenderProbes } from './utils/tableTestProbes';
import type * as ValueModule from '@/stores/store/hooks/useValue';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const metrics = vi.hoisted(() => ({
  structures: 0,
  fields: new Map<string, number>(),
}));

vi.mock('./utils/useRowIdentityList', async (importOriginal) => {
  const mod = await importOriginal<{ default: (viewId: string) => unknown }>();
  return { ...mod, default: (viewId: string) => {
    metrics.structures += 1;
    return mod.default(viewId);
  } };
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
  const tableText = () => container.querySelector('[data-slot="view-table"]')?.textContent;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
    // jsdom 无布局引擎:offset 尺寸恒为 0,TanStack Virtual 会判定视口/行高为零而不渲染行。
    // 统一 mock 视口与行高测量来源,保证虚拟窗口覆盖测试数据(配合 overscan)
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(1024);
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(34);
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
    metrics.structures = 0;
    metrics.fields.clear();
    // 挂载期至少有真实单元格外壳执行，证明框架探针覆盖实际渲染路径
    expect(tableRenderProbes.cellShell).toBeGreaterThan(0);
    expect(tableRenderProbes.structure).toBeGreaterThan(0);
    resetTableRenderProbes();
  });

  afterEach(() => {
    act(() => { store.getState().cancelData(); root.unmount(); });
    container.remove();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('表格保留滚动容器、行分隔与当前焦点高亮', () => {
    const table = container.querySelector('[data-slot="view-table"]')!;
    expect(table.parentElement?.classList.contains('overflow-auto')).toBe(true);
    // 边框/圆角/底色上移到统一面板,面板内的表格层只保留滚动容器
    expect(table.parentElement?.classList.contains('border')).toBe(false);
    expect(table.parentElement?.classList.contains('bg-card')).toBe(false);
    const panel = container.querySelector('.view-table')!;
    expect(panel.classList.contains('bg-surface')).toBe(true);
    expect(panel.classList.contains('rounded-lg')).toBe(true);
    expect(panel.classList.contains('p-4')).toBe(true);
    const row = table.querySelector('.view-table-row-active')!;
    expect(row.classList.contains('border-b')).toBe(true);
    expect(row.classList.contains('bg-muted')).toBe(true);
  });

  it('滚动条为覆盖式：两个方向的原生条都被隐藏，横纵各由自绘条接管', () => {
    const table = container.querySelector('[data-slot="view-table"]')!;
    const scroller = table.parentElement as HTMLElement;
    // 滚动容器本身保持不变（虚拟器依赖它作为滚动元素）
    expect(scroller.classList.contains('overflow-auto')).toBe(true);
    // 原生滚动条两个方向都要隐藏：只隐藏单方向会在部分滚动条模式下残留原生条
    expect(scroller.className).toContain('[scrollbar-width:none]');
    expect(scroller.className).toContain('[&::-webkit-scrollbar]:hidden');
    // 横纵两根自绘条都已挂载：jsdom 无布局引擎，判定为无需滚动而整条隐藏
    const thumbs = container.querySelectorAll('[role="scrollbar"]');
    expect(thumbs.length).toBe(2);
    expect(thumbs[0].getAttribute('aria-orientation')).toBe('vertical');
    expect(thumbs[1].getAttribute('aria-orientation')).toBe('horizontal');
    thumbs.forEach((thumb) => {
      expect((thumb.parentElement as HTMLElement).style.display).toBe('none');
    });
    // 轨道定位在相对容器内，且容器持有表头/统计行两个内缩依据
    const overlay = (thumbs[0].parentElement as HTMLElement).parentElement as HTMLElement;
    expect(overlay.classList.contains('absolute')).toBe(true);
    // 回归防护：覆盖层铺满滚动区域，必须让指针事件穿透，
    // 否则滚轮滚动与行点击都会被它吃掉（它只是滚动容器的兄弟节点）
    expect(overlay.classList.contains('pointer-events-none')).toBe(true);
    thumbs.forEach((thumb) => {
      expect((thumb.parentElement as HTMLElement).classList.contains('pointer-events-auto')).toBe(true);
    });
    act(() => store.getState().setView('table1', {
      ...store.getState().getView('table1'),
      summaryItems: [{ field: 'price', type: SummaryType.Sum }],
    }));
    // 统计行存在时，滚动条的内缩依据（tfoot）已渲染
    expect(container.querySelector('tfoot')).not.toBeNull();
  });

  it('搜索面板与表格合并到同一个面板,不再各自带边框与底色', () => {
    act(() => store.getState().setView('table1', {
      ...store.getState().getView('table1'),
      searchItems: [{ field: 'name', title: '名称' }],
    }));
    // 搜索区与表格同属一个面板,二者之间只有间距
    const panel = container.querySelector('.view-table')!;
    const search = panel.querySelector('.search-panel')!;
    expect(search).not.toBeNull();
    expect(search.classList.contains('border')).toBe(false);
    expect(search.classList.contains('bg-card')).toBe(false);
    expect(search.classList.contains('mb-4')).toBe(true);
    expect(panel.querySelector('[data-slot="view-table"]')).not.toBeNull();
    // 全页只有表格面板这一层边框容器:不应再出现独立的搜索卡片
    expect(container.querySelectorAll('.view-table .search-panel.rounded-lg').length).toBe(0);
  });

  it('表单默认按容器适配列宽，范围控件跨列且显式 span 保持兼容', () => {
    act(() => store.getState().setView('form1', {
      ...store.getState().getView('form1'),
      items: [
        { field: 'price', title: '价格' },
        { field: 'period', title: '时间范围', ctrl: { type: Ctrl.TimeRange } },
        { field: 'stock', title: '库存', span: 8 },
      ],
    }));
    expect(container.querySelector('.view-form-container')?.className).toContain('@container/form');
    const fields = container.querySelectorAll<HTMLElement>('.view-form-row > div');
    expect(fields[0].className).toContain('@min-[56rem]/form:col-span-6');
    expect(fields[0].style.gridColumn).toBe('');
    expect(fields[1].className).toContain('@min-[32rem]/form:col-span-12');
    expect(fields[1].className).not.toContain('col-span-6');
    expect(fields[2].style.gridColumn).toBe('span 8 / span 8');
    expect(container.querySelector('.form-item-label')?.className).toContain('font-medium');
    // 默认标签在左：标签列定宽 88px 且右对齐（贴近自己的控件，而非左侧相邻控件）
    const label = container.querySelector<HTMLElement>('.form-item-label')!;
    expect(label.style.width).toBe('88px');
    expect(label.className).toContain('text-right');
    expect(container.querySelector('.form-item-container')?.className).toContain(
      '@min-[17rem]/form-item:flex-row',
    );
  });

  it('表单项可覆盖标签列宽与布局，纵向排布时不再固定标签列宽', () => {
    act(() => store.getState().setView('form1', {
      ...store.getState().getView('form1'),
      labelWidth: 120,
      labelAlign: 'left',
      items: [
        { field: 'price', title: '价格' },
        { field: 'name', title: '产品名称', labelWidth: 160 },
        { field: 'brand', title: '品牌', labelLayout: 'vertical' },
      ],
    }));
    const labels = container.querySelectorAll<HTMLElement>('.form-item-label');
    expect(labels[0].style.width).toBe('120px');
    expect(labels[0].className).toContain('text-left');
    expect(labels[1].style.width).toBe('160px');
    // 纵向布局：标签不设固定列宽、与控件共享左边界，也不触发横向排布的容器查询
    expect(labels[2].style.width).toBe('');
    expect(labels[2].className).toContain('text-left');
    const rows = container.querySelectorAll<HTMLElement>('.form-item-container');
    expect(rows[0].className).toContain('@min-[17rem]/form-item:flex-row');
    expect(rows[2].className).not.toContain('@min-[17rem]/form-item:flex-row');
  });

  it('工具栏与表单项之间只有间距，没有分割线', () => {
    act(() => store.getState().setView('form1', {
      ...store.getState().getView('form1'),
      bordered: false,
      toolList: [{ type: Ctrl.Button, text: '主操作' }],
    }));
    const toolbar = container.querySelector<HTMLElement>('.view-form-toolbar')!;
    expect(toolbar.classList.contains('border-b')).toBe(false);
    expect(toolbar.classList.contains('pb-5')).toBe(false);
    expect(toolbar.classList.contains('mb-4')).toBe(true);
    // 默认形态:面板由统一表面色区分,不带边框;内边距与表格面板共用同一套数值
    const panel = container.querySelector('.view-form-container')!;
    expect(panel.classList.contains('bg-surface')).toBe(true);
    expect(panel.classList.contains('rounded-lg')).toBe(true);
    expect(panel.classList.contains('p-4')).toBe(true);
    expect(panel.classList.contains('border')).toBe(false);
  });

  it('表单与表格面板共用同一组外观类名,保证页面内区块视觉一致', () => {
    const formPanel = container.querySelector('.view-form-container')!;
    const tablePanel = container.querySelector('.view-table')!;
    ['rounded-lg', 'bg-surface', 'p-4'].forEach((token) => {
      expect(formPanel.classList.contains(token)).toBe(true);
      expect(tablePanel.classList.contains(token)).toBe(true);
    });
  });

  it('显式开启 bordered 时在统一面板上叠加边框', () => {
    act(() => store.getState().setView('form1', {
      ...store.getState().getView('form1'),
      bordered: true,
    }));
    const panel = container.querySelector('.view-form-container')!;
    expect(panel.classList.contains('border')).toBe(true);
    // 边框只是叠加,统一面板的底色与内边距保持不变
    expect(panel.classList.contains('bg-surface')).toBe(true);
    expect(panel.classList.contains('p-4')).toBe(true);
  });

  it('页签切换只显示活动面板，已访问内容保持挂载', () => {
    act(() => {
      store.getState().setView('tabs', {
        id: 'tabs', type: ViewType.LayoutTab,
        items: [
          { key: 'table', label: '表格', viewId: 'table1' },
          { key: 'form', label: '表单', viewId: 'form1' },
        ],
      });
      root.render(<StoreContext value={store}><ViewTab viewId="tabs" /></StoreContext>);
    });
    const tabs = container.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    const panels = container.querySelectorAll<HTMLElement>('[role="tabpanel"]');
    const tableNode = panels[0].querySelector('.view-table');
    expect(tableNode).not.toBeNull();
    expect(panels[0].hidden).toBe(false);
    expect(panels[1].hidden).toBe(true);
    act(() => { tabs[1].dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })); });
    expect(tabs[1].getAttribute('aria-selected')).toBe('true');
    expect(panels[0].hidden).toBe(true);
    expect(panels[1].hidden).toBe(false);
    expect(panels[0].querySelector('.view-table')).toBe(tableNode);
    const formNode = panels[1].querySelector('.view-form-container');
    expect(formNode).not.toBeNull();
    act(() => { tabs[0].dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })); });
    expect(panels[0].hidden).toBe(false);
    expect(panels[1].hidden).toBe(true);
    expect(panels[1].querySelector('.view-form-container')).toBe(formNode);
  });

  it('schema 按钮透传视觉变体且不改变原点击回调', () => {
    const onClick = vi.fn();
    act(() => store.getState().setView('form1', {
      ...store.getState().getView('form1'),
      toolList: [
        { type: Ctrl.Button, text: '次要操作', variant: 'outline', onClick },
        { type: Ctrl.Button, text: '主操作' },
      ],
    }));
    const buttons = container.querySelectorAll<HTMLButtonElement>('.view-form-toolbar button');
    expect(buttons[0].classList.contains('border')).toBe(true);
    expect(buttons[0].classList.contains('bg-primary')).toBe(false);
    expect(buttons[1].classList.contains('bg-primary')).toBe(true);
    act(() => buttons[0].click());
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('统计行按配置统计指定列，并在字段编辑后重算而不带动表格结构层', () => {
    act(() => store.getState().setView('table1', {
      ...store.getState().getView('table1'),
      summaryItems: [
        { field: 'price', type: SummaryType.Sum },
        { field: 'stock', type: SummaryType.Avg, formatter: (value) => `均${value}` },
        { field: 'price', summary: (_values, rows) => `${rows.length}行` },
      ],
    }));
    const summaryRow = () => container.querySelector('tfoot tr')!;
    const cells = () => [...summaryRow().querySelectorAll('td')].map((td) => td.textContent);
    // 首列承载统计行说明,统计值落在各自列
    expect(cells()[0]).toContain('合计');
    // price 配了两项统计:内置求和 100+100=200,自定义行数 2 行,同格并列展示
    expect(cells()[0]).toContain('200');
    expect(cells()[0]).toContain('2行');
    // stock 为 5 与 6 的平均值,经 formatter 包装
    expect(cells()[1]).toContain('均5.5');

    const structuresBeforeEdit = tableRenderProbes.structure;
    const shellsBeforeEdit = tableRenderProbes.cellShell;
    act(() => store.getState().setData(['table', 0, 'price'], 400));
    // 统计值随数据写入重算:400+100=500
    expect(cells()[0]).toContain('500');
    // 但统计行是独立订阅的兄弟组件,不得让表格结构层/单元格外壳重跑
    expect(tableRenderProbes.structure).toBe(structuresBeforeEdit);
    expect(tableRenderProbes.cellShell).toBe(shellsBeforeEdit);
  });

  it('未配置统计列时不渲染统计行', () => {
    expect(container.querySelector('tfoot')).toBeNull();
  });

  it('分页条按响应元信息渲染，翻页写入 criteria 并重新请求', async () => {
    vi.spyOn(NetUtils, 'get').mockResolvedValue({ code: 200, data: rows() } as any);
    act(() => store.getState().setView('table1', {
      ...store.getState().getView('table1'),
      pagination: true,
    }));
    // 未拿到 @pagination 时不渲染分页条（后端不支持分页时这份配置是无害的）
    expect(container.querySelector('[data-slot="pagination"]')).toBeNull();

    act(() => store.setState({
      reqMeta: {
        table: { status: 'success', responseParams: { current: 1, pageSize: 10, total: 35 } },
      },
    } as never));

    const nav = container.querySelector('[data-slot="pagination"]')!;
    expect(nav).not.toBeNull();
    // 35 条 / 每页 10 条 → 4 页
    expect(nav.textContent).toContain('共 35 条');
    expect(nav.textContent).toContain('4 页');
    // 第 1 页时上一页不可用
    expect((nav.querySelector('button[aria-label="上一页"]') as HTMLButtonElement).disabled).toBe(true);
    expect((nav.querySelector('button[aria-current="page"]') as HTMLElement).textContent).toBe('1');

    await act(async () => {
      (nav.querySelector('button[aria-label="第 2 页"]') as HTMLButtonElement)
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    // 页码写入数据节点 criteria（由框架拼成请求参数）
    expect(store.getState().getData([PathKey.Req, 'table', 'criteria', 'page'])).toBe(2);
    expect(NetUtils.get).toHaveBeenCalled();

    // 请求进行中禁用交互，避免连点造成竞态
    act(() => store.setState({
      reqMeta: {
        table: { status: 'pending', responseParams: { current: 1, pageSize: 10, total: 35 } },
      },
    } as never));
    expect((container.querySelector('button[aria-label="第 3 页"]') as HTMLButtonElement).disabled).toBe(true);
  });

  it('分页字段名可配置，末页时下一页不可用', () => {
    act(() => store.getState().setView('table1', {
      ...store.getState().getView('table1'),
      pagination: { pageField: 'pageNo', pageSizeField: 'size', pageSizeOptions: [5, 10] },
    }));
    act(() => store.setState({
      reqMeta: {
        table: { status: 'success', responseParams: { current: 4, pageSize: 10, total: 35 } },
      },
    } as never));
    const nav = container.querySelector('[data-slot="pagination"]')!;
    expect((nav.querySelector('button[aria-label="下一页"]') as HTMLButtonElement).disabled).toBe(true);
    act(() => {
      (nav.querySelector('button[aria-label="第 2 页"]') as HTMLButtonElement)
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    // 使用配置里的自定义字段名
    expect(store.getState().getData([PathKey.Req, 'table', 'criteria', 'pageNo'])).toBe(2);
    expect(store.getState().getData([PathKey.Req, 'table', 'criteria', 'page'])).toBeUndefined();
  });

  it('统计结果抹掉浮点噪声,不把 IEEE754 误差展示给用户', () => {
    act(() => store.getState().setView('table1', {
      ...store.getState().getView('table1'),
      summaryItems: [
        // 自定义 formatter 直接拿到聚合值，因此噪声必须在聚合处就抹掉
        { field: 'price', type: SummaryType.Sum, formatter: (value) => `¥${value}` },
      ],
    }));
    act(() => {
      store.getState().setData(['table', 0, 'price'], '0.1');
      store.getState().setData(['table', 1, 'price'], '0.2');
    });
    // price 是表格第一列
    const cell = container.querySelector('tfoot td:first-child')!;
    // 0.1 + 0.2 的浮点结果是 0.30000000000000004
    expect(cell.textContent).toContain('¥0.3');
    expect(cell.textContent).not.toContain('0.300');
  });

  it.each([false, true])('输入后仅目标字段更新，表格结构与单元格外壳不执行（StrictMode=%s）', (strict) => {
    if (strict) {
      renderPage(true);
      act(() => vi.advanceTimersByTime(100));
      resetTableRenderProbes();
      metrics.structures = 0;
      metrics.fields.clear();
    }
    const shellsBeforeEdit = tableRenderProbes.cellShell;
    typeInto(editInput(), '999');
    expect(editInput().value).toBe('999');
    act(() => vi.advanceTimersByTime(299));
    expect(tableText()).not.toContain('999');
    act(() => vi.advanceTimersByTime(1));
    expect(tableText()).toContain('999');
    expect(tableRenderProbes.structure).toBe(0);
    expect(metrics.structures).toBe(0);
    // 输入与提交都不得带动真实单元格外壳执行
    expect(tableRenderProbes.cellShell).toBe(shellsBeforeEdit);
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
    expect(tableRenderProbes.structure).toBe(0);
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

  it('同值写入不触发表格结构、结构订阅或字段控件', () => {
    act(() => store.getState().setData(['@Row:table1:a', 'price'], '100'));
    expect(tableRenderProbes.structure).toBe(0);
    expect(metrics.structures).toBe(0);
    expect(tableRenderProbes.cellShell).toBe(0);
    expect(metrics.fields.size).toBe(0);
  });

  it('列配置替换后使用新字段，不被旧内容缓存阻断', () => {
    act(() => store.getState().setView('table1', {
      ...store.getState().getView('table1'),
      items: [{ field: 'stock', title: '当前库存' }],
    }));
    expect(tableRenderProbes.structure).toBeGreaterThan(0);
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

  it('同键整批替换不触发结构层，字段仍显示最新值', () => {
    act(() => store.getState().setData('table', rows().map((row) => ({ ...row, price: '321' }))));
    expect(tableRenderProbes.structure).toBe(0);
    expect(tableText()).toContain('321');
    expect(fieldCount('a', 'stock')).toBe(0);
    expect(fieldCount('b', 'stock')).toBe(0);
  });

  it('增删重排触发结构更新，单元格仍按身份读取', () => {
    act(() => store.getState().setDataByFn('table', (data) => {
      data.reverse();
      data.push({ [KeyAttr]: 'c', price: '333', stock: '8' });
    }));
    expect(tableRenderProbes.structure).toBeGreaterThan(0);
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
