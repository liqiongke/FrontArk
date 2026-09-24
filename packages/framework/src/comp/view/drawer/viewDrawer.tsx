import { useParamByKey, useView } from '@/stores/store/hooks/useView';
import { ParamKey } from '@/stores/store/interface';
import { type SysViewProps } from '@view/interface';
import { useMemoizedFn } from 'ahooks';
import React, { useState } from 'react';
import CompFactory from '../../compFactory';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/ui/components/sheet';
import { type LayoutDrawerProps } from './interface';

const ViewDrawer: React.FC<SysViewProps> = (props) => {
  const [view] = useView<LayoutDrawerProps>(props.viewId);
  const [open, setOpen] = useParamByKey(props.viewId, ParamKey.Open);
  // 业务内容首次打开后保持状态（懒挂载，关闭仅隐藏不卸载）
  const [hasOpened, setHasOpened] = useState(false);

  const onClose = useMemoizedFn(() => {
    setOpen(false);
    view.onClose?.();
  });

  const handleOpenChange = useMemoizedFn((nextOpen: boolean) => {
    if (!nextOpen) {
      onClose();
    }
  });

  if (open && !hasOpened) {
    setHasOpened(true);
  }

  // 四方向 placement；left/right 用宽度，top/bottom 用高度，动态尺寸走内联样式
  const side = view.placement || 'right';
  const sizeStyle: React.CSSProperties =
    side === 'left' || side === 'right'
      ? { width: view.width, maxWidth: view.width }
      : { height: view.width };

  return (
    <Sheet open={!!open} onOpenChange={handleOpenChange}>
      {/* forceMount: 关闭后内容保持挂载（配合 hasOpened 懒挂载），data-[state=closed]:hidden 保证不可见不可交互 */}
      <SheetContent
        forceMount
        side={side}
        style={sizeStyle}
        className="data-[state=closed]:hidden overflow-auto gap-0 p-0 sm:max-w-none"
      >
        <SheetHeader className="border-b">
          <SheetTitle>{view.title ?? '面板'}</SheetTitle>
        </SheetHeader>
        <div className="min-w-0 flex-1 overflow-auto p-4">
          {hasOpened ? <CompFactory viewId={view.viewId} /> : null}
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default ViewDrawer;
