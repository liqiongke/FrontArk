import { DPath } from '@store/interface';
import { ViewItem } from '@view/interface';
import { isArray, isNull, isNumber, isString, isUndefined } from 'lodash';

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

  /**
   * @name 路径是否相等
   * @param path1 路径1
   * @param path2 路径2
   * @returns 是否相等
   */
  static equal(path1: DPath, path2: DPath): boolean {
    if (isUndefined(path1) || isUndefined(path2)) return false;
    if (isString(path1) && isString(path2)) {
      return path1 === path2;
    }

    if (isNumber(path1) && isNumber(path2)) {
      return path1 === path2;
    }

    if (isArray(path1) && isArray(path2)) {
      if (path1.length !== path2.length) return false;
      return path1.every((item, index) => this.equal(item, path2[index]));
    }
    return false;
  }

  /**
   * @name 路径转换为字符串
   * @param path 路径
   * @returns 字符串
   */
  static toString(path: DPath): string {
    if (isString(path) || isNumber(path)) {
      return path.toString();
    }

    if (isArray(path)) {
      return path.join('.');
    }

    return '';
  }
}
