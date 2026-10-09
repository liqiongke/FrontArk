package main

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

// SourceFile 一个参与分析的源码文件（内容随快照一起传给 analyzer）。
type SourceFile struct {
	File string `json:"file"`
	Text string `json:"text"`
}

var pageSourceExt = map[string]bool{".ts": true, ".tsx": true, ".js": true, ".jsx": true}

// maxFileSize 超过这个大小不做 AST 分析（降级为只读源码打开）。
const maxFileSize = 1 << 20

// ReadSource 读取一个文件（已做边界与大小校验）。
func (p *Project) ReadSource(abs string) (SourceFile, error) {
	full, err := p.ResolvePath(abs)
	if err != nil {
		return SourceFile{}, err
	}
	if err := checkEditableExtension(full); err != nil {
		return SourceFile{}, err
	}
	info, err := os.Stat(full)
	if err != nil {
		return SourceFile{}, err
	}
	if info.Size() > maxFileSize {
		return SourceFile{}, fmt.Errorf("文件超过 %dKB，已降级为只读：%s", maxFileSize/1024, filepath.Base(full))
	}
	raw, err := os.ReadFile(full)
	if err != nil {
		return SourceFile{}, err
	}
	return SourceFile{File: toSlash(full), Text: string(raw)}, nil
}

// CollectPageFiles 归集页面目录内一层的源码文件（与 analyzer 的口径一致）。
func (p *Project) CollectPageFiles(pageDir string) ([]SourceFile, error) {
	full, err := p.ResolvePath(pageDir)
	if err != nil {
		return nil, err
	}
	entries, err := os.ReadDir(full)
	if err != nil {
		return nil, err
	}
	names := make([]string, 0, len(entries))
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		if !pageSourceExt[strings.ToLower(filepath.Ext(e.Name()))] {
			continue
		}
		names = append(names, e.Name())
	}
	sort.Strings(names)

	out := make([]SourceFile, 0, len(names))
	for _, name := range names {
		f := filepath.Join(full, name)
		info, err := os.Stat(f)
		if err != nil || info.Size() > maxFileSize {
			continue
		}
		raw, err := os.ReadFile(f)
		if err != nil {
			continue
		}
		out = append(out, SourceFile{File: toSlash(f), Text: string(raw)})
	}
	return out, nil
}

// PageDirOf 由页面入口文件推出页面目录。
func (p *Project) PageDirOf(route string) (string, error) {
	pagesDir, err := p.ResolvePath(p.Source.PagesDir)
	if err != nil {
		return "", err
	}
	clean := strings.Trim(strings.TrimSpace(route), "/")
	if clean == "" {
		return pagesDir, nil
	}
	// 根目录页面要把 [...all] 之类的括号还原，路由与目录名一一对应
	dir := filepath.Join(pagesDir, filepath.FromSlash(clean))
	if !isWithin(pagesDir, dir) {
		return "", fmt.Errorf("非法路由：%s", route)
	}
	return dir, nil
}

// ReadMany 批量读取（用于主题文件等）。
func (p *Project) ReadMany(paths []string) ([]SourceFile, []string, error) {
	out := make([]SourceFile, 0, len(paths))
	failed := make([]string, 0)
	for _, path := range paths {
		f, err := p.ReadSource(path)
		if err != nil {
			failed = append(failed, toSlash(path))
			continue
		}
		out = append(out, f)
	}
	return out, failed, nil
}
