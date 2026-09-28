import { type CtrlBase, type Ctrl } from '@ctrl/interface';
import type { ComponentProps } from 'react';
import type { Button } from '@/ui/components/button';

export interface CtrlButtonProps extends CtrlBase {
  type: Ctrl.Button;
  text?: string;
  /** 使用统一按钮变体表达操作层级，默认保留主按钮。 */
  variant?: ComponentProps<typeof Button>['variant'];
  onClick?: () => void | Promise<void>;
}
