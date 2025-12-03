import { useParamByKey, useView } from '@/stores/store/hooks/useView';
import { ParamKey } from '@/stores/store/interface';
import { SysViewProps } from '@view/interface';
import { useMemoizedFn } from 'ahooks';
import { Modal } from 'antd';
import React from 'react';
import CompFactory from '../../compFactory';
import { LayoutModalProps } from './interface';
const ViewModal: React.FC<SysViewProps> = (props) => {
  const [view] = useView<LayoutModalProps>(props.viewId);
  const [open, setOpen] = useParamByKey(props.viewId, ParamKey.Open);

  const onOk = useMemoizedFn(() => {
    setOpen(false);
  });

  const onCancel = useMemoizedFn(() => {
    setOpen(false);
  });

  return (
    <Modal
      closable={{ 'aria-label': 'Custom Close Button' }}
      open={open}
      onOk={onOk}
      onCancel={onCancel}
    >
      <CompFactory viewId={view.viewId} />
    </Modal>
  );
};

export default ViewModal;
