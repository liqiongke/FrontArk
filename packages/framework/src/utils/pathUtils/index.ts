import { ViewItem } from '@view/interface';
import { DPath } from '@store/interface';
import { isArray, isNull, isUndefined } from 'lodash';

// 路径计算工具类
export default class PathUtils {
  /**
   * @name 计算路径
   * @param item 视图项
   * @param paths 基础路径（0到多个）
   * @returns 计算后的路径
   */
  static itemPath(item: ViewItem, ...paths: DPath[]): DPath {
    if (!isUndefined(item.path)) {
      return item.path;
    }

    // 如果没有提供任何路径，直接返回 item.field
    if (!paths || paths.length === 0) {
      return item.field;
    }

    // 合并所有路径和 item.field
    return this.mergePath(...paths, item.field);
  }

  /**
   * 合并多个路径
   * @param paths 要合并的路径数组
   * @returns 合并后的路径
   */
  static mergePath(...paths: DPath[]): DPath {
    if (!paths || paths.length === 0) return undefined;

    // 过滤掉空值，然后将每个路径转换为数组形式
    const validPaths = paths.filter((path) => !isNull(path) && !isUndefined(path));
    if (validPaths.length === 0) return undefined;

    // 将所有路径展平为一个数组
    const flattenedPaths = validPaths.flatMap((path) => (isArray(path) ? path : [path]));

    return flattenedPaths;
  }
}
