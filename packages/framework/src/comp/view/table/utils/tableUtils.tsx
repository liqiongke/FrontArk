import { KeyAttr } from '@/interface';
import BoundTableCell from '../comp/basetable/boundTableCell';
import { get, isArray, isUndefined } from 'lodash';
import { type TableColumn, type TableItemProps } from '../interface';

export default class TableUtils {
  // 创建表格列
  // 列配置仅由 items 驱动;单元格取数路径由 BoundTableCell 内部按 view.path ?? view.dataId 约定解析,
  // 列定义不再闭包持有基础路径,为"结构订阅模式"(renderMode=Subscription)的行列分离做准备
  public static createColumns(
    viewId: string,
    items?: TableItemProps[],
  ): TableColumn[] {
    if (!isArray(items)) {
      return [];
    }

    return items.map((item, index) => {
      const columnKey = item.field + '_' + index;
      const result: TableColumn = {
        title: item.title,
        width: item.width,
        dataIndex: item.field,
        key: columnKey,
        // 行数据引用变化(immer 结构共享下即该行被修改)时才重渲染单元格
        shouldCellUpdate: (record, prevRecord) => record !== prevRecord,
        render: this.cellRenderCreator(viewId, columnKey),
      };

      return result;
    });
  }

  // 单元格内容渲染为按身份绑定的组件:props 仅含稳定身份(viewId/columnKey/rowKey),
  // 不携带 record/列配置/路径对象,配合 memo 隔离同记录内其他字段的父级更新;
  // 列配置与基础路径由 BoundTableCell 内部订阅,配置变化时不受 rc-table 内容缓存影响
  static cellRenderCreator = (viewId: string, columnKey: string) => {
    return (_value: any, record: any, index: number) => {
      // 优先按行键值(@Row 身份寻址):与渲染下标无关,列表重排/虚拟滚动后仍指向同一记录;
      // 行键值缺失(数据未经 initData 注入 @key)时回退下标寻址
      const rowKey = get(record, KeyAttr);
      return (
        <BoundTableCell
          viewId={viewId}
          columnKey={columnKey}
          rowKey={rowKey}
          fallbackIndex={isUndefined(rowKey) ? index : undefined}
        />
      );
    };
  };
}
