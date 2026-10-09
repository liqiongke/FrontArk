package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sort"
	"sync"
	"time"
	"unicode/utf16"
)

// PlanEdit 一条字符区间替换。
type PlanEdit struct {
	File    string `json:"file"`
	Start   int    `json:"start"`
	End     int    `json:"end"`
	NewText string `json:"newText"`
}

// PlanFile 一个文件上的全部编辑 + 期望内容（用于 apply 时比对，防漂移）。
type PlanFile struct {
	File     string     `json:"file"`
	Edits    []PlanEdit `json:"edits"`
	NextText string     `json:"nextText,omitempty"`
	SHA      string     `json:"sha,omitempty"`
}

// EditPlan 服务端登记的编辑计划。前端只拿 planId，
// apply 时用的区间恒以服务端登记的为准 —— 前端无法提交任意写入范围。
type EditPlan struct {
	ID        string           `json:"id"`
	ProjectID string           `json:"projectId"`
	Route     string           `json:"route"`
	Title     string           `json:"title"`
	Files     []PlanFile       `json:"files"`
	Impacts   []map[string]any `json:"impacts"`
	Uncovered []map[string]any `json:"uncovered,omitempty"`
	Warnings  []string         `json:"warnings,omitempty"`
	Noop      bool             `json:"noop,omitempty"`
	CreatedAt time.Time        `json:"createdAt"`
}

// FileSnapshot 一次编辑前后的文件内容（撤销/重做的依据）。
type FileSnapshot struct {
	Path      string `json:"path"`
	Before    string `json:"before"`
	After     string `json:"after"`
	SHABefore string `json:"shaBefore"`
	SHAAfter  string `json:"shaAfter"`
}

// EditRecord 一条已应用的编辑记录。
type EditRecord struct {
	ID        string           `json:"id"`
	ProjectID string           `json:"projectId"`
	Route     string           `json:"route"`
	Title     string           `json:"title"`
	At        string           `json:"at"`
	Files     []FileSnapshot   `json:"files"`
	Impacts   []map[string]any `json:"impacts,omitempty"`
}

// EditManager 管理编辑计划缓存、应用与历史（per-project 串行）。
type EditManager struct {
	mu      sync.Mutex
	plans   map[string]*EditPlan
	history map[string][]*EditRecord
	undo    map[string][]string
	redo    map[string][]string
	dir     string
	locks   map[string]*sync.Mutex
}

func NewEditManager(configDir string) *EditManager {
	m := &EditManager{
		plans:   map[string]*EditPlan{},
		history: map[string][]*EditRecord{},
		undo:    map[string][]string{},
		redo:    map[string][]string{},
		locks:   map[string]*sync.Mutex{},
		dir:     filepath.Join(configDir, "history"),
	}
	_ = os.MkdirAll(m.dir, 0o755)
	return m
}

func (m *EditManager) projectLock(id string) *sync.Mutex {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.locks[id] == nil {
		m.locks[id] = &sync.Mutex{}
	}
	return m.locks[id]
}

// ProjectLock 暴露 per-project 串行锁，供「读快照 + 记基线」的调用方使用。
// 与 Apply / Switch 用的是同一把锁，因此快照一定取在两次写盘之间。
func (m *EditManager) ProjectLock(id string) *sync.Mutex { return m.projectLock(id) }

func (m *EditManager) PutPlan(plan *EditPlan) {
	m.mu.Lock()
	defer m.mu.Unlock()
	// 计划缓存上限：只留最近 200 条
	if len(m.plans) > 200 {
		var oldestID string
		var oldest time.Time
		for id, p := range m.plans {
			if oldestID == "" || p.CreatedAt.Before(oldest) {
				oldestID, oldest = id, p.CreatedAt
			}
		}
		delete(m.plans, oldestID)
	}
	plan.CreatedAt = time.Now()
	m.plans[plan.ID] = plan
}

func (m *EditManager) GetPlan(id string) (*EditPlan, bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	p, ok := m.plans[id]
	return p, ok
}

func (m *EditManager) DropPlan(id string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.plans, id)
}

// ── 应用编辑 ───────────────────────────────────────────────────────

// ErrStale 表示「计划生成之后，磁盘上的目标文件被改过」。
// 单列出来是为了让 HTTP 层回 409（冲突，可重试）而不是 400（请求有错）。
var ErrStale = errors.New("文件内容已变化，编辑计划失效")

// StaleError 带上具体文件，前端的提示才说得清是哪一个文件被外部改了。
type StaleError struct {
	File   string
	Reason string
}

func (e *StaleError) Error() string {
	return fmt.Sprintf("%s：%s", e.File, e.Reason)
}

func (e *StaleError) Is(target error) bool { return target == ErrStale }

// applyTextEdits 在内存里应用区间替换（降序处理，校验不重叠/不越界）。
//
// 关键：analyzer 给出的偏移是 **UTF-16 code unit** 偏移（TypeScript Compiler API
// 与 JS 字符串同口径），而 Go 的 []byte / []rune 都是 UTF-8 口径。源码里一旦出现
// 中文（本项目到处都是注释与 title），两种口径就会错位 —— 所以这里统一改用
// utf16.Encode 后的切片做区间运算，再解码回字符串。
func applyTextEdits(text string, edits []PlanEdit) (string, error) {
	sorted := append([]PlanEdit(nil), edits...)
	sort.Slice(sorted, func(i, j int) bool { return sorted[i].Start > sorted[j].Start })

	units := utf16.Encode([]rune(text))
	lastStart := len(units) + 1

	for _, e := range sorted {
		if e.Start < 0 || e.End > len(units) || e.Start > e.End {
			return "", fmt.Errorf("编辑区间越界：[%d, %d]（文件长度 %d 个 UTF-16 单元）", e.Start, e.End, len(units))
		}
		if e.End > lastStart {
			return "", fmt.Errorf("编辑区间重叠：[%d, %d]", e.Start, e.End)
		}
		lastStart = e.Start

		replacement := utf16.Encode([]rune(e.NewText))
		next := make([]uint16, 0, len(units)-(e.End-e.Start)+len(replacement))
		next = append(next, units[:e.Start]...)
		next = append(next, replacement...)
		next = append(next, units[e.End:]...)
		units = next
	}
	return string(utf16.Decode(units)), nil
}

// Apply 执行一个编辑计划：逐文件校验 sha → 应用 → 原子写 → 记历史。
func (m *EditManager) Apply(p *Project, planID string, hub *Hub) (*EditRecord, error) {
	plan, ok := m.GetPlan(planID)
	if !ok {
		return nil, fmt.Errorf("编辑计划不存在或已过期，请重新生成")
	}
	if plan.ProjectID != p.ID {
		return nil, fmt.Errorf("编辑计划不属于当前项目")
	}
	if plan.Noop || len(plan.Files) == 0 {
		m.DropPlan(planID)
		return nil, nil
	}

	lock := m.projectLock(p.ID)
	lock.Lock()
	defer lock.Unlock()

	record := &EditRecord{
		ID:        fmt.Sprintf("e%d", time.Now().UnixNano()),
		ProjectID: p.ID,
		Route:     plan.Route,
		Title:     plan.Title,
		At:        nowISO(),
		Impacts:   plan.Impacts,
	}

	// 第一阶段：全部读入 + 校验 + 计算新内容（任一失败即整体放弃，不写半个）
	type prepared struct {
		path   string
		before string
		after  string
	}
	preparedFiles := make([]prepared, 0, len(plan.Files))
	for _, pf := range plan.Files {
		// 写权限比读权限窄：只允许工程根内 + 逐文件列出的主题文件。
		full, err := p.ResolveWritePath(pf.File)
		if err != nil {
			return nil, err
		}
		if err := checkEditablePath(full); err != nil {
			return nil, err
		}
		info, err := os.Stat(full)
		if err != nil {
			return nil, fmt.Errorf("读取 %s 失败：%w", filepath.Base(full), err)
		}
		if info.Size() > maxEditableBytes {
			return nil, fmt.Errorf("%s 超过 %d KiB，已拒绝结构化编辑（可用源码面板只读查看）",
				filepath.Base(full), maxEditableBytes>>10)
		}
		raw, err := os.ReadFile(full)
		if err != nil {
			return nil, fmt.Errorf("读取 %s 失败：%w", filepath.Base(full), err)
		}
		before := string(raw)
		// 基线必须存在：没有基线就无从判断"计划是不是针对这份内容生成的"。
		// 早期实现允许 pf.SHA == "" 短路，等于关掉了乐观锁。
		if pf.SHA == "" {
			return nil, fmt.Errorf("编辑计划缺少基线哈希，已拒绝应用：%s", toSlash(full))
		}
		if sha1Hex(before) != pf.SHA {
			return nil, &StaleError{File: toSlash(full), Reason: "文件已被外部修改，请刷新后重试"}
		}
		after, err := applyTextEdits(before, pf.Edits)
		if err != nil {
			return nil, fmt.Errorf("%s：%w", filepath.Base(full), err)
		}
		if pf.NextText != "" && after != pf.NextText {
			return nil, &StaleError{File: toSlash(full), Reason: "结果与计划基线不一致"}
		}
		preparedFiles = append(preparedFiles, prepared{path: full, before: before, after: after})
	}

	// 第二阶段：写盘（已备份，失败即中止并报告已写清单）
	written := make([]string, 0, len(preparedFiles))
	for _, pf := range preparedFiles {
		if err := writeFileAtomic(pf.path, []byte(pf.after)); err != nil {
			m.DropPlan(planID)
			// 关键：前面的文件已经落盘了。若不把这条记录推进历史，undo 栈里就没有它，
			// 用户只能靠 .bak 手工恢复；推进去则能用「撤销」一键回退已改的那部分。
			// （record.Files 只含已成功写入的文件，所以撤销不会碰没写成功的那些。）
			if len(record.Files) > 0 {
				m.pushHistory(record)
				m.mu.Lock()
				m.redo[p.ID] = nil
				m.mu.Unlock()
			}
			return nil, fmt.Errorf("写入失败（已成功 %d/%d）：%v；已改动的文件已记入历史，可用「撤销」回退",
				len(written), len(preparedFiles), err)
		}
		written = append(written, pf.path)
		record.Files = append(record.Files, FileSnapshot{
			Path:      toSlash(pf.path),
			Before:    pf.before,
			After:     pf.after,
			SHABefore: sha1Hex(pf.before),
			SHAAfter:  sha1Hex(pf.after),
		})
	}

	m.pushHistory(record)
	m.DropPlan(planID)
	m.mu.Lock()
	m.redo[p.ID] = nil
	m.mu.Unlock()

	if hub != nil {
		hub.Broadcast("files-changed", map[string]any{
			"projectId": p.ID,
			"route":     plan.Route,
			"files":     record.Files,
			"recordId":  record.ID,
		})
	}
	return record, nil
}

func (m *EditManager) pushHistory(record *EditRecord) {
	m.mu.Lock()
	defer m.mu.Unlock()
	list := append(m.history[record.ProjectID], record)
	if len(list) > 200 {
		list = list[len(list)-200:]
	}
	m.history[record.ProjectID] = list
	m.undo[record.ProjectID] = append(m.undo[record.ProjectID], record.ID)
	m.persistLocked(record.ProjectID)
}

// persistLocked 把某个项目的历史落盘。
//
// 只写元数据，**不写 Before/After 正文**：撤销/重做栈是会话级的（重启后必然为空），
// 落盘的正文在重启后再也用不到，却会让源码内容长期留在配置目录里
// （与「源码正文不进持久缓存」相冲突），并且 200 条 × 多文件全文会让这个文件一直膨胀。
func (m *EditManager) persistLocked(projectID string) {
	list := m.history[projectID]
	stripped := make([]*EditRecord, 0, len(list))
	for _, r := range list {
		clone := *r
		files := make([]FileSnapshot, 0, len(r.Files))
		for _, f := range r.Files {
			// 只留路径与前后哈希：足以说明"改过哪些文件、改的是哪个版本"。
			files = append(files, FileSnapshot{
				Path:      f.Path,
				SHABefore: f.SHABefore,
				SHAAfter:  f.SHAAfter,
			})
		}
		clone.Files = files
		stripped = append(stripped, &clone)
	}
	raw, err := json.MarshalIndent(stripped, "", "  ")
	if err != nil {
		return
	}
	// 用原子写：直接 os.WriteFile 遇到崩溃会留下截断的 JSON，
	// 下次启动就再也读不回历史了。
	if err := writeFileAtomic(filepath.Join(m.dir, projectID+".json"), append(raw, '\n')); err != nil {
		log.Printf("写入编辑历史失败（%s）：%v", projectID, err)
	}
}

// loadFromDisk 从磁盘读历史（**不持锁**）。服务重启后第一次访问该项目时触发。
//
// 注意：撤销/重做栈是会话级的、不持久化，磁盘上也只存元数据（没有正文）——
// 两者是一致的：重启后可以查看历史，但不能跨会话撤销。
func (m *EditManager) loadFromDisk(projectID string) []*EditRecord {
	raw, err := os.ReadFile(filepath.Join(m.dir, projectID+".json"))
	if err != nil {
		return []*EditRecord{}
	}
	var list []*EditRecord
	if err := json.Unmarshal(raw, &list); err != nil {
		return []*EditRecord{}
	}
	if list == nil {
		return []*EditRecord{}
	}
	return list
}

// ensureLoaded 保证某项目的历史已载入。读盘刻意放在锁外：
// 历史是 JSON 文件，持锁读会把所有编辑请求（apply 也走这把锁）一起卡住。
func (m *EditManager) ensureLoaded(projectID string) {
	m.mu.Lock()
	_, loaded := m.history[projectID]
	m.mu.Unlock()
	if loaded {
		return
	}
	list := m.loadFromDisk(projectID)
	m.mu.Lock()
	// 读盘期间可能已有别的请求填过，别覆盖它
	if _, ok := m.history[projectID]; !ok {
		m.history[projectID] = list
	}
	m.mu.Unlock()
}

func (m *EditManager) History(projectID string) []*EditRecord {
	m.ensureLoaded(projectID)
	m.mu.Lock()
	defer m.mu.Unlock()
	list := m.history[projectID]
	out := make([]*EditRecord, len(list))
	copy(out, list)
	return out
}

// findRecord 在已载入的历史里查找。调用方需先 ensureLoaded。
func (m *EditManager) findRecord(projectID, id string) *EditRecord {
	for _, r := range m.history[projectID] {
		if r.ID == id {
			return r
		}
	}
	return nil
}

// Switch 依据快照把一批文件改写为指定内容（撤销 = 写 Before，重做 = 写 After）。
//
// 走两阶段：先把全部文件的路径、扩展名、当前内容校验完，再逐个写。
// 早期实现边校验边写，多文件时第 2 个文件失败会留下"第 1 个已改、第 2 个没改"的中间态。
func (m *EditManager) Switch(p *Project, record *EditRecord, direction string) error {
	lock := m.projectLock(p.ID)
	lock.Lock()
	defer lock.Unlock()

	type task struct {
		path    string
		text    string
		current string
	}
	tasks := make([]task, 0, len(record.Files))

	for _, f := range record.Files {
		full, err := p.ResolveWritePath(f.Path)
		if err != nil {
			return err
		}
		// 撤销/重做同样要过扩展名与目录黑名单 —— 历史记录也可能是被篡改的。
		if err := checkEditablePath(full); err != nil {
			return err
		}
		raw, err := os.ReadFile(full)
		if err != nil {
			return fmt.Errorf("读取 %s 失败：%w", filepath.Base(full), err)
		}
		current := string(raw)
		want, target := f.SHAAfter, f.Before
		if direction == "redo" {
			want, target = f.SHABefore, f.After
		}
		if sha1Hex(current) != want {
			return &StaleError{File: toSlash(full), Reason: "文件已被外部修改，请先刷新再" + direction}
		}
		tasks = append(tasks, task{path: full, text: target, current: current})
	}

	// 写盘；任一失败就把已经写过的文件按原内容回滚。
	//
	// 撤销/重做的语义是"把整批文件恢复成某个已知快照"，半成品比整体失败更糟：
	// 一部分文件停在中间态时，再点一次撤销会因为基线不匹配而永久卡住
	// （want 是整批的 SHA，而其中几个已经是目标态了）。
	done := make([]task, 0, len(tasks))
	for _, t := range tasks {
		if err := writeFileAtomic(t.path, []byte(t.text)); err != nil {
			for i := len(done) - 1; i >= 0; i-- {
				_ = writeFileAtomic(done[i].path, []byte(done[i].current))
			}
			return fmt.Errorf("写入 %s 失败（已回滚 %d 个文件，本次 %s 未生效）：%w",
				filepath.Base(t.path), len(done), direction, err)
		}
		done = append(done, t)
	}
	return nil
}

// Undo 撤销最近一次编辑。
func (m *EditManager) Undo(p *Project, hub *Hub) (*EditRecord, error) {
	m.ensureLoaded(p.ID)
	m.mu.Lock()
	stack := m.undo[p.ID]
	if len(stack) == 0 {
		m.mu.Unlock()
		return nil, fmt.Errorf("没有可撤销的编辑")
	}
	id := stack[len(stack)-1]
	m.undo[p.ID] = stack[:len(stack)-1]
	record := m.findRecord(p.ID, id)
	m.mu.Unlock()
	if record == nil {
		return nil, fmt.Errorf("历史记录缺失")
	}
	if err := m.Switch(p, record, "undo"); err != nil {
		m.mu.Lock()
		m.undo[p.ID] = append(m.undo[p.ID], id)
		m.mu.Unlock()
		return nil, err
	}
	m.mu.Lock()
	m.redo[p.ID] = append(m.redo[p.ID], id)
	m.mu.Unlock()
	if hub != nil {
		hub.Broadcast("files-changed", map[string]any{"projectId": p.ID, "route": record.Route, "undo": true})
	}
	return record, nil
}

// Redo 重做最近一次撤销。
func (m *EditManager) Redo(p *Project, hub *Hub) (*EditRecord, error) {
	m.ensureLoaded(p.ID)
	m.mu.Lock()
	stack := m.redo[p.ID]
	if len(stack) == 0 {
		m.mu.Unlock()
		return nil, fmt.Errorf("没有可重做的编辑")
	}
	id := stack[len(stack)-1]
	m.redo[p.ID] = stack[:len(stack)-1]
	record := m.findRecord(p.ID, id)
	m.mu.Unlock()
	if record == nil {
		return nil, fmt.Errorf("历史记录缺失")
	}
	if err := m.Switch(p, record, "redo"); err != nil {
		m.mu.Lock()
		m.redo[p.ID] = append(m.redo[p.ID], id)
		m.mu.Unlock()
		return nil, err
	}
	m.mu.Lock()
	m.undo[p.ID] = append(m.undo[p.ID], id)
	m.mu.Unlock()
	if hub != nil {
		hub.Broadcast("files-changed", map[string]any{"projectId": p.ID, "route": record.Route, "redo": true})
	}
	return record, nil
}

// Stats 供 health 展示。
func (m *EditManager) Stats() map[string]any {
	m.mu.Lock()
	defer m.mu.Unlock()
	return map[string]any{"cachedPlans": len(m.plans)}
}
