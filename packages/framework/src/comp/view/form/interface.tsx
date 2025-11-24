import { CtrlButtonProps } from '@ctrl/button/interface';
import { ViewItem, ViewStructBase, ViewType } from '@view/interface';

export interface ViewFormProps extends ViewStructBase {
  type: ViewType.Form;
  toolList?: CtrlButtonProps[];
  items?: FormItemProps[];
}

export interface FormItemProps extends ViewItem {
  span?: number;
}
