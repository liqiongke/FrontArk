package main

import (
	"fmt"
	"os/exec"
	"runtime"
	"strings"
	"sync"
)

// Editor 一个可唤起的外部编辑器。
type Editor struct {
	ID       string   `json:"id"`
	Label    string   `json:"label"`
	Command  string   `json:"command"`
	Args     []string `json:"args"`
	Detected bool     `json:"detected"`
	Path     string   `json:"path,omitempty"`
}

// knownEditors 覆盖主流 VS Code 系（含各家改造版）与常见编辑器。
// 用户还可以在项目设置里写自定义命令模板（{file} / {line} / {column}）。
var knownEditors = []Editor{
	{ID: "code", Label: "VS Code", Command: "code", Args: []string{"-g", "{file}:{line}:{column}"}},
	{ID: "code-insiders", Label: "VS Code Insiders", Command: "code-insiders", Args: []string{"-g", "{file}:{line}:{column}"}},
	{ID: "cursor", Label: "Cursor", Command: "cursor", Args: []string{"-g", "{file}:{line}:{column}"}},
	{ID: "windsurf", Label: "Windsurf", Command: "windsurf", Args: []string{"-g", "{file}:{line}:{column}"}},
	{ID: "trae", Label: "Trae", Command: "trae", Args: []string{"-g", "{file}:{line}:{column}"}},
	{ID: "trae-cn", Label: "Trae CN", Command: "trae-cn", Args: []string{"-g", "{file}:{line}:{column}"}},
	{ID: "vscodium", Label: "VSCodium", Command: "codium", Args: []string{"-g", "{file}:{line}:{column}"}},
	{ID: "positron", Label: "Positron", Command: "positron", Args: []string{"-g", "{file}:{line}:{column}"}},
	{ID: "qoder", Label: "Qoder", Command: "qoder", Args: []string{"-g", "{file}:{line}:{column}"}},
	{ID: "kiro", Label: "Kiro", Command: "kiro", Args: []string{"-g", "{file}:{line}:{column}"}},
	{ID: "webstorm", Label: "WebStorm", Command: "webstorm", Args: []string{"--line", "{line}", "{file}"}},
	{ID: "idea", Label: "IntelliJ IDEA", Command: "idea", Args: []string{"--line", "{line}", "{file}"}},
	{ID: "sublime", Label: "Sublime Text", Command: "subl", Args: []string{"{file}:{line}:{column}"}},
	{ID: "notepadpp", Label: "Notepad++", Command: "notepad++", Args: []string{"-n{line}", "{file}"}},
}

// EditorService 探测本机可用编辑器并负责唤起。
type EditorService struct {
	mu      sync.RWMutex
	cached  []Editor
	scanned bool
}

func NewEditorService() *EditorService { return &EditorService{} }

// List 探测本机 PATH 上可用的编辑器（结果缓存，scan=true 时强制重扫）。
func (s *EditorService) List(scan bool) []Editor {
	s.mu.RLock()
	if s.scanned && !scan {
		out := make([]Editor, len(s.cached))
		copy(out, s.cached)
		s.mu.RUnlock()
		return out
	}
	s.mu.RUnlock()

	list := make([]Editor, 0, len(knownEditors))
	for _, e := range knownEditors {
		found, err := exec.LookPath(e.Command)
		if err != nil {
			continue
		}
		item := e
		item.Detected = true
		item.Path = found
		if label := editorDisplayName(found); label != "" {
			item.Label = label
		}
		list = append(list, item)
	}

	s.mu.Lock()
	s.cached = list
	s.scanned = true
	s.mu.Unlock()
	return list
}

// 从可执行路径里提取进程名，帮助用户确认到底唤起的是哪一个（多个改造版常同名不同目录）。
func editorDisplayName(path string) string {
	base := path
	if idx := strings.LastIndexAny(path, `\/`); idx >= 0 {
		base = path[idx+1:]
	}
	if base == "" {
		return ""
	}
	return base
}

// Open 用指定编辑器打开文件并定位到行列。
// commandTemplate 非空时优先使用（支持 {file} / {line} / {column} / {project}）。
func (s *EditorService) Open(editorID, commandTemplate, file string, line, column int, projectRoot string) (string, error) {
	if line <= 0 {
		line = 1
	}
	if column <= 0 {
		column = 1
	}

	var argv []string
	if strings.TrimSpace(commandTemplate) != "" {
		argv = splitCommandTemplate(commandTemplate, file, line, column, projectRoot)
		if len(argv) == 0 {
			return "", fmt.Errorf("自定义编辑器命令为空")
		}
	} else {
		var spec Editor
		found := false
		for _, e := range s.List(false) {
			if e.ID == editorID {
				spec = e
				found = true
				break
			}
		}
		if !found {
			return "", fmt.Errorf("编辑器未安装或不在 PATH 上：%s", editorID)
		}
		argv = append([]string{spec.Command}, resolveArgs(spec.Args, file, line, column, projectRoot)...)
	}

	if err := spawnDetached(argv); err != nil {
		return "", err
	}
	return strings.Join(argv, " "), nil
}

func resolveArgs(args []string, file string, line, column int, projectRoot string) []string {
	out := make([]string, 0, len(args))
	for _, a := range args {
		out = append(out, replaceAll(a, file, line, column, projectRoot))
	}
	return out
}

// splitCommandTemplate 把模板按空白拆成 argv，并对占位符做替换。
// 只做最朴素的分词（不解析引号），因为这是本机受信配置。
func splitCommandTemplate(tpl, file string, line, column int, projectRoot string) []string {
	fields := strings.Fields(tpl)
	out := make([]string, 0, len(fields))
	for _, f := range fields {
		out = append(out, replaceAll(f, file, line, column, projectRoot))
	}
	return out
}

func replaceAll(s, file string, line, column int, projectRoot string) string {
	r := strings.NewReplacer(
		"{file}", file,
		"{line}", fmt.Sprintf("%d", line),
		"{column}", fmt.Sprintf("%d", column),
		"{project}", projectRoot,
	)
	return r.Replace(s)
}

// spawnDetached 启动外部进程但不等待它结束。
// Windows 上 .cmd/.bat（VS Code 的安装形态）必须经 cmd /c 才能执行。
func spawnDetached(argv []string) error {
	if len(argv) == 0 {
		return fmt.Errorf("空命令")
	}
	var cmd *exec.Cmd
	if runtime.GOOS == "windows" {
		args := append([]string{"/c"}, argv...)
		cmd = exec.Command("cmd", args...)
	} else {
		cmd = exec.Command(argv[0], argv[1:]...)
	}
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("唤起编辑器失败：%w", err)
	}
	// 不等它退出：编辑器是长驻 GUI 进程
	go func() { _ = cmd.Wait() }()
	return nil
}
