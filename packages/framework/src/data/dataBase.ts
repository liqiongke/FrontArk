import ViewPathUtils from '@/utils/viewPathUtils';
import DataProps from './interface';

abstract class DataBase {
  /**
   * 创建活动路径引用，简化 ViewPath.active 的调用
   * @param viewId 视图ID
   * @returns 活动路径数组
   */
  static active = (viewId: string): string => {
    return ViewPathUtils.active(viewId);
  };

  [key: string]: DataProps;
}

export default DataBase;
