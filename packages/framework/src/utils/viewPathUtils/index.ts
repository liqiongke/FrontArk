import { PathKey, PathSplit } from '@/stores/store/interface';

// 与视图数据路径相关的工具类
class ViewPathUtils {
  // 获取指定id对应的焦点行的数据
  static active = (viewId: string) => {
    return `${PathKey.Active}${PathSplit}${viewId}`;
  };
}

export default ViewPathUtils;
