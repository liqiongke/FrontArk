import { Toaster as Sonner, type ToasterProps } from 'sonner';

/**
 * 框架统一 Toaster：应用根节点挂载一次即可。
 * 本期不提供暗色模式切换，固定浅色主题；后续可在此接入主题 token。
 */
function Toaster(props: ToasterProps) {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      style={
        {
          '--normal-bg': 'var(--popover)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'var(--border)',
          '--border-radius': 'var(--radius)',
        } as React.CSSProperties
      }
      {...props}
    />
  );
}

export { Toaster };
