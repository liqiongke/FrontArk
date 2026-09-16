import { PathKey, PathSplit } from '@/stores/store/interface';

// 与视图数据路径相关的工具类
class ViewPathUtils {
  // 获取指定id对应的焦点行的数据引用
  static active = (viewId: string) => {
    return `${PathKey.Active}${PathSplit}${viewId}`;
  };

  // 按行键值构造行数据引用:以记录身份寻址,与渲染下标无关,
  // 列表重排/翻页/虚拟滚动后仍指向同一记录;行键值经 encodeURIComponent 编码,支持包含分隔符的键值
  static row = (viewId: string, rowKey: string | number) => {
    return `${PathKey.Row}${PathSplit}${viewId}${PathSplit}${encodeURIComponent(String(rowKey))}`;
  };
}

export default ViewPathUtils;
