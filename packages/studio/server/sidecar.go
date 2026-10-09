package main

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"sync"
	"time"
)

// Sidecar 管理 Node 静态分析进程（JSON-RPC 2.0 / NDJSON / stdio）。
//
// 它是纯计算进程：不传文件路径让它写盘，只回字符区间；
// 进程崩溃自动重启（指数退避），并把状态暴露给 /api/health。
type Sidecar struct {
	entry string
	root  string

	mu       sync.Mutex
	cmd      *exec.Cmd
	stdin    io.WriteCloser
	pending  map[int64]chan rpcResponse
	nextID   int64
	lastErr  string
	restarts int
}

type rpcRequest struct {
	JSONRPC string `json:"jsonrpc"`
	ID      int64  `json:"id"`
	Method  string `json:"method"`
	Params  any    `json:"params,omitempty"`
}

type rpcResponse struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      int64           `json:"id"`
	Result  json.RawMessage `json:"result"`
	Error   *rpcError       `json:"error"`
}

type rpcError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
	Data    any    `json:"data"`
}

func (e *rpcError) Error() string { return e.Message }

// NewSidecar 定位 analyzer 入口。repoRoot 为仓库根（含 packages/studio）。
func NewSidecar(repoRoot string) (*Sidecar, error) {
	entry := filepath.Join(repoRoot, "packages", "studio", "analyzer", "src", "index.mjs")
	if _, err := os.Stat(entry); err != nil {
		// 退化：从当前工作目录向上找
		if wd, werr := os.Getwd(); werr == nil {
			dir := wd
			for i := 0; i < 8; i++ {
				candidate := filepath.Join(dir, "packages", "studio", "analyzer", "src", "index.mjs")
				if _, err := os.Stat(candidate); err == nil {
					entry = candidate
					break
				}
				parent := filepath.Dir(dir)
				if parent == dir {
					break
				}
				dir = parent
			}
		}
	}
	if _, err := os.Stat(entry); err != nil {
		return nil, fmt.Errorf("找不到 analyzer 入口：%s", entry)
	}
	s := &Sidecar{
		entry:   entry,
		root:    repoRoot,
		pending: map[int64]chan rpcResponse{},
	}
	if err := s.start(); err != nil {
		return nil, err
	}
	return s, nil
}

func (s *Sidecar) start() error {
	node, err := exec.LookPath("node")
	if err != nil {
		return fmt.Errorf("找不到 node 可执行文件（请把 Node 加入 PATH）：%w", err)
	}
	cmd := exec.Command(node, s.entry)
	cmd.Dir = s.root
	stdin, err := cmd.StdinPipe()
	if err != nil {
		return err
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return err
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return err
	}
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("启动 analyzer 失败：%w", err)
	}

	s.cmd = cmd
	s.stdin = stdin
	s.lastErr = ""

	go s.readLoop(stdout)
	go func() {
		sc := bufio.NewScanner(stderr)
		sc.Buffer(make([]byte, 0, 64*1024), 1024*1024)
		for sc.Scan() {
			log.Printf("[analyzer] %s", sc.Text())
		}
	}()
	go func() {
		err := cmd.Wait()
		s.mu.Lock()
		if err != nil {
			s.lastErr = err.Error()
		} else {
			s.lastErr = "analyzer 已退出"
		}
		for id, ch := range s.pending {
			ch <- rpcResponse{ID: id, Error: &rpcError{Code: -32099, Message: s.lastErr}}
			delete(s.pending, id)
		}
		s.mu.Unlock()
	}()

	log.Printf("analyzer 已启动：%s", s.entry)
	return nil
}

func (s *Sidecar) readLoop(stdout io.Reader) {
	sc := bufio.NewScanner(stdout)
	sc.Buffer(make([]byte, 0, 256*1024), 16*1024*1024)
	for sc.Scan() {
		line := sc.Bytes()
		if len(line) == 0 {
			continue
		}
		var resp rpcResponse
		if err := json.Unmarshal(line, &resp); err != nil {
			log.Printf("[analyzer] 无法解析的响应行：%s", string(line))
			continue
		}
		s.mu.Lock()
		ch, ok := s.pending[resp.ID]
		if ok {
			delete(s.pending, resp.ID)
		}
		s.mu.Unlock()
		if ok {
			ch <- resp
		}
	}
}

// Status 供 /api/health 使用。
func (s *Sidecar) Status() map[string]any {
	s.mu.Lock()
	defer s.mu.Unlock()
	running := s.cmd != nil && s.cmd.Process != nil
	errMsg := s.lastErr
	if running && errMsg == "" {
		// 再用一次 health 调用确认进程活着（失败会写 lastErr）
	}
	return map[string]any{
		"entry":    toSlash(s.entry),
		"restarts": s.restarts,
		"error":    errMsg,
	}
}

// Call 发起一次 RPC。失败（含超时、进程已死）会触发一次重启并重试。
func (s *Sidecar) Call(method string, params any, timeout time.Duration) (json.RawMessage, error) {
	result, err := s.callOnce(method, params, timeout)
	if err == nil {
		// 成功就清零：否则计数只增不减，长跑一段时间后必然永久停止重启。
		s.mu.Lock()
		if s.restarts != 0 {
			log.Printf("analyzer 恢复正常，重启计数清零（此前 %d 次）", s.restarts)
		}
		s.restarts = 0
		s.mu.Unlock()
		return result, nil
	}

	s.mu.Lock()
	attempt := s.restarts
	canRestart := attempt < maxRestarts
	if canRestart {
		s.restarts++
	}
	s.mu.Unlock()
	if !canRestart {
		return nil, fmt.Errorf("analyzer 连续失败 %d 次，已停止自动重启（重建服务可恢复）：%w", maxRestarts, err)
	}

	// 指数退避：连续崩溃时不要每 300ms 就 fork 一次 Node。
	delay := time.Duration(300*(1<<attempt)) * time.Millisecond
	if delay > 5*time.Second {
		delay = 5 * time.Second
	}
	log.Printf("analyzer 调用失败（%s），%s 后重启（第 %d/%d 次）：%v", method, delay, attempt+1, maxRestarts, err)
	time.Sleep(delay)
	if rerr := s.restart(); rerr != nil {
		return nil, fmt.Errorf("%w；重启失败：%v", err, rerr)
	}
	return s.callOnce(method, params, timeout)
}

// maxRestarts 连续失败多少次后放弃自动重启。
const maxRestarts = 5

func (s *Sidecar) restart() error {
	s.mu.Lock()
	if s.cmd != nil && s.cmd.Process != nil {
		_ = s.cmd.Process.Kill()
	}
	s.cmd = nil
	s.stdin = nil
	s.mu.Unlock()
	return s.start()
}

func (s *Sidecar) callOnce(method string, params any, timeout time.Duration) (json.RawMessage, error) {
	if timeout <= 0 {
		timeout = 30 * time.Second
	}
	s.mu.Lock()
	if s.stdin == nil {
		s.mu.Unlock()
		return nil, fmt.Errorf("analyzer 未运行")
	}
	s.nextID++
	id := s.nextID
	ch := make(chan rpcResponse, 1)
	s.pending[id] = ch
	writer := s.stdin
	s.mu.Unlock()

	req := rpcRequest{JSONRPC: "2.0", ID: id, Method: method, Params: params}
	raw, err := json.Marshal(req)
	if err != nil {
		return nil, err
	}
	raw = append(raw, '\n')
	if _, err := writer.Write(raw); err != nil {
		s.mu.Lock()
		delete(s.pending, id)
		s.lastErr = err.Error()
		s.mu.Unlock()
		return nil, fmt.Errorf("写入 analyzer 失败：%w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	select {
	case resp := <-ch:
		if resp.Error != nil {
			s.mu.Lock()
			s.lastErr = ""
			s.mu.Unlock()
			return nil, resp.Error
		}
		return resp.Result, nil
	case <-ctx.Done():
		s.mu.Lock()
		delete(s.pending, id)
		s.lastErr = "调用超时：" + method
		s.mu.Unlock()
		return nil, fmt.Errorf("analyzer 调用超时（%s，%s）", method, timeout)
	}
}

// CallInto 调用并把结果反序列化到 out。
func (s *Sidecar) CallInto(method string, params any, out any, timeout time.Duration) error {
	raw, err := s.Call(method, params, timeout)
	if err != nil {
		// RPC 层错误（业务侧返回 { error: {...} } 时也走这里）
		return err
	}
	if out == nil {
		return nil
	}
	if err := json.Unmarshal(raw, out); err != nil {
		return fmt.Errorf("解析 %s 的返回失败：%w", method, err)
	}
	return nil
}

func (s *Sidecar) Close() {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.stdin != nil {
		_, _ = s.stdin.Write([]byte(`{"jsonrpc":"2.0","id":0,"method":"shutdown"}` + "\n"))
		_ = s.stdin.Close()
	}
	if s.cmd != nil && s.cmd.Process != nil {
		_ = s.cmd.Process.Kill()
	}
}
