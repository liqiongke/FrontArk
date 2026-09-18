import { useRef } from 'react';
import type { StoreApi } from 'zustand';

/**
 * 渲染探针(开发期诊断工具,不进公共导出):定位"谁触发了组件渲染"
 *
 * 开关:控制台执行 setProbeEnabled(true),或 localStorage.setItem('renderProbe', '1') 后刷新;
 * 默认关闭,探针仅剩一次布尔判断,可保留在组件中不摘除。
 *
 * 对应渲染传播链的四个环节:
 * 1. useRenderProbe(label, props?)        —— 组件函数执行计数与 props 差异(埋在组件函数体首行)
 * 2. createMemoProbe(name)                —— React.memo 比较函数,打印 memo 被哪些 props 打破
 * 3. traceStoreWrites / traceStoreNotify  —— store 写入来源(调用栈)与订阅通知频次
 * 4. CommitProbe 组件见 renderProbeCommit.tsx(React.Profiler 包装,统计 commit 批次/阶段/耗时)
 *
 * 注意:组件函数执行、selector 执行、DOM 变化是三个不同层次的指标;
 * 探针计数表示"函数被执行了几次",不能直接等同为"DOM 更新了几处"。
 */

const ENABLE_KEY = 'renderProbe';

const readEnabled = (): boolean => {
  try {
    return localStorage.getItem(ENABLE_KEY) === '1';
  } catch {
    // 非浏览器环境(jsdom 单测/SSR)无 localStorage,探针默认关闭
    return false;
  }
};

let enabled = readEnabled();

/** 运行时开关探针;同时写入 localStorage,刷新后保持 */
export const setProbeEnabled = (value: boolean): void => {
  enabled = value;
  try {
    localStorage.setItem(ENABLE_KEY, value ? '1' : '0');
  } catch {
    // 存储不可用时仅内存生效
  }
};

/** 探针是否开启 */
export const probeEnabled = (): boolean => enabled;

/** 浅比较两份 props,返回引用不同的 key 列表(与 React.memo 默认比较语义一致) */
const diffProps = (prev?: object, next?: object): string[] => {
  if (!prev || !next) {
    return [];
  }
  const prevProps = prev as Record<string, unknown>;
  const nextProps = next as Record<string, unknown>;
  const keys = new Set([...Object.keys(prevProps), ...Object.keys(nextProps)]);
  return Array.from(keys).filter((key) => !Object.is(prevProps[key], nextProps[key]));
};

/**
 * 组件函数执行探针:在组件函数体首行调用
 * 计数为渲染期自增,包含被并发渲染中断未提交的执行,与 Profiler 统计的 commit 数可能存在差异
 */
export function useRenderProbe(label: string, props?: object): void {
  const count = useRef(0);
  const prevProps = useRef<object | undefined>(undefined);
  if (!probeEnabled()) {
    return;
  }
  count.current += 1;
  const changed = diffProps(prevProps.current, props);
  console.debug(
    `[renderProbe] #${count.current} ${label}`,
    changed.length > 0
      ? `props 变化: [${changed.join(', ')}]`
      : 'props 未变化(更新来自父级或组件内部 state)',
  );
  prevProps.current = props;
}

/**
 * React.memo 比较函数工厂:打印 memo 边界被哪些 props 打破
 * 返回值语义与 React.memo 默认浅比较一致,开关关闭时不影响比较结果,可长期保留在 memo 第二参
 */
export function createMemoProbe<P extends object>(name: string) {
  return (prev: Readonly<P>, next: Readonly<P>): boolean => {
    const changed = diffProps(prev, next);
    if (probeEnabled()) {
      if (changed.length > 0) {
        console.debug(
          `[renderProbe] memo 未拦截 ${name},变化的 props: [${changed.join(', ')}]`,
          { prev, next },
        );
      } else {
        console.debug(`[renderProbe] memo 拦截 ${name},props 未变化,子组件不渲染`);
      }
    }
    return changed.length === 0;
  };
}

/**
 * store 写入探针:临时包装 zustand store 的 setState,打印每次写入与调用栈,定位"谁改的数据"
 * 返回恢复函数,调用后还原原始 setState
 */
export function traceStoreWrites<T>(useStore: StoreApi<T>, label = 'store'): () => void {
  const rawSetState: StoreApi<T>['setState'] = useStore.setState.bind(useStore);
  useStore.setState = ((...args: Parameters<StoreApi<T>['setState']>) => {
    if (probeEnabled()) {
      const stack = (new Error().stack ?? '')
        .split('\n')
        .slice(2, 8)
        .filter((line) => line.trim().length > 0);
      console.debug(`[renderProbe] ${label} 写入调用栈:\n${stack.join('\n')}`, args[0]);
    }
    return rawSetState(...args);
  }) as StoreApi<T>['setState'];
  return () => {
    useStore.setState = rawSetState;
  };
}

/**
 * store 通知探针:通过 subscribe 观察每次写入触发的全局通知与变化切片,
 * 用于核对"写入 1 次 → 全部 selector 重跑"的通知成本
 */
export function traceStoreNotify<T>(useStore: StoreApi<T>, label = 'store'): () => void {
  return useStore.subscribe((state, prevState) => {
    if (!probeEnabled()) {
      return;
    }
    const prevSlices = prevState as Record<string, unknown>;
    const nextSlices = state as Record<string, unknown>;
    const slices = Object.keys(nextSlices).filter(
      (key) => nextSlices[key] !== prevSlices[key],
    );
    console.debug(`[renderProbe] ${label} 通知全部订阅,变化切片: [${slices.join(', ')}]`);
  });
}
