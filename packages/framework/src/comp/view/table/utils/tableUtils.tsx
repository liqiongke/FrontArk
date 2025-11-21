import CtrlFactory from '@/comp/ctrlFactory';
import { CtrlType } from '@ctrl/interface';
import { DPath } from '@store/interface';
import PathUtils from '@utils/pathUtils';
import { ViewType } from '@view/interface';
import { isArray } from 'lodash';
import { TableColumn, TableItemProps } from '../interface';

export default class TableUtils {
  // 创建表格列
  public static createColumns(items?: TableItemProps[], path?: DPath): TableColumn[] {
    if (!isArray(items)) {
      return [];
    }

    return items.map((item, index) => {
      const result: TableColumn = {
        title: item.title,
        width: item.width,
        dataIndex: item.field,
        key: item.field + '_' + index,
        shouldCellUpdate: () => false,
        render: this.colnumRenderCreator(item, path),
      };

      return result;
    });
  }

  static colnumRenderCreator = (item: TableItemProps, path?: DPath) => {
    return (value: any, recoder: any, index: number) => {
      return (
        <CtrlFactory
          ctrl={item.ctrl || { type: CtrlType.CTRL_TEXT }}
          path={PathUtils.itemPath(item, path, index)}
          sourceView={ViewType.VIEW_TABLE}
        />
      );
    };
  };
}
