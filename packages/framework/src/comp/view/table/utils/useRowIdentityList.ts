import StoreContext from '@store/storeContext';
import { type DPath } from '@store/interface';
import { readData, readView, resolvePath } from '@store/utils/storeDataPath';
import { KeyAttr } from '@/interface';
import logger from '@utils/sysUtils/logger';
import { isArray, isString, isUndefined } from 'lodash';
import { useContext, useMemo, useRef } from 'react';
import { type ViewTableProps } from '../interface';

/** 表格仅持有行身份，业务值由单元格独立订阅。 */
export interface IdentityRow {
  [KeyAttr]: string;
}

/** 正常模式禁止携带原始数组，避免字段写入改变结构快照。 */
export type RowIdentityState = {
  rows: IdentityRow[];
  basePathKey?: string;
} & ({ fallback: false } | { fallback: true; rawData: unknown });

const EMPTY_ROWS: IdentityRow[] = [];

const useRowIdentityList = (viewId: string): RowIdentityState => {
  const useStore = useContext(StoreContext);
  const viewPath = useStore(
    (state) => (readView(state, viewId) as ViewTableProps | undefined)?.path,
  );
  const dataId = useStore((state) => {
    const view = readView(state, viewId) as ViewTableProps | undefined;
    return isUndefined(view?.path) ? view?.dataId : undefined;
  });
  const basePath = useMemo<DPath>(
    () => viewPath ?? (isString(dataId) ? [dataId] : undefined),
    [viewPath, dataId],
  );
  // 源数组缓存不属于 React 快照，字段改变时只更新此缓存。
  const cache = useRef<{
    rawData: unknown;
    sourceKey?: string;
    snapshot: RowIdentityState;
  }>({ rawData: undefined, snapshot: { rows: EMPTY_ROWS, fallback: false } });
  const identityPool = useRef(new Map<string, IdentityRow>());
  const warned = useRef(false);

  return useStore((state) => {
    const resolved = isUndefined(basePath) ? undefined : resolvePath(state, basePath);
    const sourceKey = isUndefined(resolved) ? undefined : JSON.stringify(resolved);
    const rawData = isUndefined(sourceKey) ? undefined : readData(state, resolved);
    const prev = cache.current;
    if (prev.sourceKey === sourceKey && prev.rawData === rawData) {
      return prev.snapshot;
    }

    const keys: string[] = [];
    const seen = new Set<string>();
    let fallback = false;
    if (isArray(rawData)) {
      for (const record of rawData) {
        const key = record?.[KeyAttr];
        if (!isString(key) || key.length === 0 || seen.has(key)) {
          fallback = true;
          break;
        }
        seen.add(key);
        keys.push(key);
      }
    }

    let snapshot: RowIdentityState;
    if (fallback) {
      snapshot = { rows: EMPTY_ROWS, rawData, fallback: true, basePathKey: sourceKey };
      if (!warned.current) {
        warned.current = true;
        logger.warn(`表格${viewId}的行键缺失/重复或非字符串,结构订阅模式已回退为 Record 模式渲染`);
      }
    } else if (
      !prev.snapshot.fallback &&
      prev.sourceKey === sourceKey &&
      prev.snapshot.rows.length === keys.length &&
      prev.snapshot.rows.every((row, index) => row[KeyAttr] === keys[index])
    ) {
      // 必须复用整个快照，而非仅复用其中的 rows。
      snapshot = prev.snapshot;
    } else {
      const pool = identityPool.current;
      const rows = keys.length === 0 ? EMPTY_ROWS : keys.map((key) =>
        pool.get(key) ?? { [KeyAttr]: key },
      );
      snapshot = { rows, fallback: false, basePathKey: sourceKey };
    }
    // 清理已删除行及降级前的身份，缓存仅随当前集合存活。
    identityPool.current = new Map(snapshot.rows.map((row) => [row[KeyAttr], row]));
    cache.current = { rawData, sourceKey, snapshot };
    return snapshot;
  });
};

export default useRowIdentityList;
