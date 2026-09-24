import { isArray } from 'lodash';
import { type TableColumn, type TableItemProps } from '../interface';

export default class TableUtils {
  // 创建表格列(框架自有列描述,不再依赖第三方表格列类型)
  // 列配置仅由 items 驱动;单元格取数路径由 BoundTableCell 内部按 view.path ?? view.dataId 约定解析,
  // 列定义不闭包持有基础路径,为"结构订阅模式"(renderMode=Subscription)的行列分离做准备
  public static createColumns(
    _viewId: string,
    items?: TableItemProps[],
  ): TableColumn[] {
    if (!isArray(items)) {
      return [];
    }

    return items.map((item, index) => {
      const columnKey = item.field + '_' + index;
      const result: TableColumn = {
        title: item.title ?? '',
        width: item.width,
        dataIndex: item.field,
        key: columnKey,
      };

      return result;
    });
  }
}
