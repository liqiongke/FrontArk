import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KeyAttr } from '@/interface';
import NetUtils from '@/utils/netUtils';
import type DataBase from '@/data/dataBase';
import createBaseStore from '../storeBase';
import { initDataAndReq } from './storeData';
import { ParamKey, PathKey } from '../interface';

// 组装真实 store + 数据声明 + 视图声明(集成 storeBase/immer/依赖初始化/页面运行时)
const createPageStore = (dataDecl: Record<string, any>, views: Record<string, any> = {}) => {
  const store = createBaseStore();
  const [dataStore, reqStore] = initDataAndReq(dataDecl as unknown as DataBase);
  (store as any).setState({
    data: dataStore,
    req: reqStore,
    view: views,
  });
  return store;
};

describe('PageRuntime 防抖隔离(F01/F03)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('双 store 同名字径防抖互不影响(旧实现静态单例会互相取消)', () => {
    const storeA = createPageStore({});
    const storeB = createPageStore({});
    storeA.getState().setDataDebounce(['table', 0, 'name'], 'A');
    storeB.getState().setDataDebounce(['table', 0, 'name'], 'B');
    vi.advanceTimersByTime(300);
    expect(storeA.getState().getData(['table', 0, 'name'])).toBe('A');
    expect(storeB.getState().getData(['table', 0, 'name'])).toBe('B');
    storeA.getState().dispose();
    storeB.getState().dispose();
  });

  it('同一 store 同路径的连续防抖合并为最后一次', () => {
    const store = createPageStore({});
    store.getState().setDataDebounce(['form', 'name'], 'v1');
    store.getState().setDataDebounce(['form', 'name'], 'v2');
    vi.advanceTimersByTime(300);
    expect(store.getState().getData(['form', 'name'])).toBe('v2');
    store.getState().dispose();
  });

  it('dispose 立即提交未落盘的防抖输入(输入不丢失)', () => {
    const store = createPageStore({});
    store.getState().setDataDebounce(['form', 'name'], 'typed');
    store.getState().dispose();
    expect(store.getState().getData(['form', 'name'])).toBe('typed');
  });

  it('dispose 后不再调度新的防抖写入', () => {
    const store = createPageStore({});
    store.getState().dispose();
    store.getState().setDataDebounce(['form', 'name'], 'late');
    vi.advanceTimersByTime(1000);
    expect(store.getState().getData(['form', 'name'])).toBeUndefined();
  });
});

describe('防抖身份与提交边界', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  const setupRows = () => {
    const store = createPageStore({}, { table1: { id: 'table1', dataId: 'table' } });
    store.getState().setData('table', [
      { [KeyAttr]: 'a', price: 1, stock: 2 },
      { [KeyAttr]: 'b', price: 3, stock: 4 },
    ]);
    store.getState().setViewParamByKey('table1', ParamKey.Active, 'a');
    return store;
  };

  it('切换焦点并重排后仍提交原行，连续编辑按身份合并', () => {
    const store = setupRows();
    const s = store.getState();
    s.setDataDebounce(['@Active:table1', 'price'], 10);
    s.setViewParamByKey('table1', ParamKey.Active, 'b');
    s.setDataDebounce(['@Active:table1', 'price'], 20);
    s.setDataByFn('table', (rows) => rows.reverse());
    s.setDataDebounce(['@Row:table1:a', 'price'], 30);
    vi.advanceTimersByTime(299);
    expect(s.getData(['@Row:table1:a', 'price'])).toBe(1);
    vi.advanceTimersByTime(1);
    expect(s.getData(['@Row:table1:a', 'price'])).toBe(30);
    expect(s.getData(['@Row:table1:b', 'price'])).toBe(20);
  });

  it('目标行删除后丢弃任务，不覆盖占据原下标的行', () => {
    const store = setupRows();
    const s = store.getState();
    s.setDataDebounce(['@Active:table1', 'price'], 10);
    s.setDataByFn('table', (rows) => rows.splice(0, 1));
    vi.advanceTimersByTime(300);
    expect(s.getData('table')).toEqual([{ [KeyAttr]: 'b', price: 3, stock: 4 }]);
  });

  it('视图切换数据源不把已排队的写入转移到新数据源', () => {
    const store = setupRows();
    const s = store.getState();
    s.setData('other', [{ [KeyAttr]: 'a', price: 100 }]);
    s.setDataDebounce(['@Active:table1', 'price'], 10);
    s.setView('table1', { id: 'table1', dataId: 'other' });
    vi.advanceTimersByTime(300);
    expect(s.getData(['table', 0, 'price'])).toBe(10);
    expect(s.getData(['other', 0, 'price'])).toBe(100);
  });

  it('嵌套集合祖先重排后按各层身份提交', () => {
    const store = createPageStore({});
    const s = store.getState();
    s.setData('groups', [
      { [KeyAttr]: 'g1', rows: [{ [KeyAttr]: 'a', price: 1 }] },
      { [KeyAttr]: 'g2', rows: [{ [KeyAttr]: 'a', price: 2 }] },
    ]);
    s.setDataDebounce(['groups', 0, 'rows', 0, 'price'], 10);
    s.setDataByFn('groups', (groups) => groups.reverse());
    vi.advanceTimersByTime(300);
    expect(s.getData(['groups', 1, 'rows', 0, 'price'])).toBe(10);
    expect(s.getData(['groups', 0, 'rows', 0, 'price'])).toBe(2);
  });

  it('精确 flush 与 scope 不混淆，别名路径及重排行可匹配', () => {
    const store = setupRows();
    const s = store.getState();
    s.setDataDebounce(['@Active:table1', 'price'], 10);
    s.setDataDebounce(['@Active:table1', 'stock'], 20);
    s.setDataByFn('table', (rows) => rows.reverse());
    s.flushData(['@Row:table1:a']);
    expect(s.getData(['@Row:table1:a', 'price'])).toBe(1);
    s.flushData([PathKey.Data, 'table', 1, 'price']);
    expect(s.getData(['@Row:table1:a', 'price'])).toBe(10);
    expect(s.getData(['@Row:table1:a', 'stock'])).toBe(2);
    s.flushDataScope(['@Row:table1:a']);
    expect(s.getData(['@Row:table1:a', 'stock'])).toBe(20);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('取消区域按路径段匹配，不取消相似名称和其他字段', () => {
    const store = createPageStore({});
    const s = store.getState();
    s.setDataDebounce(['form', 'name'], 'drop');
    s.setDataDebounce(['form', 'nameExtra'], 'keep');
    s.setDataDebounce(['form2', 'name'], 'other');
    s.cancelDataScope(['form', 'name']);
    vi.advanceTimersByTime(300);
    expect(s.getData(['form', 'name'])).toBeUndefined();
    expect(s.getData(['form', 'nameExtra'])).toBe('keep');
    expect(s.getData(['form2', 'name'])).toBe('other');
  });

  it('搜索先提交该请求的条件，不提前提交其他编辑任务', async () => {
    const store = createPageStore({ table: { id: 'table', url: '/list' } }, {
      table1: { id: 'table1', dataId: 'table' },
    });
    const spy = vi.spyOn(NetUtils, 'get').mockResolvedValue({ code: 200, data: [] } as any);
    const s = store.getState();
    s.setDataDebounce([PathKey.Req, 'table', 'criteria', 'name'], 'latest');
    s.setDataDebounce(['other', 'name'], 'pending');
    await s.refreshByViewId('table1');
    expect(spy).toHaveBeenCalledWith('/list', { name: 'latest' }, expect.anything());
    expect(s.getData(['other', 'name'])).toBeUndefined();
    s.cancelData();
  });
});

describe('PageRuntime 请求生命周期(F04/F05/F06)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('请求成功时数据与 reqMeta 同事务写入,响应元信息不覆盖请求参数声明', async () => {
    const store = createPageStore(
      { table: { id: 'table', url: '/list', params: [{ field: 'fixed', value: 1 }] } },
      { table1: { id: 'table1', path: ['table'] } },
    );
    const getSpy = vi.spyOn(NetUtils, 'get').mockResolvedValue({
      code: 200,
      data: { '@list': [{ id: 1, name: 'n1' }], '@pagination': { total: 1 } },
    } as any);

    await store.getState().refreshByViewId('table1');

    const state = store.getState();
    expect(state.data.table).toHaveLength(1);
    expect(state.data.table[0][KeyAttr]).toBe('1');
    expect(state.reqMeta['table']!.status).toBe('success');
    expect(state.reqMeta['table']!.responseParams).toEqual({ total: 1 });
    // params 声明不被响应元信息覆盖(响应元信息写入 reqMeta.responseParams)
    expect(state.req['table'].params).toEqual([{ field: 'fixed', value: 1 }]);
    expect(getSpy).toHaveBeenCalledTimes(1);
  });

  it('业务 code 非 200 不写数据并记录错误状态', async () => {
    const store = createPageStore(
      { table: { id: 'table', url: '/list' } },
      { table1: { id: 'table1', path: ['table'] } },
    );
    vi.spyOn(NetUtils, 'get').mockResolvedValue({ code: 500, message: 'boom' } as any);

    const result = await store.getState().refreshByViewId('table1');

    expect(result).toBeUndefined();
    expect(store.getState().data.table).toBeUndefined();
    expect(store.getState().reqMeta['table']!.status).toBe('error');
    expect(store.getState().reqMeta['table']!.error).toContain('boom');
  });

  it('请求异常时 resolve undefined(不产生 unhandled rejection)并记录错误状态', async () => {
    const store = createPageStore(
      { table: { id: 'table', url: '/list' } },
      { table1: { id: 'table1', path: ['table'] } },
    );
    vi.spyOn(NetUtils, 'get').mockRejectedValue(new Error('network down'));

    const result = await store.getState().refreshByViewId('table1');

    expect(result).toBeUndefined();
    expect(store.getState().reqMeta['table']!.status).toBe('error');
    expect(store.getState().reqMeta['table']!.error).toContain('network down');
  });

  it('构建请求参数不修改 store 内的 criteria(冻结对象也不抛错)', async () => {
    const criteria = Object.freeze({ name: 'x' });
    const store = createPageStore(
      {
        table: {
          id: 'table',
          url: '/list',
          criteria,
          params: [{ field: 'name', value: 'declared' }],
        },
      },
      { table1: { id: 'table1', path: ['table'] } },
    );
    const getSpy = vi.spyOn(NetUtils, 'get').mockResolvedValue({ code: 200, data: [] } as any);

    await store.getState().refreshByViewId('table1');

    expect(store.getState().req['table'].criteria).toEqual({ name: 'x' });
    // 契约:criteria(用户输入) > param.value(显式声明)
    expect(getSpy).toHaveBeenCalledWith(
      '/list',
      expect.objectContaining({ name: 'x' }),
      expect.anything(),
    );
  });

  it('子请求等待父数据就绪并按声明取数(依赖链)', async () => {
    const store = createPageStore(
      {
        parent: { id: 'parent', url: '/parent' },
        child: { id: 'child', url: '/child', params: [{ field: 'pid', path: 'parent' }] },
      },
      { childView: { id: 'childView', path: ['child'] } },
    );
    const getSpy = vi.spyOn(NetUtils, 'get').mockImplementation(async (url: string) => {
      if (url.includes('/parent')) {
        return { code: 200, data: { id: 'p1' } } as any;
      }
      return { code: 200, data: 'child-ok' } as any;
    });

    await store.getState().refreshByViewId('childView');

    const state = store.getState();
    expect(state.data.parent).toEqual(expect.objectContaining({ id: 'p1' }));
    expect(state.data.child).toBe('child-ok');
    const childCall = getSpy.mock.calls.find((call) => String(call[0]).includes('/child'));
    expect(childCall).toBeDefined();
    // 子请求参数按 params.path 取到父数据
    expect(childCall![1]).toEqual(
      expect.objectContaining({ pid: expect.objectContaining({ id: 'p1' }) }),
    );
  });

  it('运行时发现循环依赖时安全退出,不发起请求', async () => {
    const store = createPageStore(
      {
        a: { id: 'a', url: '/a', dependsOn: ['b'] },
        b: { id: 'b', url: '/b', dependsOn: ['a'] },
      },
      { aView: { id: 'aView', path: ['a'] } },
    );
    const getSpy = vi.spyOn(NetUtils, 'get').mockResolvedValue({ code: 200, data: 'x' } as any);

    const result = await store.getState().refreshByViewId('aView');

    expect(result).toBeUndefined();
    expect(getSpy).not.toHaveBeenCalled();
  });

  it('无 url 节点以默认数据填充并继续触发子请求', async () => {
    const store = createPageStore(
      {
        base: { id: 'base', defaultData: { fixed: true } },
        leaf: { id: 'leaf', url: '/leaf', dependsOn: ['base'] },
      },
      { leafView: { id: 'leafView', path: ['leaf'] } },
    );
    const getSpy = vi
      .spyOn(NetUtils, 'get')
      .mockResolvedValue({ code: 200, data: 'leaf-ok' } as any);

    await store.getState().refreshByViewId('leafView');

    expect(store.getState().data.base).toEqual(expect.objectContaining({ fixed: true }));
    expect(store.getState().data.leaf).toBe('leaf-ok');
    expect(getSpy).toHaveBeenCalledTimes(1);
  });

  it('startRequests 只触发无父节点的请求', async () => {
    const store = createPageStore({
      root: { id: 'root', url: '/root' },
      child: { id: 'child', url: '/child', dependsOn: ['root'] },
    });
    const getSpy = vi.spyOn(NetUtils, 'get').mockResolvedValue({ code: 200, data: 'ok' } as any);

    store.getState().startRequests();
    // 等待异步请求链完成
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    const calledUrls = getSpy.mock.calls.map((call) => String(call[0]));
    expect(calledUrls).toContain('/root');
    expect(calledUrls).not.toContain('/child');
  });
});

describe('焦点行安全失败与重排回归(F02/F07)', () => {
  it('未选中焦点行时拒绝写入(不再落到数据根节点)', () => {
    const store = createPageStore({}, { table1: { id: 'table1', path: ['table'] } });
    store.getState().setData(['table'], [{ [KeyAttr]: 'a', price: 1 }]);

    store.getState().setData(['@Active:table1', 'price'], 9);

    // 根节点未被写入,原数据未被污染
    expect(store.getState().data.price).toBeUndefined();
    expect(store.getState().getData(['table', 0, 'price'])).toBe(1);
  });

  it('列表重排后 @Active 仍指向原焦点记录(动态解析,不读下标缓存)', () => {
    const store = createPageStore({}, { table1: { id: 'table1', path: ['table'] } });
    store.getState().setData(
      ['table'],
      [
        { [KeyAttr]: 'a', v: 1 },
        { [KeyAttr]: 'b', v: 2 },
      ],
    );
    store.getState().setViewParamByKey('table1', ParamKey.Active, 'a');
    // 模拟重排:逆序后 a 位于下标 1(旧实现读下标缓存会读到 b 的行)
    store.getState().setDataByFn(['table'], (rows: any[]) => {
      rows.reverse();
    });
    expect(store.getState().getData(['@Active:table1', 'v'])).toBe(1);
    expect(store.getState().getData(['table', 1, 'v'])).toBe(1);
  });
});
