import { useParamByKey, useView } from '@/stores/store/hooks/useView';
import { ParamKey } from '@/stores/store/interface';
import { type SysViewProps } from '@view/interface';
import { get } from 'lodash';
import React, { useMemo, useState } from 'react';
import CompFactory from '../../compFactory';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/ui/components/tabs';
import { type ViewTabProps } from './interface';

const ViewTab: React.FC<SysViewProps> = (props) => {
  const [view] = useView<ViewTabProps>(props.viewId);
  const [activeKey, setActiveKey] = useParamByKey(props.viewId, ParamKey.Active);

  const { items = [] } = view;

  // 各页签首次访问后保留内容状态：访问过的页签内容保持挂载，
  // 未访问过的懒挂载；forceMount 时显式隐藏非活动面板，避免内容同时显示。
  const [visited, setVisited] = useState<Set<string>>(() => new Set());

  const currentKey = (activeKey as string) ?? get(items, [0, 'key']);

  const tabPanes = useMemo(() => {
    return items.map((item) => {
      const visitedItem = visited.has(item.key);
      if (!visitedItem && item.key === currentKey) {
        // 渲染期派生：首次激活即标记已访问（下一次渲染挂载内容）
        setVisited((prev) => new Set(prev).add(item.key));
      }
      return {
        ...item,
        visited: visitedItem || item.key === currentKey,
      };
    });
  }, [items, visited, currentKey]);

  return (
    <Tabs className="min-w-0 gap-4" value={currentKey} onValueChange={(key) => setActiveKey(key)}>
      <TabsList>
        {items.map((item) => (
          <TabsTrigger key={item.key} value={item.key}>
            {item.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {tabPanes.map((item) => (
        <TabsContent
          key={item.key}
          value={item.key}
          forceMount
          hidden={item.key !== currentKey}
          className="min-w-0 data-[state=inactive]:hidden"
        >
          {item.visited ? <CompFactory viewId={item.viewId} /> : null}
        </TabsContent>
      ))}
    </Tabs>
  );
};

export default ViewTab;
