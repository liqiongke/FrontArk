/**
 * Studio 的基础 UI 原子组件。
 * 形态对齐 shadcn/ui（new-york 风格 + 语义 token），但不引入 radix，
 * 只保留中台真正需要的那几个：按钮、输入、下拉、开关、标签页、面板、徽标。
 */
import { type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

type ButtonVariant = 'default' | 'outline' | 'ghost' | 'destructive' | 'subtle';
type ButtonSize = 'sm' | 'md' | 'icon';

const variantClass: Record<ButtonVariant, string> = {
  default: 'bg-primary text-primary-foreground hover:bg-primary/90',
  outline: 'border border-border bg-card hover:bg-muted text-foreground',
  ghost: 'hover:bg-muted text-foreground',
  destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
  subtle: 'bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground',
};

const sizeClass: Record<ButtonSize, string> = {
  sm: 'h-6 px-2 text-[12px] gap-1',
  md: 'h-7 px-2.5 text-[13px] gap-1.5',
  icon: 'h-7 w-7 p-0',
};

export function Button({
  variant = 'outline',
  size = 'md',
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex select-none items-center justify-center rounded-[6px] font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
        'disabled:pointer-events-none disabled:opacity-45',
        variantClass[variant],
        sizeClass[size],
        className,
      )}
      {...rest}
    />
  );
}

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'h-7 w-full rounded-[6px] border border-input bg-card px-2 text-[13px]',
        'placeholder:text-muted-foreground/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
        'disabled:cursor-not-allowed disabled:opacity-60',
        className,
      )}
      {...rest}
    />
  );
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        'w-full rounded-[6px] border border-input bg-card px-2 py-1.5 text-[12.5px] mono',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
        className,
      )}
      {...rest}
    />
  );
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        'h-7 w-full rounded-[6px] border border-input bg-card px-1.5 text-[13px]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
        className,
      )}
      {...rest}
    >
      {children}
    </select>
  );
}

export function Switch({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-4.5 w-8 shrink-0 items-center rounded-full border transition-colors',
        checked ? 'border-primary bg-primary' : 'border-border bg-muted',
        disabled && 'cursor-not-allowed opacity-50',
      )}
    >
      <span
        className={cn(
          'pointer-events-none block h-3.5 w-3.5 rounded-full bg-card shadow transition-transform',
          checked ? 'translate-x-3.5' : 'translate-x-0.5',
        )}
      />
    </button>
  );
}

export function Badge({
  children,
  tone = 'default',
  className,
  title,
}: {
  children: ReactNode;
  tone?: 'default' | 'muted' | 'warn' | 'error' | 'info' | 'success';
  className?: string;
  title?: string;
}) {
  const tones: Record<string, string> = {
    default: 'bg-primary/10 text-primary border-primary/20',
    muted: 'bg-muted text-muted-foreground border-border',
    warn: 'bg-amber-500/12 text-amber-700 border-amber-500/25',
    error: 'bg-destructive/10 text-destructive border-destructive/25',
    info: 'bg-sky-500/12 text-sky-700 border-sky-500/25',
    success: 'bg-emerald-500/12 text-emerald-700 border-emerald-500/25',
  };
  return (
    <span
      title={title}
      className={cn(
        'inline-flex shrink-0 items-center rounded-[5px] border px-1.5 py-[1px] text-[11px] leading-4 font-medium',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Panel({ title, actions, children, className }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex min-h-0 flex-col', className)}>
      {(title || actions) && (
        <div className="flex h-8 shrink-0 items-center justify-between gap-2 border-b border-border px-2.5">
          <div className="truncate text-[12px] font-semibold tracking-wide text-muted-foreground">{title}</div>
          <div className="flex shrink-0 items-center gap-1">{actions}</div>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-auto scroll-thin">{children}</div>
    </div>
  );
}

export function Tabs<T extends string>({
  value,
  onChange,
  items,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  items: { value: T; label: ReactNode; badge?: ReactNode }[];
  className?: string;
}) {
  return (
    <div className={cn('flex shrink-0 items-stretch gap-0.5 border-b border-border px-1', className)}>
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          onClick={() => onChange(item.value)}
          className={cn(
            'relative -mb-px inline-flex items-center gap-1 border-b-2 px-2 py-1.5 text-[12.5px] transition-colors',
            value === item.value
              ? 'border-primary font-semibold text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground',
          )}
        >
          {item.label}
          {item.badge}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, hint, children, className }: { label: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-start gap-2 py-1', className)}>
      <div className="w-24 shrink-0 pt-1 text-[12px] leading-5 text-muted-foreground" title={typeof label === 'string' ? label : undefined}>
        {label}
      </div>
      <div className="min-w-0 flex-1">
        {children}
        {hint ? <div className="mt-0.5 text-[11px] leading-4 text-muted-foreground/80">{hint}</div> : null}
      </div>
    </div>
  );
}

export function Empty({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('px-3 py-6 text-center text-[12px] leading-5 text-muted-foreground', className)}>{children}</div>;
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary',
        className,
      )}
    />
  );
}
