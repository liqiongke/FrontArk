import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@jl/framework/ui';
import { ChevronRight } from 'lucide-react';
import { useMemoizedFn } from 'ahooks';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import SimpleBar from 'simplebar-react';
import 'simplebar-react/dist/simplebar.min.css';
import type { MenuItem } from '../../../interface/menu';

interface MenuComponentProps {
  collapsed?: boolean;
  menuItems?: MenuItem[];
}

interface MenuNodeProps {
  item: MenuItem;
  collapsed?: boolean;
  selectedKey: string;
  onSelect: (key: string) => void;
  depth: number;
}

// 递归渲染菜单节点：叶子节点直接导航，分组节点用 Collapsible 折叠子项
const MenuNode = ({ item, collapsed, selectedKey, onSelect, depth }: MenuNodeProps) => {
  const [open, setOpen] = useState(false);
  const hasChildren = !!item.children?.length;
  const active = selectedKey === item.path;
  const itemClass = `flex h-9 cursor-pointer items-center gap-2 rounded-md px-2 text-sm transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground ${
    active ? 'bg-sidebar-accent font-medium text-sidebar-accent-foreground' : ''
  }`;
  const indentStyle = depth > 0 ? { paddingLeft: `${depth * 16 + 8}px` } : undefined;

  if (!hasChildren) {
    return (
      <button
        type="button"
        className={itemClass}
        style={indentStyle}
        title={collapsed ? item.title : undefined}
        onClick={() => onSelect(item.path)}
      >
        {item.icon && <span className="shrink-0 text-xs">{item.icon}</span>}
        {!collapsed && <span className="truncate">{item.title}</span>}
      </button>
    );
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button type="button" className={itemClass} style={indentStyle} title={collapsed ? item.title : undefined}>
          {item.icon && <span className="shrink-0 text-xs">{item.icon}</span>}
          {!collapsed && (
            <>
              <span className="flex-1 truncate text-left">{item.title}</span>
              <ChevronRight className={`size-4 shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} />
            </>
          )}
        </button>
      </CollapsibleTrigger>
      {!collapsed && (
        <CollapsibleContent>
          <div className="flex flex-col gap-0.5">
            {item.children!.map((child) => (
              <MenuNode
                key={child.path}
                item={child}
                selectedKey={selectedKey}
                onSelect={onSelect}
                depth={depth + 1}
              />
            ))}
          </div>
        </CollapsibleContent>
      )}
    </Collapsible>
  );
};

const MenuComponent = ({ collapsed, menuItems = [] }: MenuComponentProps) => {
  const [selectedKey, setSelectedKey] = useState('home');
  const navigate = useNavigate();

  const onMenuSelect = useMemoizedFn((key: string) => {
    setSelectedKey(key);
    navigate(key);
  });

  return (
    <aside
      className={`main-sider flex flex-col bg-sidebar text-sidebar-foreground select-none transition-[width] duration-200 ${
        collapsed ? 'w-14' : 'w-60'
      }`}
    >
      <div className="logo flex h-12 shrink-0 items-center border-b border-white/10 px-4">
        {!collapsed && <div className="text-lg font-bold text-white">{import.meta.env.VITE_TITLE}</div>}
      </div>

      <div className="menu flex-1 overflow-hidden">
        <SimpleBar
          style={{
            height: '100%',
            maxHeight: 'calc(100vh - 48px)',
          }}
        >
          <nav className="flex flex-col gap-0.5 p-2">
            {menuItems.map((item) => (
              <MenuNode
                key={item.path}
                item={item}
                collapsed={collapsed}
                selectedKey={selectedKey}
                onSelect={onMenuSelect}
                depth={0}
              />
            ))}
          </nav>
        </SimpleBar>
      </div>
    </aside>
  );
};

export default MenuComponent;
