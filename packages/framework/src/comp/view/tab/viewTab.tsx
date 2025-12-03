import { useParamByKey, useView } from '@/stores/store/hooks/useView';
import { ParamKey } from '@/stores/store/interface';
import { type SysViewProps } from '@view/interface';
import { Tabs } from 'antd';
import { get } from 'lodash';
import React, { useMemo } from 'react';
import CompFactory from '../../compFactory';
import { type ViewTabProps } from './interface';
const ViewTab: React.FC<SysViewProps> = (props) => {
  const [view] = useView<ViewTabProps>(props.viewId);
  const [activeKey, setActiveKey] = useParamByKey(props.viewId, ParamKey.Active);

  const { items = [] } = view;

  const tabPanes = useMemo(() => {
    return items.map((item) => {
      return {
        ...item,
        children: <CompFactory viewId={item.viewId} />,
      };
    });
  }, [items]);

  return (
    <Tabs
      activeKey={activeKey ?? get(items, [0, 'key'])}
      items={tabPanes}
      onChange={setActiveKey}
    />
  );
};

export default ViewTab;
