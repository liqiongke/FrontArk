import { useParamByKey, useView } from '@/stores/store/hooks/useView';
import { ParamKey } from '@/stores/store/interface';
import { type SysViewProps } from '@view/interface';
import { useMemoizedFn } from 'ahooks';
import { notify } from '@/utils/notify';
import React, { useState } from 'react';
import CompFactory from '../../compFactory';
import { Button } from '@/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/ui/components/dialog';
import { type LayoutModalProps } from './interface';

const ViewModal: React.FC<SysViewProps> = (props) => {
  const [view] = useView<LayoutModalProps>(props.viewId);
  const [open, setOpen] = useParamByKey(props.viewId, ParamKey.Open);
  // 业务内容首次打开后保持状态（懒挂载，关闭仅隐藏不卸载）
  const [hasOpened, setHasOpened] = useState(false);

  const onOk = useMemoizedFn(async () => {
    // 确定回调由业务提供；异常时保留窗口并反馈错误，正常/无回调时关闭
    if (view.onOk) {
      try {
        await view.onOk();
      } catch (error) {
        notify.error('操作失败', error instanceof Error ? error.message : String(error));
        return;
      }
    }
    setOpen(false);
  });

  const onCancel = useMemoizedFn(() => {
    setOpen(false);
  });

  const handleOpenChange = useMemoizedFn((nextOpen: boolean) => {
    if (!nextOpen) {
      onCancel();
    }
  });

  if (open && !hasOpened) {
    setHasOpened(true);
  }

  return (
    <Dialog open={!!open} onOpenChange={handleOpenChange}>
      {/* forceMount: 关闭后内容保持挂载（配合 hasOpened 懒挂载），data-[state=closed]:hidden 保证不可见不可交互 */}
      <DialogContent
        forceMount
        className="data-[state=closed]:hidden sm:max-w-lg"
        style={{ maxHeight: '85vh', overflow: 'auto' }}
      >
        <DialogHeader>
          <DialogTitle>{view.title ?? '对话框'}</DialogTitle>
        </DialogHeader>
        <div className="min-w-0">{hasOpened ? <CompFactory viewId={view.viewId} /> : null}</div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            取消
          </Button>
          <Button onClick={onOk}>确定</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ViewModal;
