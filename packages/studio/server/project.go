package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
)

// ProjectSource 从 analyzer 的探测结果里带回来的源码位置信息。
type ProjectSource struct {
	PagesDir     string            `json:"pagesDir"`
	Aliases      map[string]string `json:"aliases"`
	FrameworkSrc string            `json:"frameworkSrc"`
	DevPort      *int              `json:"devPort,omitempty"`
	MockBaseURL  string            `json:"mockBaseUrl,omitempty"`
	// 目标工程的 .env 家族合并结果（供预览宿主注入 import.meta.env）
	Env        map[string]string `json:"env,omitempty"`
	EnvSources map[string]string `json:"envSources,omitempty"`
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
}

// AllowedRoots 允许被读写的根：目标工程根 + 框架源码根 + 主题文件所在目录。
// 主题 token 落在 packages/framework 里属于「系统层改动」，是用户明确要求的能力。
func (p *Project) AllowedRoots() []string {
	roots := []string{p.RootPath}
	if p.Source.FrameworkSrc != "" {
		// FrameworkSrc 指向 .../packages/framework/src，取其上两级作为框架包根
		roots = append(roots, filepath.Dir(filepath.Dir(p.Source.FrameworkSrc)))
	}
	for _, f := range p.ThemeFiles {
		roots = append(roots, filepath.Dir(f))
	}
	return roots
}

// ResolvePath 校验并规范化一个绝对路径，确保它落在允许的根之内。
func (p *Project) ResolvePath(raw string) (string, error) {
	if raw == "" {
		return "", fmt.Errorf("路径为空")
	}
	real, err := resolveExisting(raw)
	if err != nil {
		return "", err
	}
	for _, root := range p.AllowedRoots() {
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

func (r *Registry) List() []*Project {
	r.mu.RLock()
	defer r.mu.RUnlock()
	out := make([]*Project, 0, len(r.byID))
	for _, p := range r.byID {
		out = append(out, p)
	}
	return out
}

func (r *Registry) Get(id string) (*Project, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	p, ok := r.byID[id]
	return p, ok
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
