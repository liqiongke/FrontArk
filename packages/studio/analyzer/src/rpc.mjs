/**
 * JSON-RPC 2.0 over stdio（NDJSON：一行一个消息）。
 *
 * 约定：
 * - stdout 只承载协议消息，任何日志一律走 stderr，否则会污染协议通道；
 * - 每条消息必须是单行（JSON.stringify 不带缩进）。
 */

/** 写日志到 stderr。 */
export function log(...args) {
  process.stderr.write(`[analyzer] ${args.map(String).join(' ')}\n`);
}

function write(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

/**
 * 启动 RPC 服务循环。
 * @param {Record<string, (params: any) => any>} handlers 方法名 → 处理函数（可返回 Promise）
 * @param {{ name?: string, version?: string, onShutdown?: () => void }} [opts]
 */
export function startRpcServer(handlers, opts = {}) {
  const { name = 'studio-analyzer', version = '0.1.0', onShutdown } = opts;

  let pending = 0;
  let closed = false;

  const maybeExit = () => {
    if (closed && pending === 0) {
      onShutdown?.();
      process.exit(0);
    }
  };

  process.stdin.setEncoding('utf8');
  let buffer = '';
  process.stdin.on('data', (chunk) => {
    buffer += chunk;
    let index = buffer.indexOf('\n');
    while (index >= 0) {
      const line = buffer.slice(0, index).trim();
      buffer = buffer.slice(index + 1);
      if (line) void handleLine(line);
      index = buffer.indexOf('\n');
    }
  });

  async function handleLine(line) {
    let req;
    try {
      req = JSON.parse(line);
    } catch (err) {
      log(`忽略非法 JSON 行：${err.message}`);
      return;
    }
    if (!req || typeof req.method !== 'string') {
      log('忽略缺少 method 的消息');
      return;
    }

    // 通知类消息（无 id）
    if (req.id === undefined || req.id === null) {
      if (req.method === 'shutdown') {
        closed = true;
        maybeExit();
      }
      return;
    }

    if (req.method === 'shutdown') {
      closed = true;
      write({ jsonrpc: '2.0', id: req.id, result: { ok: true } });
      maybeExit();
      return;
    }

    if (req.method === 'health') {
      write({
        jsonrpc: '2.0',
        id: req.id,
        result: { name, version, pid: process.pid, node: process.version },
      });
      return;
    }

    const fn = handlers[req.method];
    if (!fn) {
      write({
        jsonrpc: '2.0',
        id: req.id,
        error: { code: -32601, message: `未知方法：${req.method}` },
      });
      return;
    }

    pending += 1;
    try {
      const result = await fn(req.params ?? {});
      write({ jsonrpc: '2.0', id: req.id, result: result === undefined ? null : result });
    } catch (err) {
      write({
        jsonrpc: '2.0',
        id: req.id,
        error: {
          code: -32000,
          message: err && err.message ? err.message : String(err),
          data: typeof err?.code === 'string' ? err.code : undefined,
        },
      });
    } finally {
      pending -= 1;
      maybeExit();
    }
  }

  log(`已就绪，等待 JSON-RPC（node ${process.version}）`);
}
