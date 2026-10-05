import { isArray } from 'lodash';
import { type TableAlign, type TableColumn, type TableItemProps } from '../interface';

export default class TableUtils {
  /**
   * 解析一列的对齐方式：列显式声明的对齐优先，其次数字列右对齐，其余左对齐。
   *
   * 这是对齐规则的唯一来源，表头、数据格、统计格都从这里取值，
   * 避免三处各算各的导致标题与列内内容左右错位。
   */
  public static resolveAlign(item: TableItemProps): TableAlign {
    // 对齐声明的宽松形态：align 属于 CtrlText、textAlign 属于 CtrlInput，
    // 列上显式给出任一者都视为该列的对齐声明
    const declared = item.ctrl as { align?: TableAlign; textAlign?: TableAlign } | undefined;
    if (declared?.align) {
      return declared.align;
    }
    if (declared?.textAlign) {
      return declared.textAlign;
    }
    return item.valueType === 'number' ? 'right' : 'left';
  }

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
        // 未声明时按文本处理：只有数字列需要右对齐与小数点对齐
        valueType: item.valueType ?? 'text',
        // 对齐随列定义一次算好，表头与内容共用
        align: TableUtils.resolveAlign(item),
      };

      return result;
    });
  }
}
