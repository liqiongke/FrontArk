import StoreContext from '@/stores/store/storeContext';
import { readView } from '@/stores/store/utils/storeDataPath';
import CtrlFactory from '@/comp/ctrlFactory';
import { Ctrl, type CtrlStructType } from '@/comp/control/interface';

import PathUtils from '@utils/pathUtils';
import ViewPathUtils from '@/utils/viewPathUtils';
import { ViewType } from '@view/interface';
import { isArray, isString, isUndefined } from 'lodash';
import React, { useContext, useMemo } from 'react';
import { type TableAlign, type ViewTableProps } from '../../interface';
import { tableRenderProbes } from '../../utils/tableTestProbes';
import TableUtils from '../../utils/tableUtils';

interface BoundTableCellProps {
  /**
   * @name 所属表格视图 id
   * @desc 用于订阅列配置与构造行数据路径
   */
  viewId: string;

  /**
   * @name 列身份
   * @desc 与 createColumns 的 key 规则一致(field + '_' + index)
   */
  columnKey: string;

  /**
   * @name 行键值
   * @desc @Row 身份寻址;缺失时回退下标寻址
   */
  rowKey?: string | number;

  /**
   * @name 兜底下标
   * @desc 行键缺失时的渲染下标(兼容分支,与旧列取数行为一致)
   */
  fallbackIndex?: number;
}

/**
 * 按身份绑定的表格单元格
 *
 * 设计要点(详见 docs/design/table-cell-update-analysis.md 5.1):
 * - memo props 仅含稳定身份(字符串/数字),不携带 record/列配置/路径对象,
 *   行内其他字段修改时 rc-table 重算内容产生的新元素不会带动本组件执行,
 *   字段值变化由内部控件(CtrlText/CtrlInput 等)的路径订阅独立驱动;
 * - 列配置/基础路径由组件内部按 viewId 订阅(不订阅整份 view/data):
 *   配置变化时即使 rc-table 复用旧内容元素,本组件仍能拿到最新配置;
 * - 显式 item.path 优先；未声明时按行键值(@Row 身份寻址,与渲染下标无关),
 *   行键值缺失(数据未经 initData 注入 @key)时回退下标寻址兜底
 */
const BoundTableCellBase: React.FC<BoundTableCellProps> = ({
  viewId,
  columnKey,
  rowKey,
  fallbackIndex,
}) => {
  // 框架自有测试探针:单元格外壳(memo 身份隔离层)执行计数(见迁移计划 5.3)
  tableRenderProbes.cellShell++;
  const useStore = useContext(StoreContext);

  // 列配置/基础路径拆分订阅:selector 只返回 store 内引用或原始值,保持快照引用稳定
  const items = useStore(
    (state) => (readView(state, viewId) as ViewTableProps | undefined)?.items,
  );
  const viewPath = useStore(
    (state) => (readView(state, viewId) as ViewTableProps | undefined)?.path,
  );
  const dataId = useStore((state) => {
    const view = readView(state, viewId) as ViewTableProps | undefined;
    // 与 ViewTable 列取数约定一致:未声明 path 时回退 dataId
    return isUndefined(view?.path) ? view?.dataId : undefined;
  });

  // 按 columnKey 定位列配置:items 引用不变时不重算(view schema 初始化后引用稳定)
  const item = useMemo(() => {
    if (!isArray(items)) {
      return undefined;
    }
    return items.find((it, index) => it.field + '_' + index === columnKey);
  }, [items, columnKey]);

  const basePath = useMemo(
    () => viewPath ?? (isString(dataId) ? [dataId] : undefined),
    [viewPath, dataId],
  );

  const field = item?.field;
  // 对齐方式取自列定义的统一规则（TableUtils.resolveAlign）：显式声明优先，
  // 其次数字列右对齐、其余左对齐。表头用的是同一份取值，所以标题与内容始终同侧。
  const cellCtrl = useMemo<CtrlStructType | undefined>(() => {
    if (isUndefined(item)) {
      return undefined;
    }
    const align = TableUtils.resolveAlign(item);
    // align 属于 CtrlText、textAlign 属于 CtrlInput，二者都可能在列配置里出现，
    // 因此按"对齐声明"的宽松形态读取，再作为控件结构交给工厂
    const declared = item.ctrl as { align?: TableAlign; textAlign?: TableAlign } | undefined;
    return {
      type: Ctrl.Text,
      ...item.ctrl,
      align: declared?.align ?? align,
      textAlign: declared?.textAlign ?? align,
    } as unknown as CtrlStructType;
  }, [item]);

  const cellPath = useMemo(() => {
    if (isUndefined(item)) return undefined;
    if (!isUndefined(item.path)) return item.path;
    if (isUndefined(field)) return undefined;
    if (isUndefined(rowKey)) {
      return PathUtils.itemPath(item, basePath, fallbackIndex);
    }
    return [ViewPathUtils.row(viewId, rowKey), field];
  }, [item, field, rowKey, basePath, fallbackIndex, viewId]);

  // columnKey 与视图列配置不同步(schema 异常):不渲染,避免订阅到错误的数据位置
  if (isUndefined(item) || isUndefined(cellPath)) {
    return null;
  }

  return <CtrlFactory ctrl={cellCtrl} path={cellPath} sourceView={ViewType.Table} />;
};

const BoundTableCell = React.memo(BoundTableCellBase);
BoundTableCell.displayName = 'BoundTableCell';

export default BoundTableCell;
