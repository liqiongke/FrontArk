import StoreContext from '@store/storeContext';
import { type DPath } from '@store/interface';
import { KeyAttr } from '@/interface';
import PathUtils from '@utils/pathUtils';
import logger from '@utils/sysUtils/logger';
import { isArray, isString, isUndefined } from 'lodash';
import { useContext, useMemo, useRef } from 'react';
import { type ViewTableProps } from '../interface';

/**
 * 行身份描述:结构订阅模式的 dataSource 中仅携带行键值,
 * 业务字段值由单元格控件按 @Row:<viewId>:<rowKey> 自行订阅真实数据数组
 */
export interface IdentityRow {
  [KeyAttr]: string;
}

/**
 * 结构订阅状态(hook 实例内缓存,引用仅随数据/基础路径变化而更新)
 */
export interface RowIdentityState {
  /**
   * 行身份列表(结构订阅模式的 dataSource);
   * 数组内容变化但行键序列不变时复用上次引用,保证 Table 侧 props 稳定
   */
  rows: IdentityRow[];
  /** 行身份列表对应的原始数据数组引用(回退模式或调试用) */
  rawData: unknown;
  /** 行身份不可靠(键缺失/重复/非字符串):外层应回退 Record 模式渲染 rawData */
  fallback: boolean;
  /** 内部缓存键:基础路径序列化结果(非对外契约) */
  basePathKey?: string;
}

// 稳定空行列表:数据未就绪/非数组时按空表处理,保持 dataSource 引用稳定
const EMPTY_ROWS: IdentityRow[] = [];

/**
 * 表格结构订阅 hook(表格局部使用,缓存按 hook 实例隔离,多表格/多页面互不串扰)
 *
 * 职责(详见 docs/design/table-cell-update-analysis.md 5.2):
 * - 订阅表格基础路径(view.path ?? view.dataId 约定,与 BoundTableCell 列取数一致)下的数据数组,
 *   提取有序行键序列,生成仅含行身份的 dataSource;
 * - 数据数组引用未变化(immer 结构共享:仅字段修改不改变未修改数组引用)时复用上次结果;
 * - 数组内容变化但行键序列不变(字段编辑/同键记录替换)时复用行列表引用,
 *   表格结构(Table/Cell 外壳)不因值写入而更新;
 * - 行键序列变化(新增/删除/重排/换页)时重建行列表,行身份对象按键值跨版本复用,
 *   已删除行的身份对象随之清理;
 * - 行键缺失/重复/非字符串(超出 @Row 字符串键解析能力)时标记 fallback,
 *   由调用方回退 Record 模式,并诊断提示一次。
 *
 * selector 内部通过 ref 缓存保证"同输入返回同引用",
 * 满足 zustand v5 useSyncExternalStore 对快照稳定性的要求(避免无限重渲染)
 */
const useRowIdentityList = (viewId: string): RowIdentityState => {
  const useStore = useContext(StoreContext);

  // 基础路径拆分为两个订阅避免 selector 返回新建数组(引用不稳定会导致无限重渲染)
  const viewPath = useStore(
    (state) => (state.getView(viewId) as ViewTableProps | undefined)?.path,
  );
  const dataId = useStore((state) => {
    const view = state.getView(viewId) as ViewTableProps | undefined;
    return isUndefined(view?.path) ? view?.dataId : undefined;
  });

  const basePath = useMemo<DPath>(
    () => viewPath ?? (isString(dataId) ? [dataId] : undefined),
    [viewPath, dataId],
  );
  // 路径序列化作缓存键:路径内容相同即视为同源(防御 basePath 引用变化但内容一致的场景)
  const basePathKey = useMemo(
    () => (isUndefined(basePath) ? undefined : PathUtils.toString(basePath)),
    [basePath],
  );

  const stateRef = useRef<RowIdentityState>({
    rows: EMPTY_ROWS,
    rawData: undefined,
    fallback: false,
  });
  // 行身份对象池:跨数据版本按键值复用,减少 Table 行组件层的对象引用变化
  const identityPoolRef = useRef(new Map<string, IdentityRow>());
  // 回退诊断只提示一次,避免高频日志
  const warnedRef = useRef(false);

  return useStore((state) => {
    const rawData = isUndefined(basePathKey) ? undefined : state.getData(basePath);
    const prev = stateRef.current;
    // 数据数组引用未变化且基础路径未变:直接复用上次结果(快照稳定)
    if (prev.basePathKey === basePathKey && prev.rawData === rawData) {
      return prev;
    }

    // 数据未就绪或不是数组:稳定空表(与 Record 模式"非数组按空处理"口径一致)
    if (!isArray(rawData)) {
      const next: RowIdentityState = { rows: EMPTY_ROWS, rawData, fallback: false, basePathKey };
      stateRef.current = next;
      return next;
    }

    const keys: string[] = [];
    let fallback = false;
    for (const record of rawData) {
      const key = record?.[KeyAttr];
      // 行键缺失/非字符串/重复:结构订阅无法安全寻址,标记回退
      if (!isString(key) || key.length === 0 || keys.includes(key)) {
        fallback = true;
        break;
      }
      keys.push(key);
    }

    let rows: IdentityRow[];
    if (fallback) {
      rows = EMPTY_ROWS;
      if (!warnedRef.current) {
        warnedRef.current = true;
        logger.warn(`表格${viewId}的行键缺失/重复或非字符串,结构订阅模式已回退为 Record 模式渲染`);
      }
    } else if (
      !prev.fallback &&
      prev.rows.length === keys.length &&
      prev.rows.every((row, index) => row[KeyAttr] === keys[index])
    ) {
      // 数组内容变化但行键序列不变(如字段编辑/同键记录替换):复用上次结构引用
      rows = prev.rows;
    } else {
      // 行序列变化(新增/删除/重排/换页):重建行列表,行身份对象按键值跨版本复用
      const pool = identityPoolRef.current;
      rows = keys.map((key) => {
        let row = pool.get(key);
        if (isUndefined(row)) {
          row = { [KeyAttr]: key };
          pool.set(key, row);
        }
        return row;
      });
      // 以当前键集合重建对象池,清理已删除行,避免长会话下缓存无限增长
      identityPoolRef.current = new Map(
        keys.map((key) => [key, pool.get(key) as IdentityRow]),
      );
    }

    const next: RowIdentityState = { rows, rawData, fallback, basePathKey };
    stateRef.current = next;
    return next;
  });
};

export default useRowIdentityList;
