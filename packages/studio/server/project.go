package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
)

// ProjectSource 从 analyzer 的探测结果里带回来的源码位置信息。
//
// Env / EnvSources 是**内存态**：探测时读进来，但序列化时一律丢掉。
// 用自定义 Marshal/Unmarshal 而不是 `json:"-"`，因为后者会把反序列化也一起屏蔽 ——
// 探测结果就再也读不进来了。这样正好同时满足两件事：
//   - 从 analyzer 的探测结果**读得进** env；
//   - 写 projects.json 与任何 HTTP 响应时**带不出** env（里面可能有 Token）。
type ProjectSource struct {
	PagesDir     string
	Aliases      map[string]string
	FrameworkSrc string
	DevPort      *int
	MockBaseURL  string
	Env          map[string]string
	EnvSources   map[string]string
}

// projectSourceWire 是 ProjectSource 的可序列化投影。
// 持久化用**不带 env** 的那一半，读取探测结果用**带 env** 的那一半。
type projectSourceWire struct {
	PagesDir     string            `json:"pagesDir"`
	Aliases      map[string]string `json:"aliases,omitempty"`
	FrameworkSrc string            `json:"frameworkSrc"`
	DevPort      *int              `json:"devPort,omitempty"`
	MockBaseURL  string            `json:"mockBaseUrl,omitempty"`
	Env          map[string]string `json:"env,omitempty"`
	EnvSources   map[string]string `json:"envSources,omitempty"`
}

// MarshalJSON 只输出非敏感字段（env 不进配置文件、不进响应）。
func (s ProjectSource) MarshalJSON() ([]byte, error) {
	return json.Marshal(projectSourceWire{
		PagesDir:     s.PagesDir,
		Aliases:      s.Aliases,
		FrameworkSrc: s.FrameworkSrc,
		DevPort:      s.DevPort,
		MockBaseURL:  s.MockBaseURL,
	})
}

// UnmarshalJSON 接受完整形状（含 env），用于读取 analyzer 的探测结果。
func (s *ProjectSource) UnmarshalJSON(raw []byte) error {
	var w projectSourceWire
	if err := json.Unmarshal(raw, &w); err != nil {
		return err
	}
	s.PagesDir = w.PagesDir
	s.Aliases = w.Aliases
	s.FrameworkSrc = w.FrameworkSrc
	s.DevPort = w.DevPort
	s.MockBaseURL = w.MockBaseURL
	s.Env = w.Env
	s.EnvSources = w.EnvSources
	return nil
}

// Project 一个被 Studio 接管的「目标工程」。
type Project struct {
	ID            string        `json:"id"`
	Name          string        `json:"name"`
	PackageName   string        `json:"packageName,omitempty"`
	RootPath      string        `json:"rootPath"`
	WorkspaceRoot string        `json:"workspaceRoot"`
	Kind          string        `json:"kind"`
	HasFramework  bool          `json:"hasFramework"`
	Source        ProjectSource `json:"source"`
	ThemeFiles    []string      `json:"themeFiles"`
	Notes         []string      `json:"notes"`
	Warnings      []string      `json:"warnings"`
	CreatedAt     string        `json:"createdAt"`

	// envLoaded 是运行期标记：Env 不落盘，服务重启后需要按需重新探测一次。
	envLoaded bool
}

// readRoots 允许**读取**的根：目标工程 + 框架源码。
// 读框架源码是为了在右栏「源码」里查看接口定义与枚举来源，不涉及写入。
func (p *Project) readRoots() []string {
	roots := []string{p.RootPath}
	if p.Source.FrameworkSrc != "" {
		roots = append(roots, p.Source.FrameworkSrc)
	}
	return roots
}

// ResolvePath 校验并规范化一个绝对路径，确保它落在允许**读取**的根之内。
// 注意：写入另有更严格的 ResolveWritePath。
func (p *Project) ResolvePath(raw string) (string, error) {
	return p.resolveWithin(raw, p.readRoots())
}

// ResolveWritePath 校验并规范化一个**可写**路径。
//
// 写权限刻意比读权限窄得多：
//   - 目标工程根内：放行（再受扩展名 + 目录黑名单约束）；
//   - 工程之外：**只允许逐文件列出的 ThemeFiles**，而不是它们所在的目录。
//     早期实现把整个 packages/framework 放进白名单，导致一次主题编辑就能
//     把 .bak 写进框架源码树 —— 这里收紧到「一个一个文件」。
func (p *Project) ResolveWritePath(raw string) (string, error) {
	if raw == "" {
		return "", fmt.Errorf("路径为空")
	}
	real, err := resolveExisting(raw)
	if err != nil {
		return "", err
	}
	if root, err := resolveExisting(p.RootPath); err == nil && isWithin(root, real) {
		return filepath.Clean(real), nil
	}
	target := normalizePath(real)
	for _, f := range p.ThemeFiles {
		realFile, err := resolveExisting(f)
		if err != nil {
			continue
		}
		if normalizePath(realFile) == target {
			return filepath.Clean(realFile), nil
		}
	}
	return "", fmt.Errorf("路径越界（不在该项目允许写入的范围内）：%s", raw)
}

func (p *Project) resolveWithin(raw string, roots []string) (string, error) {
	if raw == "" {
		return "", fmt.Errorf("路径为空")
	}
	real, err := resolveExisting(raw)
	if err != nil {
		return "", err
	}
	for _, root := range roots {
		realRoot, err := resolveExisting(root)
		if err != nil {
			continue
		}
		if isWithin(realRoot, real) {
			return filepath.Clean(real), nil
		}
	}
	return "", fmt.Errorf("路径越界（不在该项目允许的根目录内）：%s", raw)
}

// ── 注册表 ─────────────────────────────────────────────────────────

type registryFile struct {
	Projects []*Project `json:"projects"`
}

// Registry 项目注册表，落盘在用户配置目录（不污染目标工程与 git）。
type Registry struct {
	mu   sync.RWMutex
	path string
	byID map[string]*Project
}

func NewRegistry(configDir string) (*Registry, error) {
	if err := os.MkdirAll(configDir, 0o755); err != nil {
		return nil, err
	}
	r := &Registry{path: filepath.Join(configDir, "projects.json"), byID: map[string]*Project{}}
	raw, err := os.ReadFile(r.path)
	if err != nil {
		if os.IsNotExist(err) {
			return r, nil
		}
		return nil, err
	}
	var f registryFile
	if err := json.Unmarshal(raw, &f); err != nil {
		return nil, fmt.Errorf("解析 %s 失败：%w", r.path, err)
	}
	for _, p := range f.Projects {
		if p != nil && p.ID != "" {
			r.byID[p.ID] = p
		}
	}
	return r, nil
}

func (r *Registry) Path() string { return r.path }

// List 返回深拷贝。调用方可能在锁外读写这些结构（例如按需补探测环境变量），
// 直接下发共享指针会与 Put/Delete 形成 data race。
func (r *Registry) List() []*Project {
	r.mu.RLock()
	defer r.mu.RUnlock()
	out := make([]*Project, 0, len(r.byID))
	for _, p := range r.byID {
		out = append(out, p.Clone())
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ID < out[j].ID })
	return out
}

// Get 返回深拷贝，理由同 List。
func (r *Registry) Get(id string) (*Project, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	p, ok := r.byID[id]
	if !ok {
		return nil, false
	}
	return p.Clone(), true
}

// Update 在一个写锁内读改写，避免「读出 → 改 → 写回」之间被其它请求插队。
func (r *Registry) Update(id string, mutate func(*Project)) (*Project, bool) {
	r.mu.Lock()
	defer r.mu.Unlock()
	p, ok := r.byID[id]
	if !ok {
		return nil, false
	}
	mutate(p)
	if err := r.saveLocked(); err != nil {
		// 保存失败不回滚内存态：下次 Put/Update 会再写一遍。
		return p.Clone(), true
	}
	return p.Clone(), true
}

// Clone 深拷贝项目（含 map / slice），供跨锁传递。
func (p *Project) Clone() *Project {
	if p == nil {
		return nil
	}
	out := *p
	// 用非 nil 空切片而非 append(..., nil...)：nil 切片会被 json 序列化成 null，
	// 而前端把这些字段声明为 string[]，一旦读 .length 就会崩（如 project.warnings）。
	out.ThemeFiles = append([]string{}, p.ThemeFiles...)
	out.Notes = append([]string{}, p.Notes...)
	out.Warnings = append([]string{}, p.Warnings...)
	out.Source = p.Source.clone()
	return &out
}

func (s ProjectSource) clone() ProjectSource {
	out := s
	if s.Aliases != nil {
		out.Aliases = make(map[string]string, len(s.Aliases))
		for k, v := range s.Aliases {
			out.Aliases[k] = v
		}
	}
	if s.Env != nil {
		out.Env = make(map[string]string, len(s.Env))
		for k, v := range s.Env {
			out.Env[k] = v
		}
	}
	if s.EnvSources != nil {
		out.EnvSources = make(map[string]string, len(s.EnvSources))
		for k, v := range s.EnvSources {
			out.EnvSources[k] = v
		}
	}
	return out
}

func (r *Registry) Put(p *Project) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.byID[p.ID] = p
	return r.saveLocked()
}

func (r *Registry) Delete(id string) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	delete(r.byID, id)
	return r.saveLocked()
}

func (r *Registry) saveLocked() error {
	list := make([]*Project, 0, len(r.byID))
	for _, p := range r.byID {
		list = append(list, p)
	}
	raw, err := json.MarshalIndent(registryFile{Projects: list}, "", "  ")
	if err != nil {
		return err
	}
	return writeFileAtomic(r.path, append(raw, '\n'))
}

// FindByRoot 按根路径查找（用于「重复注册同一个目录」时复用已有项目）。
func (r *Registry) FindByRoot(root string) (*Project, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	target := normalizePath(root)
	for _, p := range r.byID {
		if normalizePath(p.RootPath) == target {
			return p, true
		}
	}
	return nil, false
}

func normalizePath(p string) string {
	abs, err := filepath.Abs(p)
	if err != nil {
		return strings.ToLower(filepath.ToSlash(p))
	}
	return strings.ToLower(filepath.ToSlash(abs))
}
