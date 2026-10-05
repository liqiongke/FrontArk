import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  OVERLAY_SCROLL_CONTAINER_CLASS,
} from '@jl/framework/ui';
import { useMemoizedFn } from 'ahooks';
import { X } from 'lucide-react';
import { type KeyboardEvent, type MouseEvent, useEffect, useRef, useState } from 'react';
import type { TabItem } from './interface';
import {
  hasClosableLeft,
  hasClosableOthers,
  hasClosableRight,
  hasClosableTabs,
} from './tabStore';

export interface TabBarProps {
  tabs: TabItem[];
  activeKey: string;
  /** 桌面端（Tauri）：页签之间的空白作为窗口拖拽区 */
  dragRegion?: boolean;
  onSelect: (key: string) => void;
  onClose: (key: string) => void;
  onCloseOthers: (key: string) => void;
  onCloseLeft: (key: string) => void;
  onCloseRight: (key: string) => void;
  onCloseAll: () => void;
}

/** 右键菜单的锚点位置与被操作页签 */
interface ContextMenuState {
  key: string;
  x: number;
  y: number;
}

const TAB_BASE_CLASS =
  'group relative flex h-8 max-w-44 shrink-0 cursor-pointer items-center rounded-md border px-3 text-sm transition-colors focus-visible:ring-ring/50 focus-visible:ring-[2px] focus-visible:outline-none';
const TAB_ACTIVE_CLASS = 'border-border bg-card font-medium text-foreground shadow-sm';
const TAB_INACTIVE_CLASS =
  'border-transparent text-muted-foreground hover:bg-accent hover:text-accent-foreground';

/**
 * 顶部页签栏。
 *
 * - 左键点击切换路由；右键弹出菜单管理页签（关闭当前/其他/左侧/右侧/全部）
 * - 固定页签（首页）不渲染关闭按钮，也不受批量关闭影响
 * - 左右方向键在页签间切换，激活页签自动滚动到可视区域
 */
const TabBar = ({
  tabs,
  activeKey,
  dragRegion,
  onSelect,
  onClose,
  onCloseOthers,
  onCloseLeft,
  onCloseRight,
  onCloseAll,
}: TabBarProps) => {
  const listRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef(new Map<string, HTMLButtonElement>());
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  // 菜单关闭后 menu 已被清空，用 ref 记住被右键的页签，供「执行动作」与「焦点归还」使用
  const lastMenuKeyRef = useRef('');

  const menuKey = menu?.key ?? '';
  const menuTab = tabs.find((tab) => tab.key === menuKey);

  // 激活页签可能因切换或新增而移出可视区域，滚动回来保证可见
  // scrollIntoView 在 jsdom 等测试环境中缺失，按可选能力调用
  useEffect(() => {
    tabRefs.current.get(activeKey)?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [activeKey, tabs.length]);

  const setTabRef = useMemoizedFn((key: string, node: HTMLButtonElement | null) => {
    if (node) {
      tabRefs.current.set(key, node);
    } else {
      tabRefs.current.delete(key);
    }
  });

  const openContextMenu = useMemoizedFn((event: MouseEvent<HTMLButtonElement>, key: string) => {
    event.preventDefault();
    lastMenuKeyRef.current = key;
    setMenu({ key, x: event.clientX, y: event.clientY });
  });

  // 菜单项在 onSelect 时读取 ref，避免「先关闭菜单清空状态」造成目标丢失
  const runMenuAction = useMemoizedFn((action: (key: string) => void) => {
    action(lastMenuKeyRef.current);
  });

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
      return;
    }
    const index = tabs.findIndex((tab) => tab.key === activeKey);
    if (index < 0) {
      return;
    }
    const offset = event.key === 'ArrowRight' ? 1 : -1;
    const next = tabs[(index + offset + tabs.length) % tabs.length];
    if (next) {
      event.preventDefault();
      onSelect(next.key);
    }
  };

  return (
    <>
      <div
        className="flex h-full min-w-0 flex-1 items-center"
        data-tauri-drag-region={dragRegion}
      >
        <div
          ref={listRef}
          role="tablist"
          aria-label="已打开的页面"
          className={`${OVERLAY_SCROLL_CONTAINER_CLASS} flex h-full items-center gap-1`}
          data-tauri-drag-region={dragRegion}
          onKeyDown={onKeyDown}
          onWheel={(event) => {
            // 页签溢出时用滚轮横向滚动，原生滚动条已隐藏
            const list = listRef.current;
            if (list) {
              list.scrollLeft += event.deltaY;
            }
          }}
        >
          {tabs.map((tab) => {
            const isActive = tab.key === activeKey;
            return (
              <button
                key={tab.key}
                ref={(node) => setTabRef(tab.key, node)}
                type="button"
                role="tab"
                aria-selected={isActive}
                tabIndex={isActive ? 0 : -1}
                title={tab.title}
                className={`${TAB_BASE_CLASS} ${isActive ? TAB_ACTIVE_CLASS : TAB_INACTIVE_CLASS}`}
                onClick={() => onSelect(tab.key)}
                onContextMenu={(event) => openContextMenu(event, tab.key)}
              >
                <span className="truncate">{tab.title}</span>
                {!tab.affix && (
                  <span
                    role="button"
                    tabIndex={-1}
                    aria-label={`关闭 ${tab.title}`}
                    className={`ml-1 -mr-1 flex size-4 shrink-0 items-center justify-center rounded-sm transition-opacity hover:bg-foreground/10 ${
                      isActive ? 'opacity-70' : 'opacity-0 group-hover:opacity-70 group-focus-visible:opacity-70'
                    }`}
                    onClick={(event) => {
                      // 关闭按钮在页签内部，避免同时触发页签切换
                      event.stopPropagation();
                      onClose(tab.key);
                    }}
                  >
                    <X className="size-3" />
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* 页签右侧留白：撑满剩余宽度，作为窗口拖拽与右键空白区域 */}
        <div className="h-full min-w-4 flex-1" data-tauri-drag-region={dragRegion} />
      </div>

      <DropdownMenu
        open={menu !== null}
        onOpenChange={(open) => {
          if (!open) {
            setMenu(null);
          }
        }}
      >
        <DropdownMenuTrigger asChild>
          {/* 1px 锚点跟随鼠标位置，借助 DropdownMenu 完成定位、翻转与无障碍处理 */}
          <div
            aria-hidden="true"
            tabIndex={-1}
            className="fixed size-px"
            style={{ left: menu?.x ?? -9999, top: menu?.y ?? -9999 }}
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          sideOffset={4}
          className="w-36"
          onCloseAutoFocus={(event) => {
            // 锚点不可聚焦，把焦点交还被右键的页签
            event.preventDefault();
            tabRefs.current.get(lastMenuKeyRef.current)?.focus();
          }}
        >
          <DropdownMenuItem
            disabled={!menuTab || menuTab.affix === true}
            onSelect={() => runMenuAction(onClose)}
          >
            关闭当前
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!menuTab || !hasClosableOthers(tabs, menuKey)}
            onSelect={() => runMenuAction(onCloseOthers)}
          >
            关闭其他
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={!hasClosableLeft(tabs, menuKey)}
            onSelect={() => runMenuAction(onCloseLeft)}
          >
            关闭左侧
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!hasClosableRight(tabs, menuKey)}
            onSelect={() => runMenuAction(onCloseRight)}
          >
            关闭右侧
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={!hasClosableTabs(tabs)} onSelect={() => onCloseAll()}>
            关闭全部
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
};

export default TabBar;
