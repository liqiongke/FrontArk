// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KeyAttr } from '@/interface';
import StoreContext from '@/stores/store/storeContext';
import createBaseStore from '@/stores/store/storeBase';
import { ParamKey, PathKey } from '@/stores/store/interface';
import NetUtils from '@/utils/netUtils';
import HandlerBase from '@/handler/handlerBase';
import { ViewType } from '../interface';
import ViewForm from '../form/viewForm';
import ViewTab from '../tab/viewTab';
import { Ctrl } from '@/comp/control/interface';
import ViewTable from './viewTable';
import { RenderMode, SummaryType } from './interface';
import { resetTableRenderProbes, tableRenderProbes } from './utils/tableTestProbes';
import TableUtils from './utils/tableUtils';
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
  // 列设置是浮层：触发器在容器内，内容经 Portal 挂到 body，需分别查询
  const openColumnSettings = async () => {
    const trigger = container.querySelector<HTMLButtonElement>('[aria-label="列设置"]');
    expect(trigger).not.toBeNull();
    await act(async () => {
      trigger!.click();
    });
    expect(document.querySelector('[data-slot="column-settings-list"]')).not.toBeNull();
  };

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

  it('表格为固定列宽：fixed 布局、每列有明确宽度、表头带拖拽手柄', () => {
    const table = container.querySelector('[data-slot="view-table"]') as HTMLTableElement;
    // fixed 布局 + 明确列宽：内容再长也不会改变列宽
    expect(table.style.tableLayout).toBe('fixed');
    const cols = table.querySelectorAll<HTMLElement>('colgroup col');
    expect(cols.length).toBe(2);
    cols.forEach((col) => expect(col.style.width).not.toBe(''));
    // 表头每列都有列宽拖拽手柄（含最后一列，用于把整表拉宽）
    const resizers = table.querySelectorAll('[data-column-resizer]');
    expect(resizers.length).toBe(2);
    expect(resizers[0].getAttribute('aria-orientation')).toBe('vertical');
    expect(resizers[0].getAttribute('aria-label')).toContain('价格');
  });

  it('列宽拖拽手柄带常驻短竖线标识，悬停时伸展为整条竖线', () => {
    const table = container.querySelector('[data-slot="view-table"]')!;
    const resizer = table.querySelector('[data-column-resizer]')!;
    // 静止态短竖线：常驻可见（不依赖 hover），否则用户无从知道列宽可拖
    const rest = resizer.querySelector('[data-column-resizer-indicator="rest"]')!;
    expect(rest).not.toBeNull();
    // 分隔线竖向：与列边界同向，h-* 控制长度、w-px 保证是线而不是块
    expect(rest.className).toContain('h-4');
    expect(rest.className).toContain('w-px');
    expect(rest.className).not.toContain('h-px');
    // 颜色取自主题的统一细线参数（--divider），组件内不写死透明度
    expect(rest.className).toContain('bg-divider');
    expect(rest.className).not.toContain('bg-foreground/');
    // 悬停/拖动态竖线：默认透明，hover 手柄时显现
    const active = resizer.querySelector('[data-column-resizer-indicator="active"]')!;
    expect(active).not.toBeNull();
    expect(active.className).toContain('opacity-0');
    expect(active.className).toContain('group-hover/resizer:opacity-100');
    // 两条标识线随每个手柄一起渲染
    expect(table.querySelectorAll('[data-column-resizer-indicator="rest"]').length).toBe(2);
  });

  it('数字列右对齐并用等宽数字对齐小数点，文本列左对齐', () => {
    act(() => store.getState().setView('table1', {
      ...store.getState().getView('table1'),
      items: [
        { field: 'price', title: '价格', valueType: 'number' },
        { field: 'stock', title: '库存' },
      ],
    }));
    const cells = container.querySelectorAll<HTMLElement>('.ctrl-text');
    expect(cells.length).toBeGreaterThan(1);
    // 数字列：右对齐 + 等宽数字（各位数字等宽后小数点自然对齐）
    expect(cells[0].style.textAlign).toBe('right');
    expect(cells[0].className).toContain('tabular-nums');
    // 文本列：左对齐且不套用等宽数字
    expect(cells[1].style.textAlign).toBe('left');
    expect(cells[1].className).not.toContain('tabular-nums');
  });

  it('表头对齐跟随本列内容：数字列标题右对齐，文本列标题左对齐', () => {
    act(() => store.getState().setView('table1', {
      ...store.getState().getView('table1'),
      items: [
        { field: 'price', title: '价格', valueType: 'number' },
        { field: 'stock', title: '库存' },
        { field: 'name', title: '名称', ctrl: { align: 'center' } },
      ],
      summaryItems: [{ field: 'price', type: SummaryType.Sum }],
    }));
    const heads = [...container.querySelectorAll<HTMLElement>('thead th')];
    expect(heads.map((th) => th.textContent)).toEqual(['价格', '库存', '名称']);
    // 标题与列内内容同侧
    expect(heads[0].classList.contains('text-right')).toBe(true);
    expect(heads[1].classList.contains('text-left')).toBe(true);
    // 列上显式声明对齐时，表头同样跟随（含 center）
    expect(heads[2].classList.contains('text-center')).toBe(true);
    // 表头对齐取自列定义的同一份 align
    const cells = container.querySelectorAll<HTMLElement>('tbody .ctrl-text');
    expect(cells[0].style.textAlign).toBe('right');
    expect(cells[1].style.textAlign).toBe('left');
    expect(cells[2].style.textAlign).toBe('center');
    // 统计行沿用同一对齐，数字列仍是右对齐
    const foot = container.querySelectorAll<HTMLElement>('tfoot td');
    expect(foot[0].classList.contains('text-right')).toBe(true);
  });

  it('列对齐规则收敛在一处：显式声明优先于值类型推断', () => {
    // 显式声明覆盖数字列的右对齐推断
    expect(TableUtils.resolveAlign({ field: 'a', title: 'A', valueType: 'number', ctrl: { align: 'left' } })).toBe('left');
    // 未声明时按值类型推断
    expect(TableUtils.resolveAlign({ field: 'b', title: 'B', valueType: 'number' })).toBe('right');
    expect(TableUtils.resolveAlign({ field: 'c', title: 'C' })).toBe('left');
    // 列定义上带出 align，供表头与内容共用
    const columns = TableUtils.createColumns('v1', [
      { field: 'a', title: 'A', valueType: 'number' },
      { field: 'b', title: 'B' },
    ]);
    expect(columns.map((col) => col.align)).toEqual(['right', 'left']);
  });

  it('表格工具挂在表格左下角，与分页条同一行且分居两端', () => {
    act(() => store.getState().setView('table1', {
      ...store.getState().getView('table1'),
      searchItems: [{ field: 'name', title: '名称' }],
      pagination: true,
    }));
    const tools = container.querySelector('.view-table-tools')!;
    expect(tools).not.toBeNull();
    expect(tools.querySelector('[aria-label="列设置"]')).not.toBeNull();
    expect(tools.querySelector('[aria-label="全屏显示"]')).not.toBeNull();
    expect(tools.querySelector('[aria-label="下载数据"]')).not.toBeNull();

    // 工具所在行：工具是行内第一个元素（靠左），行用 justify-between 把后续内容（分页条）推到右端
    const row = tools.parentElement!.parentElement!;
    expect(row.className).toContain('justify-between');
    expect(row.firstElementChild).toBe(tools.parentElement);
    // 行的位置在表格之后（表格左下角）
    const table = container.querySelector('[data-slot="view-table"]')!;
    expect(table.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // 已从搜索条上移走：搜索条内不再挂表格工具
    expect(container.querySelector('.search-bar')!.querySelector('.view-table-tools')).toBeNull();

    act(() => store.getState().setView('table1', {
      ...store.getState().getView('table1'),
      tools: false,
    }));
    expect(container.querySelector('.view-table-tools')).toBeNull();
  });

  it('搜索框、条件 Tag、高级筛选三段同处一行，且不再有独立的重置按钮', () => {
    act(() => store.getState().setView('table1', {
      ...store.getState().getView('table1'),
      searchItems: [{ field: 'name', title: '名称' }],
    }));
    // 造一条已生效条件，中间段的 Tag 区才会渲染
    act(() => store.getState().setData([PathKey.Req, 'table', 'criteria', 'name'], 'x'));

    const bar = container.querySelector<HTMLElement>('.search-bar')!;
    // 三段是同一行的直接子元素：左搜索框 / 中提示+Tag / 右高级筛选
    const parts = [...bar.children];
    expect(parts.length).toBe(3);
    expect(parts[0].classList.contains('search-box')).toBe(true);
    expect(parts[1].querySelector('[aria-live="polite"]')).not.toBeNull();
    expect(parts[1].querySelector('.search-tag-bar')).not.toBeNull();
    expect(parts[2].querySelector('[aria-label="高级筛选"]')).not.toBeNull();
    // 表格工具已移到底部，不再占搜索条右侧
    expect(parts[2].querySelector('.view-table-tools')).toBeNull();
    // 同一行靠 flex 排布，窄屏才换行
    expect(bar.className).toContain('flex-wrap');
    expect(bar.className).toContain('items-center');

    // 清空条件收敛为右侧工具区的重置图标，并停在高级筛选左侧
    expect(bar.querySelector('[aria-label="重置"]')).toBeNull();
    const resetBtn = parts[2].querySelector<HTMLElement>('[aria-label="清空条件"]')!;
    expect(resetBtn).not.toBeNull();
    expect(resetBtn.textContent).toBe('');
    expect(resetBtn.querySelector('svg')).not.toBeNull();
    expect(parts[1].textContent).not.toContain('清空条件');
    expect(
      resetBtn.compareDocumentPosition(parts[2].querySelector('[aria-label="高级筛选"]')!)
        & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    // 搜索框内只剩「类型图标 + 输入 + 搜索图标」
    const box = parts[0];
    expect(box.querySelector('[aria-label="高级筛选"]')).toBeNull();
    // 结构精简：不再套「定位容器 + 限宽」两层，搜索框是搜索条的直接子元素，内部控件同高
    expect(box.parentElement).toBe(bar);
    expect(box.querySelector('[aria-label="选择搜索类型"]')!.className).toContain('h-8');
    expect(box.querySelector('input')!.className).toContain('h-8');
  });

  it('搜索框内不出现实心主色按钮，搜索只留图标且无内边距', () => {
    act(() => store.getState().setView('table1', {
      ...store.getState().getView('table1'),
      searchItems: [{ field: 'name', title: '名称' }],
    }));
    const box = container.querySelector<HTMLElement>('.search-box')!;
    // 类型入口是定宽槽：未识别时显示弱化的「选择类型」占位，不显示宽文案「选择搜索类型」
    const typeTrigger = box.querySelector<HTMLElement>('[aria-label="选择搜索类型"]')!;
    expect(typeTrigger.textContent).toBe('选择类型');
    expect(typeTrigger.querySelector('svg')).not.toBeNull();
    expect(typeTrigger.className).toContain('w-[6.5rem]');

    const submitBtn = box.querySelector<HTMLButtonElement>('[aria-label="搜索"]')!;
    // 只留图标：不显示文字
    expect(submitBtn.textContent).toBe('');
    expect(submitBtn.querySelector('svg')).not.toBeNull();
    // 不用实心主色（那是页面行动召唤按钮的语义），也没有会把按钮挤出边框的内边距
    const variantClass = submitBtn.className;
    expect(variantClass).not.toContain('bg-primary');
    expect(variantClass).toContain('h-full');
    expect(variantClass).toContain('px-0');
    expect(variantClass).toContain('rounded-l-none');
    // 搜索框靠右端不再留内边距，按钮与边框贴合
    expect(box.className).not.toContain('pr-0.5');
  });

  it('类型入口定宽：类型名出现/消失不会让输入内容跳位，且用弱化色与内容区分', () => {
    act(() => store.getState().setView('table1', {
      ...store.getState().getView('table1'),
      searchItems: [{ field: 'name', title: '产品名称', keywords: ['名称'] }],
    }));
    const trigger = () =>
      container.querySelector<HTMLElement>('.search-box [aria-label="选择搜索类型"]')!;
    const input = container.querySelector<HTMLInputElement>('.search-box input')!;

    // 定宽槽：宽度由固定尺寸决定，不随文字长短变化，输入区起点因此不动
    expect(trigger().className).toContain('w-[6.5rem]');
    expect(trigger().className).not.toContain('w-auto');
    // 未识别时是弱化色的占位，而不是空白或宽文案
    expect(trigger().textContent).toBe('选择类型');
    expect(trigger().querySelector('span')!.className).toContain('text-primary');

    // 输入命中关键词后类型被推断出来：字段名出现在同一个定宽槽里
    typeInto(input, '名称');
    const label = trigger().querySelector('span')!;
    expect(label.textContent).toBe('产品名称');
    // 字段名用弱化色，与输入内容的前景色区分开，不会被读成已输入的文字
    // （按 class 逐项比对：输入框基础类里有 placeholder:text-muted-foreground，不能按子串判断）
    expect(label.className.split(/\s+/)).toContain('text-muted-foreground');
    expect(input.className.split(/\s+/)).not.toContain('text-muted-foreground');
    // 过长时截断，不挤压输入区
    expect(label.className).toContain('truncate');
    // 仍是同一个下拉入口，可点开改类型
    expect(trigger().querySelector('svg')).not.toBeNull();

    // 清空输入后回到占位文案，槽宽不变
    typeInto(input, '');
    expect(trigger().textContent).toBe('选择类型');
    expect(trigger().className).toContain('w-[6.5rem]');
  });

  it('无搜索项时工具条仍在，不随搜索面板一起消失', () => {
    act(() => store.getState().setView('table1', {
      ...store.getState().getView('table1'),
      searchItems: [],
    }));
    // 搜索面板整体不渲染
    expect(container.querySelector('.search-panel')).toBeNull();
    // 但全屏/下载/列设置属于表格自身，必须保留
    const tools = container.querySelector('.view-table-tools')!;
    expect(tools).not.toBeNull();
    expect(tools.querySelector('[aria-label="列设置"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="view-table"]')).not.toBeNull();
  });

  it('列设置可取消勾选隐藏列，表头/数据/统计行/导出同步', async () => {
    act(() => store.getState().setView('table1', {
      ...store.getState().getView('table1'),
      items: [
        { field: 'price', title: '价格', valueType: 'number' },
        { field: 'stock', title: '库存' },
      ],
      summaryItems: [{ field: 'price', type: SummaryType.Sum }],
    }));
    const heads = () => [...container.querySelectorAll('thead th')].map((th) => th.textContent);
    expect(heads()).toEqual(['价格', '库存']);

    await openColumnSettings();
    const checkbox = document.querySelector<HTMLButtonElement>('[aria-label="展示「价格」列"]')!;
    expect(checkbox).not.toBeNull();
    await act(async () => {
      checkbox.click();
    });

    // 表头、colgroup、数据行、统计行四处同步收起该列
    expect(heads()).toEqual(['库存']);
    expect(container.querySelectorAll('colgroup col').length).toBe(1);
    expect(container.querySelectorAll('tbody tr:first-child td').length).toBe(1);
    expect(container.querySelectorAll('tfoot td').length).toBe(1);
  });

  it('列设置拖拽调整列顺序，表头与数据行同步换位', async () => {
    act(() => store.getState().setView('table1', {
      ...store.getState().getView('table1'),
      items: [
        { field: 'price', title: '价格' },
        { field: 'stock', title: '库存' },
        { field: 'name', title: '名称' },
      ],
    }));
    const heads = () => [...container.querySelectorAll('thead th')].map((th) => th.textContent);
    expect(heads()).toEqual(['价格', '库存', '名称']);

    await openColumnSettings();
    const items = document.querySelectorAll('[data-column-settings-item]');
    // 把「价格」拖到「名称」的位置
    act(() => {
      items[0].dispatchEvent(new Event('dragstart', { bubbles: true }));
      items[2].dispatchEvent(new Event('dragover', { bubbles: true }));
    });

    expect(heads()).toEqual(['库存', '名称', '价格']);
    // 数据行按同一顺序换位（首列现在是「库存」字段）
    const firstRowCells = container.querySelectorAll('tbody tr:first-child td');
    expect(firstRowCells.length).toBe(3);
  });

  it('仅剩最后一列可见时不允许取消勾选，重置可恢复配置顺序与全部展示', async () => {
    act(() => store.getState().setView('table1', {
      ...store.getState().getView('table1'),
      items: [
        { field: 'price', title: '价格' },
        { field: 'stock', title: '库存' },
      ],
    }));
    await openColumnSettings();
    const stock = () => document.querySelector<HTMLButtonElement>('[aria-label="展示「库存」列"]')!;
    await act(async () => {
      document.querySelector<HTMLButtonElement>('[aria-label="展示「价格」列"]')!.click();
    });
    // 只剩库存可见，其勾选框被禁用
    expect(stock().disabled).toBe(true);
    await act(async () => {
      stock().click();
    });
    expect([...container.querySelectorAll('thead th')].map((th) => th.textContent)).toEqual(['库存']);

    // 重置：重新勾选并回到配置顺序
    await act(async () => {
      document.querySelector<HTMLButtonElement>('[aria-label="恢复默认列设置"]')!.click();
    });
    expect([...container.querySelectorAll('thead th')].map((th) => th.textContent)).toEqual([
      '价格',
      '库存',
    ]);
  });

  it('搜索框输入首字符不会丢焦点：类型推断前后是同一个输入节点', async () => {
    act(() => store.getState().setView('table1', {
      ...store.getState().getView('table1'),
      searchItems: [{ field: 'name', title: '产品名称', keywords: ['名称'] }],
    }));
    const input = () => container.querySelector<HTMLInputElement>('.search-bar input')!;
    const before = input();
    expect(before).not.toBeNull();
    // 未识别到类型时的初始形态
    expect(before.getAttribute('aria-label')).toBe('搜索内容');
    before.focus();
    expect(document.activeElement).toBe(before);

    // 输入一个字符/一次输入：命中「名称」关键词，类型被推断出来
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setter.call(before, '名称');
      before.dispatchEvent(new Event('input', { bubbles: true }));
    });

    // 推断已生效（占位与标签切成该字段）
    expect(input().getAttribute('aria-label')).toBe('按产品名称搜索');
    // 且输入框没有被重建：旧节点仍在文档中并保持焦点
    expect(before.isConnected).toBe(true);
    expect(input()).toBe(before);
    expect(document.activeElement).toBe(before);
    expect(before.value).toBe('名称');
  });

  it('高级筛选面板就地展开，搜索面板与表格结构不被替换', async () => {
    act(() => store.getState().setView('table1', {
      ...store.getState().getView('table1'),
      searchItems: [{ field: 'name', title: '名称' }],
    }));
    const advanced = container.querySelector<HTMLButtonElement>('[aria-label="高级筛选"]')!;
    expect(advanced).not.toBeNull();
    await act(async () => {
      advanced.click();
    });
    // 条件以面板呈现
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    // 搜索面板保持原样：搜索条仍在，表格没有被重排
    expect(container.querySelector('.search-bar')).not.toBeNull();
    expect(container.querySelector('[data-slot="view-table"]')).not.toBeNull();
  });

  it('高级筛选是不带遮罩的就地面板，宽度贴合表格', async () => {
    act(() => store.getState().setView('table1', {
      ...store.getState().getView('table1'),
      searchItems: [{ field: 'name', title: '名称' }, { field: 'price', title: '价格' }],
    }));
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[aria-label="高级筛选"]')!.click();
    });
    const panel = container.querySelector<HTMLElement>('[data-slot="search-advanced-panel"]')!;
    expect(panel).not.toBeNull();
    // 就地渲染在搜索面板内，而不是 Portal 到 body 的模态层
    expect(panel.closest('.search-panel')).not.toBeNull();
    expect(document.querySelector('[data-slot="dialog-overlay"]')).toBeNull();
    // 用 inset-x-0 贴合搜索面板宽度（= 表格面板内容宽度），且不脱离文档流偏移
    expect(panel.className).toContain('inset-x-0');
    expect(panel.className).not.toContain('fixed');
  });

  it('高级筛选的条件与表单项共用同一套布局：一行四项', async () => {
    act(() => store.getState().setView('table1', {
      ...store.getState().getView('table1'),
      searchItems: [{ field: 'name', title: '名称' }, { field: 'price', title: '价格' }],
    }));
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[aria-label="高级筛选"]')!.click();
    });
    const grid = container.querySelector<HTMLElement>('.search-panel-form')!;
    // 与表单相同：24 列栅格
    expect(grid.style.gridTemplateColumns).toContain('repeat(24');
    const cells = [...grid.children].filter((el) => !el.className.includes('col-span-full'));
    expect(cells.length).toBe(2);
    // 与表单相同：宽屏 4 项一行（span 6）、标签在左且定宽
    cells.forEach((cell) => {
      expect(cell.className).toContain('@min-[56rem]/form:col-span-6');
      expect(cell.className).toContain('@container/form-item');
      expect(cell.querySelector('.form-item-label')).not.toBeNull();
    });
    // 栅格自身声明 @container/form 作为列数查询的基准：
    // 旧实现查的是 @container/search，而弹窗被 Portal 到 body、已不在该容器内，
    // 列数查询全部失效，才退化成一个条件独占一行
    expect(grid.className).toContain('@container/form');
    // 表单侧用的是同一份类名，样式不会各写一份而走偏
    const formCell = container.querySelector<HTMLElement>('.view-form-row > div')!;
    expect(formCell.className).toContain('@min-[56rem]/form:col-span-6');
    expect(formCell.className).toContain('@container/form-item');
  });

  it('高级筛选面板在点击外部或按 Esc 时关闭，再次点击触发按钮也可收起', async () => {
    act(() => store.getState().setView('table1', {
      ...store.getState().getView('table1'),
      searchItems: [{ field: 'name', title: '名称' }],
    }));
    const trigger = container.querySelector<HTMLButtonElement>('[aria-label="高级筛选"]')!;
    const opened = () => container.querySelector('[data-slot="search-advanced-panel"]') !== null;

    // 点触发按钮展开；按钮本身不算"外部点击"，面板不会被立刻关掉
    await act(async () => {
      trigger.click();
    });
    expect(opened()).toBe(true);

    // 点击面板外部（表格区域）关闭
    await act(async () => {
      container.querySelector<HTMLElement>('[data-slot="view-table"]')!.click();
    });
    expect(opened()).toBe(false);

    // 再次展开后按 Esc 关闭
    await act(async () => {
      trigger.click();
    });
    expect(opened()).toBe(true);
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(opened()).toBe(false);

    // 触发按钮可再次收起（开关语义）
    await act(async () => {
      trigger.click();
    });
    await act(async () => {
      trigger.click();
    });
    expect(opened()).toBe(false);
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
    // 当前页只是「定位标记」：中性灰底白字（selected），不用主色实心，
    // 避免与页面上的行动召唤按钮抢层级
    const currentPage = nav.querySelector<HTMLElement>('button[aria-current="page"]')!;
    expect(currentPage.textContent).toBe('1');
    expect(currentPage.className).toContain('bg-selected');
    expect(currentPage.className).not.toContain('bg-primary');
    // 其余页码保持描边样式
    const otherPage = nav.querySelector<HTMLElement>('button[aria-label="第 2 页"]')!;
    expect(otherPage.className).not.toContain('bg-selected');
    expect(otherPage.className).toContain('border');

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

  it('统计值按列内数据的精度输出，小数点与列内内容同列', () => {
    act(() => store.getState().setView('table1', {
      ...store.getState().getView('table1'),
      items: [
        { field: 'price', title: '价格', valueType: 'number' },
        { field: 'rating', title: '评分', valueType: 'number' },
        { field: 'stock', title: '库存', valueType: 'number' },
      ],
      summaryItems: [
        { field: 'price', type: SummaryType.Sum },
        { field: 'rating', type: SummaryType.Avg },
        { field: 'stock', type: SummaryType.Sum },
      ],
    }));
    act(() => {
      // 评分列统一一位小数，统计值也必须是一位，不能四舍五入成两位
      store.getState().setData(['table', 0, 'rating'], 4.6);
      store.getState().setData(['table', 1, 'rating'], 4.4);
    });
    const foot = [...container.querySelectorAll<HTMLElement>('tfoot td')].map((td) => td.textContent);
    // 两位小数列：保留两位
    expect(foot[0]).toContain('200');
    // 一位小数列：平均值 4.5 展示为一位小数，与列内 "4.6"/"4.4" 的小数点同列
    expect(foot[1]).toContain('4.5');
    expect(foot[1]).not.toContain('4.50');
    // 整数列：不带小数点（「合计」标签只在首列，库存列只有数值）
    expect(foot[2]).toBe('11');
    // 数字列统计格使用等宽数字，小数点才会因位数一致而对齐
    expect(container.querySelector('tfoot td')!.className).toContain('tabular-nums');
    // 统计值与数据行同字重：粗体等宽数字更宽，会让小数点偏移
    const footRow = container.querySelector('tfoot tr')!;
    expect(footRow.className).not.toContain('font-medium');
    const bodyWeight = getComputedStyle(container.querySelector('tbody .ctrl-text')!).fontWeight;
    const footWeight = getComputedStyle(container.querySelector('tfoot td')!).fontWeight;
    expect(footWeight).toBe(bodyWeight);
  });

  it('统计值精度可显式指定，覆盖列内数据推断', () => {
    act(() => store.getState().setView('table1', {
      ...store.getState().getView('table1'),
      items: [{ field: 'rating', title: '评分', valueType: 'number' }],
      summaryItems: [{ field: 'rating', type: SummaryType.Avg, precision: 3 }],
    }));
    act(() => store.getState().setData(['table', 0, 'rating'], 4.6));
    act(() => store.getState().setData(['table', 1, 'rating'], 4.4));
    // 列内是一位小数，显式 precision=3 后统计值保留三位
    expect(container.querySelector('tfoot td')!.textContent).toContain('4.500');
  });

  it('浮点尾数不会把小数位数算大，统计值位数仍按数据本身', () => {
    act(() => store.getState().setView('table1', {
      ...store.getState().getView('table1'),
      items: [{ field: 'price', title: '价格', valueType: 'number' }],
      summaryItems: [{ field: 'price', type: SummaryType.Sum }],
    }));
    act(() => {
      store.getState().setData(['table', 0, 'price'], 0.1);
      store.getState().setData(['table', 1, 'price'], 0.2);
    });
    // 0.1+0.2=0.30000000000000004，位数按 1 位算，展示 0.3
    expect(container.querySelector('tfoot td')!.textContent).toContain('0.3');
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

  it('「清空条件」承担重置职责：清掉条件、草稿与输入内容', async () => {
    vi.spyOn(NetUtils, 'get').mockResolvedValue({ code: 200, data: rows() } as any);
    act(() => store.getState().setView('table1', {
      ...store.getState().getView('table1'),
      searchItems: [{ field: 'name', title: '名称', keywords: ['名称'] }],
    }));
    const search = container.querySelector('.search-panel input') as HTMLInputElement;
    // 输入并回车：推断出「名称」后提交为条件
    typeInto(search, '名称');
    await act(async () => {
      search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(store.getState().getData([PathKey.Req, 'table', 'criteria', 'name'])).toBe('名称');

    // 重置图标只在有条件时出现，位置在搜索条右侧工具区
    const clear = () =>
      container.querySelector<HTMLButtonElement>('.search-bar [aria-label="清空条件"]')!;
    expect(clear()).not.toBeNull();
    expect(container.querySelector('.search-tag-bar [aria-label="清空条件"]')).toBeNull();
    // 制造草稿残留，验证清空会一并清掉（重置能力已从工具区移到 Tag 区）
    act(() => store.getState().setData([PathKey.Req, 'table', 'searchDraft', 'name'], 'drafting'));

    await act(async () => {
      clear().dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => vi.advanceTimersByTimeAsync(300));

    expect(store.getState().getData([PathKey.Req, 'table', 'criteria', 'name'])).toBeUndefined();
    expect(store.getState().getData([PathKey.Req, 'table', 'searchDraft'])).toEqual({});
    expect(search.value).toBe('');
    // 条件清空后图标随之消失
    expect(container.querySelector('.search-bar [aria-label="清空条件"]')).toBeNull();
  });

  it('同字段多值以逗号展示，点 Tag 回填后回车是替换而不是追加', async () => {
    vi.spyOn(NetUtils, 'get').mockResolvedValue({ code: 200, data: rows() } as any);
    act(() => store.getState().setView('table1', {
      ...store.getState().getView('table1'),
      searchItems: [{ field: 'price', title: '价格', keywords: ['价格'], valueKind: 'number' }],
    }));
    const search = container.querySelector('.search-panel input') as HTMLInputElement;
    const enter = async () => {
      await act(async () => {
        search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      });
      await act(async () => vi.advanceTimersByTimeAsync(300));
    };

    // 连续输入三个数字：同字段合并为多值
    for (const value of ['123', '234', '345']) {
      typeInto(search, value);
      await enter();
    }
    expect(store.getState().getData([PathKey.Req, 'table', 'criteria', 'price'])).toEqual([123, 234, 345]);
    const tag = () => container.querySelector<HTMLElement>('.search-tag-bar [data-slot="tag"]')!;
    expect(tag().textContent).toContain('123,234,345');

    // 点 Tag：整条条件（逗号并列）回填进输入框
    await act(async () => { tag().click(); });
    expect(search.value).toBe('123,234,345');
    expect(container.querySelector('.search-box [aria-label="清空搜索内容"]')).not.toBeNull();

    // 删掉一段再回车：替换这条条件，不追加、也不新增条件
    typeInto(search, '234,345');
    await enter();
    expect(store.getState().getData([PathKey.Req, 'table', 'criteria', 'price'])).toEqual([234, 345]);
    expect(container.querySelectorAll('.search-tag-bar [data-slot="tag"]').length).toBe(1);
    expect(tag().textContent).toContain('234,345');
  });

  it('回填单值文本时，值里的逗号是内容而不是多值分隔符', async () => {
    vi.spyOn(NetUtils, 'get').mockResolvedValue({ code: 200, data: rows() } as any);
    act(() => store.getState().setView('table1', {
      ...store.getState().getView('table1'),
      searchItems: [{ field: 'name', title: '名称', keywords: ['名称'] }],
    }));
    act(() => store.getState().setData([PathKey.Req, 'table', 'criteria', 'name'], 'A,B公司'));

    const tag = container.querySelector<HTMLElement>('.search-tag-bar [data-slot="tag"]')!;
    await act(async () => { tag.click(); });
    const search = container.querySelector('.search-panel input') as HTMLInputElement;
    expect(search.value).toBe('A,B公司');

    await act(async () => {
      search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    await act(async () => vi.advanceTimersByTimeAsync(300));
    // 原条件本来就是单值，回车后仍是同一个单值
    expect(store.getState().getData([PathKey.Req, 'table', 'criteria', 'name'])).toBe('A,B公司');
  });

  it('输入框内的叉号：有内容才出现，点击只清输入区、不动已生效条件', async () => {
    act(() => store.getState().setView('table1', {
      ...store.getState().getView('table1'),
      searchItems: [{ field: 'name', title: '名称', keywords: ['名称'] }],
    }));
    act(() => store.getState().setData([PathKey.Req, 'table', 'criteria', 'name'], 'x'));
    const search = container.querySelector('.search-panel input') as HTMLInputElement;
    const clearBtn = () => container.querySelector<HTMLButtonElement>('.search-box [aria-label="清空搜索内容"]');
    expect(clearBtn()).toBeNull();

    typeInto(search, 'abc');
    const button = clearBtn();
    expect(button).not.toBeNull();
    // 紧贴搜索图标左侧
    expect(
      button!.compareDocumentPosition(container.querySelector('.search-box [aria-label="搜索"]')!)
        & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    await act(async () => { button!.click(); });
    expect(search.value).toBe('');
    expect(clearBtn()).toBeNull();
    // 条件不在输入区里，不随清空消失
    expect(store.getState().getData([PathKey.Req, 'table', 'criteria', 'name'])).toBe('x');
    expect(container.querySelectorAll('.search-tag-bar [data-slot="tag"]').length).toBe(1);
  });

  it('开启勾选后出现勾选列，勾选态落在 @Select 且可被 handler 读取', async () => {
    act(() => store.getState().setView('table1', {
      ...store.getState().getView('table1'),
      selection: true,
    }));
    const rowBoxes = () =>
      [...container.querySelectorAll<HTMLElement>('tbody [data-slot="checkbox"]')];
    const headBox = () => container.querySelector<HTMLElement>('thead [data-slot="checkbox"]');
    const selectedKeys = () => store.getState().viewParams.table1[ParamKey.Select];

    // 勾选列：表头一个全选框 + 每行一个勾选框
    expect(headBox()).not.toBeNull();
    expect(rowBoxes().length).toBe(2);

    // 逐行勾选：多选模式按勾选顺序累积
    await act(async () => rowBoxes()[0].click());
    expect(selectedKeys()).toEqual(['a']);
    await act(async () => rowBoxes()[1].click());
    expect(selectedKeys()).toEqual(['a', 'b']);
    // 全选态：两行都选中后表头为 checked
    expect(headBox()!.getAttribute('data-state')).toBe('checked');
    // 再点一次取消本行
    await act(async () => rowBoxes()[1].click());
    expect(selectedKeys()).toEqual(['a']);
    // 部分选中 → 半选
    expect(headBox()!.getAttribute('data-state')).toBe('indeterminate');

    // 半选时点表头是「补齐」而不是清空
    await act(async () => headBox()!.click());
    expect(selectedKeys()).toEqual(['a', 'b']);
    // 全选时点表头清空
    await act(async () => headBox()!.click());
    expect(selectedKeys()).toEqual([]);

    // handler 侧按行键与整行记录读取同一份勾选态
    class TestHandler extends HandlerBase {}
    const handler = new TestHandler();
    handler.init(() => store.getState());
    await act(async () => rowBoxes()[0].click());
    expect(handler.getSelectedKeys('table1')).toEqual(['a']);
    expect(handler.getSelectedRows('table1')).toEqual([{ [KeyAttr]: 'a', price: '100', stock: '5' }]);
    handler.setSelectedKeys('table1', ['b']);
    expect(selectedKeys()).toEqual(['b']);
    expect(handler.getSelectedRows('table1')).toEqual([{ [KeyAttr]: 'b', price: '100', stock: '6' }]);
  });

  it('勾选变化回调：只在集合真的变化时触发，并带上整行记录', async () => {
    const onChange = vi.fn();
    act(() => store.getState().setView('table1', {
      ...store.getState().getView('table1'),
      selection: { onChange },
    }));
    const rowBoxes = () =>
      [...container.querySelectorAll<HTMLElement>('tbody [data-slot="checkbox"]')];
    // 挂载时的既有勾选（这里为空）不触发回调
    expect(onChange).not.toHaveBeenCalled();

    await act(async () => rowBoxes()[0].click());
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toEqual(['a']);
    expect(onChange.mock.calls[0][1]).toEqual([{ [KeyAttr]: 'a', price: '100', stock: '5' }]);

    // 取消勾选同样回调，且整行数组随之为空
    await act(async () => rowBoxes()[0].click());
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange.mock.calls[1][0]).toEqual([]);
    expect(onChange.mock.calls[1][1]).toEqual([]);
  });

  it('单选模式：选中新行顶掉上一行，且不渲染全选框', async () => {
    act(() => store.getState().setView('table1', {
      ...store.getState().getView('table1'),
      selection: { mode: 'single' },
    }));
    const rowBoxes = () =>
      [...container.querySelectorAll<HTMLElement>('tbody [data-slot="checkbox"]')];
    const selectedKeys = () => store.getState().viewParams.table1[ParamKey.Select];

    expect(container.querySelector('thead [data-slot="checkbox"]')).toBeNull();
    await act(async () => rowBoxes()[0].click());
    expect(selectedKeys()).toEqual(['a']);
    await act(async () => rowBoxes()[1].click());
    expect(selectedKeys()).toEqual(['b']);
    await act(async () => rowBoxes()[1].click());
    expect(selectedKeys()).toEqual([]);
  });

  it('勾选列不出现在列设置里（业务列过滤）', async () => {
    act(() => store.getState().setView('table1', {
      ...store.getState().getView('table1'),
      selection: true,
    }));
    await openColumnSettings();
    const items = [...document.querySelectorAll('[data-column-settings-item]')];
    expect(items.map((item) => item.getAttribute('data-column-settings-item'))).toEqual([
      'price_0',
      'stock_1',
    ]);
  });

  it('固定列：按左右分区排序，表头/数据格/统计格写同一份 sticky 偏移', () => {
    act(() => store.getState().setView('table1', {
      ...store.getState().getView('table1'),
      // 配置顺序故意打乱：右固定写在最前，左固定写在最后
      items: [
        { field: 'status', title: '状态', width: 90, fixed: 'right' },
        { field: 'stock', title: '库存', width: 120 },
        { field: 'price', title: '价格', width: 100, fixed: 'left' },
      ],
      summaryItems: [{ field: 'price', type: SummaryType.Sum }],
    }));
    const headers = [...container.querySelectorAll<HTMLElement>('thead th')];
    // 左固定在前、右固定在后，与配置顺序无关
    expect(headers.map((th) => th.textContent)).toEqual(['价格', '库存', '状态']);
    // jsdom 无布局引擎：偏移量退回声明宽度（左固定累加本侧宽度，右固定从尾部反着累加）
    expect(headers[0].className).toContain('sticky');
    expect(headers[0].style.left).toBe('0px');
    expect(headers[1].className).not.toContain('sticky');
    expect(headers[1].style.left).toBe('');
    expect(headers[2].style.right).toBe('0px');
    // 数据格与表头同源：同一列同一偏移
    const firstRowCells = [...container.querySelectorAll<HTMLElement>('tbody tr:first-child td')];
    expect(firstRowCells[0].style.left).toBe('0px');
    expect(firstRowCells[0].className).toContain('bg-inherit');
    expect(firstRowCells[2].style.right).toBe('0px');
    // 统计格同样固定
    const footCells = [...container.querySelectorAll<HTMLElement>('tfoot td')];
    expect(footCells[0].style.left).toBe('0px');
    expect(footCells[2].style.right).toBe('0px');
  });

  it('固定列偏移按同侧列宽累加（两列左固定）', () => {
    act(() => store.getState().setView('table1', {
      ...store.getState().getView('table1'),
      items: [
        { field: 'price', title: '价格', width: 100, fixed: 'left' },
        { field: 'stock', title: '库存', width: 60, fixed: 'left' },
      ],
    }));
    const headers = [...container.querySelectorAll<HTMLElement>('thead th')];
    expect(headers[0].style.left).toBe('0px');
    expect(headers[1].style.left).toBe('100px');
  });
});
