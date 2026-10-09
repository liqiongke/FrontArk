package main

import (
	"crypto/sha1"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"
)

// ── JSON 输出 ──────────────────────────────────────────────────────

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	enc := json.NewEncoder(w)
	enc.SetEscapeHTML(false)
	_ = enc.Encode(payload)
}

func writeErr(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]any{"message": msg})
}

// okPayload 统一成功信封：{ ok, data }。
//
// 诊断/元信息不塞进信封：它们要么挂在 data 里（随使用方定义），
// 要么由失败路径的 { ok:false, message, code } 表达 —— 说清楚比"什么都放"更好用。
func okPayload(data any) map[string]any {
	return map[string]any{"ok": true, "data": data}
}

// ── 哈希与路径 ─────────────────────────────────────────────────────

func sha1Hex(s string) string {
	sum := sha1.Sum([]byte(s))
	return hex.EncodeToString(sum[:])
}

func toSlash(p string) string { return filepath.ToSlash(p) }

// isWithin 判断 target 是否在 root 之内（纯字符串前缀比对，调用前须先规范化）。
func isWithin(root, target string) bool {
	root = filepath.Clean(root)
	target = filepath.Clean(target)
	if root == target {
		return true
	}
	rel, err := filepath.Rel(root, target)
	if err != nil {
		return false
	}
	return rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator))
}

// resolveExisting 把路径解析为真实路径（消解 symlink/junction），
// 对不存在的路径则向上找到最近的已存在祖先再拼接。
func resolveExisting(path string) (string, error) {
	abs, err := filepath.Abs(path)
	if err != nil {
		return "", err
	}
	cur := filepath.Clean(abs)
	var tail []string
	for {
		real, err := filepath.EvalSymlinks(cur)
		if err == nil {
			if len(tail) == 0 {
				return real, nil
			}
			parts := append([]string{real}, reverse(tail)...)
			return filepath.Join(parts...), nil
		}
		if !os.IsNotExist(err) {
			// 其它错误（权限等）不再深挖，按原路径返回交由后续校验
			return abs, nil
		}
		parent := filepath.Dir(cur)
		if parent == cur {
			return abs, nil
		}
		tail = append(tail, filepath.Base(cur))
		cur = parent
	}
}

func reverse(in []string) []string {
	out := make([]string, len(in))
	for i, v := range in {
		out[len(in)-1-i] = v
	}
	return out
}

// 允许被结构化编辑的文件类型。
var editableExt = map[string]bool{
	".ts": true, ".tsx": true, ".js": true, ".jsx": true, ".json": true, ".css": true,
}

// blockedDir 命中的目录段一律拒绝读写。这些目录里是产物或依赖，
// 被写坏既没有价值、又会造成难以排查的问题。
var blockedDir = map[string]bool{
	"node_modules": true, "dist": true, "dist-desktop": true, ".git": true,
	".turbo": true, "build": true, "coverage": true, "target": true, "gen": true,
}

// maxEditableBytes 单文件上限：超过则不做结构化编辑（可由 /api/source 只读查看）。
const maxEditableBytes = 1 << 20 // 1 MiB

func checkEditableExtension(path string) error {
	ext := strings.ToLower(filepath.Ext(path))
	if !editableExt[ext] {
		return fmt.Errorf("不允许编辑该类型文件：%s", ext)
	}
	return nil
}

// checkBlockedDir 拒绝落在产物/依赖目录里的路径。
// 按路径段比对，所以 `dist` 只匹配真正的目录段，不会误伤 `dist-utils.ts`。
func checkBlockedDir(path string) error {
	clean := filepath.ToSlash(filepath.Clean(path))
	for _, seg := range strings.Split(clean, "/") {
		if seg == "" || seg == "." {
			continue
		}
		if blockedDir[strings.ToLower(seg)] {
			return fmt.Errorf("不允许编辑 %s 目录下的文件：%s", seg, clean)
		}
	}
	return nil
}

// checkEditablePath 一次做完扩展名 + 目录黑名单校验（写盘前唯一入口）。
func checkEditablePath(path string) error {
	if err := checkEditableExtension(path); err != nil {
		return err
	}
	return checkBlockedDir(path)
}

// ── 值掩码 ─────────────────────────────────────────────────────────

// sensitiveKey 判断一个环境变量名是否属于「不该明文下发/落盘」的类别。
// 目标工程的 .env 里 VITE_* 本来就会进前端 bundle，但 Token / 密钥这类值
// 没有任何理由出现在 Studio 的响应或配置目录里。
var sensitiveKey = regexp.MustCompile(`(?i)(token|secret|password|passwd|pwd|apikey|api_key|credential|private|auth)`)

func isSensitiveKey(k string) bool { return sensitiveKey.MatchString(k) }

const maskedValue = "******"

// maskEnv 返回脱敏副本；同时给出被掩码的键名清单（供 UI 提示）。
func maskEnv(env map[string]string) (map[string]string, []string) {
	if len(env) == 0 {
		return map[string]string{}, nil
	}
	out := make(map[string]string, len(env))
	masked := make([]string, 0, 4)
	for k, v := range env {
		if isSensitiveKey(k) && v != "" {
			out[k] = maskedValue
			masked = append(masked, k)
			continue
		}
		out[k] = v
	}
	sort.Strings(masked)
	return out, masked
}

// ── 原子写 ─────────────────────────────────────────────────────────

// writeFileAtomic 备份 <name>.bak → 写临时文件 → fsync → rename 原子替换。
// 与参考实现（blade_and_hearth_idle/editor/server/store.go）同策略。
func writeFileAtomic(path string, content []byte) error {
	dir := filepath.Dir(path)
	if _, err := os.Stat(path); err == nil {
		if err := copyFile(path, path+".bak"); err != nil {
			return fmt.Errorf("备份失败：%w", err)
		}
	}
	tmp, err := os.CreateTemp(dir, ".tmp-studio-*")
	if err != nil {
		return fmt.Errorf("创建临时文件失败：%w", err)
	}
	tmpName := tmp.Name()
	defer func() { _ = os.Remove(tmpName) }()

	if _, err := tmp.Write(content); err != nil {
		_ = tmp.Close()
		return fmt.Errorf("写入临时文件失败：%w", err)
	}
	if err := tmp.Sync(); err != nil {
		_ = tmp.Close()
		return fmt.Errorf("刷盘失败：%w", err)
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	if err := os.Rename(tmpName, path); err != nil {
		return fmt.Errorf("替换文件失败：%w", err)
	}
	return nil
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	if _, err := io.Copy(out, in); err != nil {
		_ = out.Close()
		return err
	}
	return out.Close()
}

// ── 时间 ───────────────────────────────────────────────────────────

func nowISO() string { return time.Now().UTC().Format(time.RFC3339Nano) }

// ── 进度/错误 ──────────────────────────────────────────────────────

var errNotFound = errors.New("资源不存在")
