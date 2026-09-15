/**
 * 性能统计数据结构定义
 */
interface PerfStats {
  // 1. 基本统计
  调用次数: number; // callCount
  总耗时_毫秒: number; // totalTime_ms

  // 2. 详细统计
  最小耗时_毫秒: number; // minTime_ms (记录单次执行的最短时间)
  最大耗时_毫秒: number; // maxTime_ms (记录单次执行的最长时间)

  // 3. 结果统计
  异常次数: number; // errorCount (记录执行中抛出异常的次数)
  上次执行时间_毫秒: number; // lastDuration_ms (记录最近一次执行的耗时)
}

// 存储所有函数的统计数据，键为专属ID (string)
const trackerMap = new Map<string, PerfStats>();

/**
 * 默认的初始化统计数据
 */
const initialStats: PerfStats = {
  调用次数: 0,
  总耗时_毫秒: 0,
  最小耗时_毫秒: Infinity, // 最小耗时初始设为无穷大
  最大耗时_毫秒: 0,
  异常次数: 0,
  上次执行时间_毫秒: 0,
};

/**
 * 1. 注册和包装函数
 * 传入一个专属ID和待执行的函数，返回一个被包装过的、带有性能统计功能的函数。
 * * @param id 专属ID，用于隔离统计数据。
 * @param func 待测试的原始函数。
 * @returns 包装后的函数，其签名与原始函数保持一致。
 */
export function PerfTrackUtils<T extends (...args: any[]) => any>(id: string, func: T): T {
  // 确保该ID的统计数据存在
  if (!trackerMap.has(id)) {
    // 使用深拷贝确保每个ID拥有独立的统计对象
    trackerMap.set(id, { ...initialStats });
  }

  // 返回一个新的函数，它在调用原始函数前后进行计时和统计
  const trackedFunc = function (this: unknown, ...args: Parameters<T>): ReturnType<T> {
    const stats = trackerMap.get(id)!;
    const startTime = performance.now();
    let result: ReturnType<T> | undefined;
    let error: unknown;

    stats.调用次数++;

    try {
      result = (func as (...args: unknown[]) => ReturnType<T>).apply(this, args);
    } catch (e) {
      error = e;
      stats.异常次数++;
    }

    // 更新统计信息
    const duration = performance.now() - startTime;
    stats.总耗时_毫秒 += duration;
    stats.上次执行时间_毫秒 = duration;
    stats.最小耗时_毫秒 = Math.min(stats.最小耗时_毫秒, duration);
    stats.最大耗时_毫秒 = Math.max(stats.最大耗时_毫秒, duration);

    // 如果有异常抛出，则继续抛出，不影响原始函数的行为
    if (error) {
      throw error;
    }
    return result as ReturnType<T>;
  } as T;

  return trackedFunc;
}

/**
 * 2. 打印指定ID或所有ID的统计信息
 * * @param id 可选的专属ID。如果未提供，则打印所有已记录函数的统计信息。
 */
export function printStats(id?: string): void {
  let statsToPrint: Record<string, any> = {};

  if (id) {
    // 打印单个函数的统计
    const stats = trackerMap.get(id);
    if (!stats) {
      console.warn(`[PerfTracker] 错误：未找到ID为 "${id}" 的统计记录。`);
      return;
    }
    statsToPrint = { [id]: calculateDisplayStats(stats) };
  } else {
    // 打印所有函数的统计
    trackerMap.forEach((stats, currentId) => {
      statsToPrint[currentId] = calculateDisplayStats(stats);
    });
  }

  if (Object.keys(statsToPrint).length === 0) {
    console.log('[PerfTracker] 暂无任何函数统计记录。');
    return;
  }

  console.log('--- 性能统计摘要 (PerfTracker) ---');
  // 使用 console.table 打印出清晰的表格
  console.table(statsToPrint);
  console.log('------------------------------------');
}

/**
 * 内部辅助函数：计算并格式化显示用的统计数据
 */
function calculateDisplayStats(stats: PerfStats): Record<string, string | number> {
  const { 调用次数, 总耗时_毫秒, 最小耗时_毫秒, 最大耗时_毫秒, 异常次数, 上次执行时间_毫秒 } =
    stats;

  const 平均耗时_毫秒 = 调用次数 === 0 ? 0 : 总耗时_毫秒 / 调用次数;

  return {
    '✅ 调用次数': 调用次数,
    '❌ 异常次数': 异常次数,
    '⏱️ 总耗时 (ms)': 总耗时_毫秒.toFixed(4),
    '🧠 平均耗时 (ms)': 平均耗时_毫秒.toFixed(4),
    '⬇️ 最小耗时 (ms)': 最小耗时_毫秒 === Infinity ? 'N/A' : 最小耗时_毫秒.toFixed(4),
    '⬆️ 最大耗时 (ms)': 最大耗时_毫秒.toFixed(4),
    '👉 上次耗时 (ms)': 上次执行时间_毫秒.toFixed(4),
  };
}

/**
 * 3. 清零指定ID或所有ID的统计记录
 * * @param id 可选的专属ID。如果未提供，则清除所有统计记录。
 */
export function resetStats(id?: string): void {
  if (id) {
    if (trackerMap.has(id)) {
      trackerMap.set(id, { ...initialStats });
      console.log(`[PerfTracker] ID: "${id}" 的统计记录已清零。`);
    } else {
      console.warn(`[PerfTracker] 警告：尝试清零不存在的ID: "${id}"。`);
    }
  } else {
    // 清除所有统计记录
    trackerMap.clear();
    console.log('[PerfTracker] 所有函数的统计记录已全部清零。');
  }
}
