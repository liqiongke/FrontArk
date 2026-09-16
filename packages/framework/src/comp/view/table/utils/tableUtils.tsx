import CtrlFactory from '@/comp/ctrlFactory';
import { Ctrl } from '@ctrl/interface';
import { KeyAttr } from '@/interface';
import { type DPath } from '@store/interface';
import PathUtils from '@utils/pathUtils';
import ViewPathUtils from '@/utils/viewPathUtils';
import { ViewType } from '@view/interface';
import { get, isArray, isUndefined } from 'lodash';
import { type TableColumn, type TableItemProps } from '../interface';

export default class TableUtils {
  // 创建表格列
  public static createColumns(
    viewId: string,
    items?: TableItemProps[],
    path?: DPath,
  ): TableColumn[] {
    if (!isArray(items)) {
      return [];
    }

    return items.map((item, index) => {
      const result: TableColumn = {
        title: item.title,
        width: item.width,
        dataIndex: item.field,
        key: item.field + '_' + index,
        // 行数据引用变化(immer 结构共享下即该行被修改)时才重渲染单元格
        shouldCellUpdate: (record, prevRecord) => record !== prevRecord,
        render: this.colnumRenderCreator(viewId, item, path),
      };

      return result;
    });
  }

  static colnumRenderCreator = (viewId: string, item: TableItemProps, path?: DPath) => {
    return (_value: any, record: any, index: number) => {
      // 优先按行键值(@Row 身份寻址):与渲染下标无关,列表重排/虚拟滚动后仍指向同一记录;
      // 行键值缺失(数据未经 initData 注入 @key)时回退下标寻址
      const rowKey = get(record, KeyAttr);
      const cellPath = isUndefined(rowKey)
        ? PathUtils.itemPath(item, path, index)
        : [ViewPathUtils.row(viewId, rowKey), item.field];
      return (
        <CtrlFactory
          ctrl={item.ctrl || { type: Ctrl.Text }}
          path={cellPath}
          sourceView={ViewType.Table}
        />
      );
    };
  };
}
