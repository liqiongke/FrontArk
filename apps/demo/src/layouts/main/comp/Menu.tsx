import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@jl/framework/ui';
import { ChevronRight, FileText, Folder, House } from 'lucide-react';
import { useMemoizedFn } from 'ahooks';
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import SimpleBar from 'simplebar-react';
import 'simplebar-react/dist/simplebar.min.css';
import type { MenuItem } from '../../../interface/menu';

interface MenuComponentProps {
  collapsed?: boolean;
  menuItems?: MenuItem[];
  onExpand?: () => void;
}

interface MenuNodeProps {
  item: MenuItem;
  collapsed?: boolean;
  selectedKey: string;
  onSelect: (key: string) => void;
  onExpand?: () => void;
  depth: number;
}

// 递归渲染菜单节点：叶子节点直接导航，分组节点用 Collapsible 折叠子项
const MenuNode = ({ item, collapsed, selectedKey, onSelect, onExpand, depth }: MenuNodeProps) => {
  const hasChildren = !!item.children?.length;
  const active = selectedKey === item.key;
  const activeBranch = active || selectedKey.startsWith(`${item.key}/`);
  // 手动折叠仅作用于当前路由；刷新、前进后退或跳转后展开当前路由所在分组。
  const [expansion, setExpansion] = useState({ path: selectedKey, open: activeBranch });
  if (expansion.path !== selectedKey) {
    setExpansion({ path: selectedKey, open: activeBranch });
  }
  const open = expansion.path === selectedKey ? expansion.open : activeBranch;
  const setOpen = (nextOpen: boolean) => {
    setExpansion({ path: selectedKey, open: collapsed ? true : nextOpen });
    if (collapsed) onExpand?.();
  };
  const Icon = hasChildren ? Folder : item.key === '/' ? House : FileText;
  const icon = item.icon
    ? <span aria-hidden="true" className="shrink-0 text-xs">{item.icon}</span>
    : <Icon aria-hidden="true" className="size-4 shrink-0" />;
  const itemClass = `flex h-9 w-full cursor-pointer items-center gap-2 rounded-md px-2 text-sm transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground ${
    active ? 'bg-sidebar-accent font-medium text-sidebar-accent-foreground' : ''
  }`;
  const indentStyle = depth > 0 ? { paddingLeft: `${depth * 16 + 8}px` } : undefined;

  if (!hasChildren) {
    return (
      <button
        type="button"
        className={itemClass}
        style={indentStyle}
        title={collapsed ? item.label : undefined}
        aria-label={item.label}
        aria-current={active ? 'page' : undefined}
        onClick={() => onSelect(item.key)}
      >
        {icon}
        {!collapsed && <span className="truncate">{item.label}</span>}
      </button>
    );
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button type="button" className={itemClass} style={indentStyle} title={collapsed ? item.label : undefined} aria-label={item.label}>
          {icon}
          {!collapsed && (
            <>
              <span className="flex-1 truncate text-left">{item.label}</span>
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
                key={child.key}
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

const MenuComponent = ({ collapsed, menuItems = [], onExpand }: MenuComponentProps) => {
  const { pathname: selectedKey } = useLocation();
  const navigate = useNavigate();

  const onMenuSelect = useMemoizedFn((key: string) => {
    navigate(key);
  });

  return (
    <aside
      className={`main-sider flex min-h-0 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground select-none transition-[width] duration-200 ${
        collapsed ? 'w-14' : 'w-60'
      }`}
    >
      <div className="logo flex h-12 shrink-0 items-center border-b border-sidebar-border px-4">
        {!collapsed && <div className="truncate text-lg font-bold text-sidebar-foreground">{import.meta.env.VITE_TITLE}</div>}
      </div>

      <div className="menu min-h-0 flex-1 overflow-hidden">
        <SimpleBar
          style={{
            height: '100%',
            maxHeight: 'calc(100vh - 48px)',
          }}
        >
          <nav aria-label="主菜单" className="flex flex-col gap-0.5 p-2">
            {menuItems.map((item) => (
              <MenuNode
                key={item.key}
                item={item}
                collapsed={collapsed}
                selectedKey={selectedKey}
                onSelect={onMenuSelect}
                onExpand={onExpand}
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
