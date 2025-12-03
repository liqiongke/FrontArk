import { type ViewStructBase, ViewType } from '../interface';

export interface TabItem {
  key: string;
  label: string;
  viewId: string;
}

export interface ViewTabProps extends ViewStructBase {
  type: ViewType.LayoutTab;

  // 页签项,支持视图的Id或者键值对{label:"标签名",value:"视图Id"}
  items?: Array<TabItem>;
}
