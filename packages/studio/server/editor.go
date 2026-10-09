package main

import (
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
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
//
// 这里是**唯一的命令来源**：请求体不能传命令，只能传上面这些 ID。
// 想接一个列表里没有的编辑器，走 -editor 启动参数或 POST /api/settings/editor
// （只允许回环地址调用），配置落在 Studio 自己的配置目录里。
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

// customEditorID 自定义命令模板在列表里的伪 ID。
const customEditorID = "__custom__"

// customCmdFile 自定义命令模板的落盘文件名（位于 Studio 配置目录）。
const customCmdFile = "editor-command.txt"

// EditorService 探测本机可用编辑器并负责唤起。
type EditorService struct {
	mu      sync.RWMutex
	cached  []Editor
	scanned bool
	// custom 是「自定义命令模板」，只从服务端配置读取（启动参数或本地设置接口），
	// 绝不从请求体读取 —— 否则 /api/open 就等价于任意命令执行。
	custom string
}

func NewEditorService(cfgDir string) *EditorService {
	s := &EditorService{}
	if cfgDir != "" {
		if raw, err := os.ReadFile(filepath.Join(cfgDir, customCmdFile)); err == nil {
			s.custom = strings.TrimSpace(string(raw))
		}
	}
	return s
}

// Custom 当前自定义命令模板。
func (s *EditorService) Custom() string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.custom
}

// SetCustom 写入自定义命令模板并落盘。
func (s *EditorService) SetCustom(cfgDir, template string) error {
	tpl := strings.TrimSpace(template)
	if tpl != "" {
		if err := validateCommandTemplate(tpl); err != nil {
			return err
		}
	}
	s.mu.Lock()
	s.custom = tpl
	s.mu.Unlock()
	if cfgDir == "" {
		return nil
	}
	path := filepath.Join(cfgDir, customCmdFile)
	if tpl == "" {
		_ = os.Remove(path)
		return nil
	}
	return writeFileAtomic(path, []byte(tpl+"\n"))
}

// shellMeta 会在 cmd / sh 里触发「命令串联 / 重定向 / 子命令」的字符。
// 模板本身是配置项而不是数据，所以这里不是消毒，而是"别让它长得像一条复合命令"。
const shellMeta = ";&|<>`\n\r()"

// validateCommandTemplate 校验自定义编辑器命令模板的基本结构。
//
// 真正的防线是「模板只能来自服务端配置、不进请求体」；这里再兜一层，
// 避免用户把一个会串联命令的模板（`a && b {file}`）存进配置里。
func validateCommandTemplate(tpl string) error {
	fields := strings.Fields(tpl)
	if len(fields) == 0 {
		return errors.New("命令模板为空")
	}
	if !strings.Contains(tpl, "{file}") && !strings.Contains(tpl, "{project}") {
		return errors.New("命令模板至少要包含 {file} 或 {project} 占位符")
	}
	if idx := strings.IndexAny(tpl, shellMeta); idx >= 0 {
		return fmt.Errorf("命令模板包含不允许的字符 %q（疑似命令串联）", string(tpl[idx]))
	}
	if strings.Contains(tpl, "$(") {
		return errors.New("命令模板不允许子命令替换 $(...)")
	}
	return nil
}

// List 探测本机 PATH 上可用的编辑器（结果缓存，scan=true 时强制重扫）。
func (s *EditorService) List(scan bool) []Editor {
	s.mu.RLock()
	if s.scanned && !scan {
		out := make([]Editor, len(s.cached))
		copy(out, s.cached)
		s.mu.RUnlock()
		return out
	}
	custom := s.custom
	s.mu.RUnlock()

	list := make([]Editor, 0, len(knownEditors)+1)
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
	// 自定义模板永远可见（它不依赖 PATH 探测，失败时由 /api/open 报错）
	if custom != "" {
		list = append(list, Editor{ID: customEditorID, Label: "自定义命令", Command: custom, Detected: true})
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
//
// 只接受 knownEditors 里的 ID（或自定义模板的伪 ID，模板取自服务端配置）。
// 请求体不参与命令构造，因此 /api/open 不可能变成任意命令执行入口。
func (s *EditorService) Open(editorID, file string, line, column int, projectRoot string) (string, error) {
	if line <= 0 {
		line = 1
	}
	if column <= 0 {
		column = 1
	}

	var argv []string
	if editorID == customEditorID {
		tpl := s.Custom()
		if tpl == "" {
			return "", errors.New("尚未配置自定义编辑器命令（编辑器下拉里可填写）")
		}
		if err := validateCommandTemplate(tpl); err != nil {
			return "", err
		}
		argv = replaceFields(strings.Fields(tpl), file, line, column, projectRoot)
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
		argv = append([]string{spec.Command}, replaceFields(spec.Args, file, line, column, projectRoot)...)
	}

	if len(argv) == 0 || strings.TrimSpace(argv[0]) == "" {
		return "", errors.New("命令为空")
	}
	if err := spawnDetached(argv); err != nil {
		return "", err
	}
	return strings.Join(argv, " "), nil
}

func replaceFields(args []string, file string, line, column int, projectRoot string) []string {
	out := make([]string, 0, len(args))
	for _, a := range args {
		out = append(out, replaceAll(a, file, line, column, projectRoot))
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
//
// 先把可执行文件解析成绝对路径，再由 shellCommand（平台相关）决定怎么启动：
// Windows 上 `.cmd` 必须经 cmd.exe，那里需要额外的参数转义，详见 editor_windows.go。
func spawnDetached(argv []string) error {
	if len(argv) == 0 {
		return errors.New("空命令")
	}
	program := argv[0]
	rest := argv[1:]

	resolved := program
	if p, err := exec.LookPath(program); err == nil {
		resolved = p
	} else if _, err := os.Stat(program); err != nil {
		return fmt.Errorf("找不到可执行文件：%s", program)
	}

	cmd := shellCommand(resolved, rest)
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("唤起编辑器失败：%w", err)
	}
	// 不等它退出：编辑器是长驻 GUI 进程
	go func() { _ = cmd.Wait() }()
	return nil
}

func isShellScript(path string) bool {
	switch strings.ToLower(filepath.Ext(path)) {
	case ".cmd", ".bat":
		return true
	}
	return false
}
