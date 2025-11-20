import { CtrlButtonProps } from '../../control/button/interface';
import { ViewItem, ViewStructBase, ViewType } from '../interface';

export interface ViewFormProps extends ViewStructBase {
  type: ViewType.VIEW_FORM;
  toolList?: CtrlButtonProps[];
  items?: FormItemProps[];
}

export interface FormItemProps extends ViewItem {
  span?: number;
}

