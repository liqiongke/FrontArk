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

// okPayload 统一成功信封：{ ok, data, issues, meta }
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

var blockedDir = map[string]bool{
	"node_modules": true, "dist": true, "dist-desktop": true, ".git": true,
	".turbo": true, "build": true, "coverage": true,
}

func checkEditableExtension(path string) error {
	ext := strings.ToLower(filepath.Ext(path))
	if !editableExt[ext] {
		return fmt.Errorf("不允许编辑该类型文件：%s", ext)
	}
	return nil
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
