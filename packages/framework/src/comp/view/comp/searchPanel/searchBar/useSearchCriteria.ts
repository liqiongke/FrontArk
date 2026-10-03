import { useMemoizedFn } from 'ahooks';
import { isArray, isEqual, isString, isUndefined } from 'lodash';
import { useContext } from 'react';

import { PathKey, type IStoreBase } from '@/stores/store/interface';
import StoreContext from '@/stores/store/storeContext';
import { useReq } from '@/stores/store/hooks/useReq';
import { type SearchPlaneItem } from '../interface';
import { normalizeSearchValue } from './infer/normalizeValue';
import { isEmptySearchValue, resolveValueKind } from './utils/searchItemUtils';

// 草稿区在请求节点下的字段名:未提交的值落在这里,避免打一字就污染 criteria
const DRAFT_KEY = 'searchDraft';
// 条件顺序:criteria 是平铺对象无序,单独记录字段顺序保证 Tag 稳定
const ORDER_KEY = 'searchOrder';

export interface CommitResult {
  ok: boolean;
  message?: string;
}

export interface SearchCriteriaApi {
  // 请求节点未就绪时为 undefined
  reqId?: string;
  // 已生效条件(唯一数据源,Tag 与高级面板都由它派生)
  criteria?: Record<string, any>;
  // 草稿区:当前输入区的值
  draft?: Record<string, any>;
  // 已生效条件的字段顺序
  order: string[];
  getDraft: (field: string) => any;
  setDraft: (field: string, value: any) => void;
  clearDraft: (field?: string) => void;
  // 提交草稿值到 criteria 并刷新;override 用于文本形态传入受控的最新值;失败时返回原因,不落条件
  commit: (field: string, item: SearchPlaneItem, override?: any) => CommitResult;
  // 删除整条条件并刷新
  removeCondition: (field: string) => void;
  // 把已生效条件载入草稿区编辑
  loadToDraft: (field: string) => any;
  // 清空全部条件并刷新
  resetAll: () => void;
  // 重新请求
  search: () => void;
}

/**
 * 表格搜索条件读写:
 * - criteria 为唯一数据源,输入过程中的草稿隔离在 searchDraft
 * - 提交、删除、重置都会立即刷新,与旧搜索面板的行为保持一致
 */
export const useSearchCriteria = (viewId: string): SearchCriteriaApi => {
  const useStore = useContext(StoreContext);
  const reqId = useStore((state) => state.getReqNodeId(viewId));
  // 草稿与顺序是搜索面板的运行期附加信息,不属于请求声明(SysDataProps),按扩展键读取
  const readMeta = (state: IStoreBase, key: string) =>
    isString(reqId) ? (state.req[reqId] as Record<string, any> | undefined)?.[key] : undefined;
  const criteria = useStore((state) => (isString(reqId) ? state.req[reqId]?.criteria : undefined));
  const draft = useStore((state) => readMeta(state, DRAFT_KEY));
  const storedOrder = useStore((state) => readMeta(state, ORDER_KEY));
  const setData = useStore((state) => state.setData);
  const setDataByFn = useStore((state) => state.setDataByFn);
  const cancelDataScope = useStore((state) => state.cancelDataScope);
  const flushDataScope = useStore((state) => state.flushDataScope);
  const [, sendReq, resetReq] = useReq(viewId);

  const getDraft = useMemoizedFn((field: string) => draft?.[field]);

  const setDraft = useMemoizedFn((field: string, value: any) => {
    if (!isString(reqId)) {
      return;
    }
    setData([PathKey.Req, reqId, DRAFT_KEY, field], value);
  });

  const clearDraft = useMemoizedFn((field?: string) => {
    if (!isString(reqId)) {
      return;
    }
    if (isUndefined(field)) {
      cancelDataScope([PathKey.Req, reqId, DRAFT_KEY]);
      setData([PathKey.Req, reqId, DRAFT_KEY], {});
      return;
    }
    // 先取消待写任务再删除,避免同值草稿把已删除的字段再写回来
    cancelDataScope([PathKey.Req, reqId, DRAFT_KEY, field]);
    setDataByFn([PathKey.Req, reqId, DRAFT_KEY], (data: any) => {
      if (data) {
        delete data[field];
      }
    });
  });

  /** 记录条件顺序:已存在则去重后追加,首次创建时整体写入 */
  const appendOrder = useMemoizedFn((field: string) => {
    if (!isString(reqId)) {
      return;
    }
    if (!isArray(storedOrder)) {
      setData([PathKey.Req, reqId, ORDER_KEY], [field]);
      return;
    }
    setDataByFn([PathKey.Req, reqId, ORDER_KEY], (list: any) => {
      if (isArray(list) && !list.includes(field)) {
        list.push(field);
      }
    });
  });

  const commit = useMemoizedFn((field: string, item: SearchPlaneItem, override?: any): CommitResult => {
    if (!isString(reqId)) {
      return { ok: false, message: '数据节点未就绪' };
    }
    const kind = resolveValueKind(item);
    // 文本形态的值由搜索条受控持有(即时反馈优先),此时以 override 为准;
    // 其余形态来自 Ctrl 控件的防抖草稿,提交前先 flush 再从最新快照读取,避免取到旧值
    flushDataScope([PathKey.Req, reqId, DRAFT_KEY]);
    const latest = useStore.getState().req[reqId] as Record<string, any> | undefined;
    const raw = isUndefined(override) ? latest?.[DRAFT_KEY]?.[field] : override;
    if (isEmptySearchValue(kind, raw)) {
      return { ok: false, message: '请先填写搜索内容' };
    }
    const normalized = normalizeSearchValue(kind, raw, item);
    if (!normalized.ok) {
      return { ok: false, message: normalized.message };
    }
    setDataByFn([PathKey.Req, reqId, 'criteria'], (data: any) => {
      if (!data) {
        return;
      }
      const prev = data[field];
      // 同字段重复提交:合并为多值(默认 OR 语义),与旧值相同则不重复追加
      if (isUndefined(prev) || prev === '' || (isArray(prev) && prev.length === 0)) {
        data[field] = normalized.value;
        return;
      }
      const merged = (isArray(prev) ? prev : [prev]).filter((each) => !isEqual(each, normalized.value));
      data[field] = [...merged, normalized.value];
    });
    appendOrder(field);
    clearDraft(field);
    sendReq();
    return { ok: true };
  });

  const removeCondition = useMemoizedFn((field: string) => {
    if (!isString(reqId)) {
      return;
    }
    cancelDataScope([PathKey.Req, reqId, 'criteria', field]);
    setDataByFn([PathKey.Req, reqId, 'criteria'], (data: any) => {
      if (data) {
        delete data[field];
      }
    });
    if (isArray(storedOrder)) {
      setDataByFn([PathKey.Req, reqId, ORDER_KEY], (list: any) => {
        if (isArray(list)) {
          const index = list.indexOf(field);
          if (index >= 0) {
            list.splice(index, 1);
          }
        }
      });
    }
    clearDraft(field);
    sendReq();
  });

  /** 载入已生效条件到草稿区(点击 Tag 编辑);区间保留 [start,end],多值取第一个 */
  const loadToDraft = useMemoizedFn((field: string) => {
    const value = criteria?.[field];
    if (isUndefined(value)) {
      return undefined;
    }
    const loaded = isArray(value) ? value[0] : value;
    setDraft(field, loaded);
    return loaded;
  });

  const resetAll = useMemoizedFn(() => {
    if (!isString(reqId)) {
      return;
    }
    const fields = Object.keys(criteria ?? {});
    // 复用旧面板的重置能力(按字段删除并立即刷新),再清理顺序与草稿
    resetReq(fields);
    if (fields.length === 0) {
      // 没有已生效条件时也要刷新一次,保持「重置即重新查询」的既有语义
      sendReq();
    }
    if (isArray(storedOrder)) {
      setData([PathKey.Req, reqId, ORDER_KEY], []);
    }
    clearDraft();
  });

  return {
    reqId,
    criteria,
    draft,
    order: isArray(storedOrder) ? storedOrder : [],
    getDraft,
    setDraft,
    clearDraft,
    commit,
    removeCondition,
    loadToDraft,
    resetAll,
    search: sendReq,
  };
};
