import { useParamByKey, useView } from '@/stores/store/hooks/useView';
import { ParamKey } from '@/stores/store/interface';
import { SysViewProps } from '@view/interface';
import { useMemoizedFn } from 'ahooks';
import { Drawer } from 'antd';
import React from 'react';
import CompFactory from '../../compFactory';
import { type LayoutDrawerProps } from './interface';

const ViewDrawer: React.FC<SysViewProps> = (props) => {
  const [view] = useView<LayoutDrawerProps>(props.viewId);
  const [open, setOpen] = useParamByKey(props.viewId, ParamKey.Open);

  const onClose = useMemoizedFn(() => {
    setOpen(false);
    view.onClose?.();
  });

  return (
    <Drawer
      title={view.title}
      placement={view.placement || 'right'}
      size={view.width}
      open={open}
      onClose={onClose}
    >
      <CompFactory viewId={view.viewId} />
    </Drawer>
  );
};

export default ViewDrawer;
