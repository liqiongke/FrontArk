import { Profiler, type ReactNode } from 'react';
import { probeEnabled } from './renderProbe';

/**
 * commit 探针:包裹任意子树,统计 React.Profiler 上报的提交批次、阶段与耗时
 *
 * 用法:<CommitProbe id="table1">...</CommitProbe>,开启探针开关后
 * 每次 React 提交都会输出一条 [renderProbe] commit 日志(phase 为 mount/update)
 */
export const CommitProbe: React.FC<{ id: string; children?: ReactNode }> = ({ id, children }) => (
  <Profiler
    id={id}
    onRender={(probeId, phase, actualDuration) => {
      if (!probeEnabled()) {
        return;
      }
      console.debug(`[renderProbe] commit ${probeId} ${phase} 本次提交耗时 ${actualDuration.toFixed(1)}ms`);
    }}
  >
    {children}
  </Profiler>
);
