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
      ? { width: view.width, maxWidth: '100vw' }
      : { height: view.width };

  return (
    <Sheet open={!!open} onOpenChange={handleOpenChange}>
      {/* forceMount: 关闭后内容保持挂载（配合 hasOpened 懒挂载），data-[state=closed]:hidden 保证不可见不可交互 */}
      <SheetContent
        forceMount
        side={side}
        aria-describedby={undefined}
        style={sizeStyle}
        className="data-[state=closed]:hidden overflow-auto gap-0 p-0 sm:max-w-none"
      >
        <SheetHeader className="border-b p-6">
          <SheetTitle>{view.title ?? '面板'}</SheetTitle>
        </SheetHeader>
        {/* 抽屉自身已是承载面板:内嵌表单摘掉统一面板的底色/圆角/内边距,避免面板套面板 */}
        <div className="min-w-0 flex-1 overflow-auto p-6 [&_.view-form-container]:rounded-none [&_.view-form-container]:border-0 [&_.view-form-container]:bg-transparent [&_.view-form-container]:p-0">
          {hasOpened ? <CompFactory viewId={view.viewId} /> : null}
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default ViewDrawer;
