package main

import (
	"encoding/json"
	"fmt"
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
		full, err := p.ResolvePath(pf.File)
		if err != nil {
			return nil, err
		}
		if err := checkEditableExtension(full); err != nil {
			return nil, err
		}
		raw, err := os.ReadFile(full)
		if err != nil {
			return nil, fmt.Errorf("读取 %s 失败：%w", filepath.Base(full), err)
		}
		before := string(raw)
		if pf.SHA != "" && sha1Hex(before) != pf.SHA {
			return nil, fmt.Errorf("文件已被外部修改，编辑计划失效：%s（请刷新后重试）", toSlash(full))
		}
		after, err := applyTextEdits(before, pf.Edits)
		if err != nil {
			return nil, fmt.Errorf("%s：%w", filepath.Base(full), err)
		}
		if pf.NextText != "" && after != pf.NextText {
			return nil, fmt.Errorf("文件内容与计划基线不一致，编辑计划失效：%s", toSlash(full))
		}
		preparedFiles = append(preparedFiles, prepared{path: full, before: before, after: after})
	}

	// 第二阶段：写盘（已备份，失败即中止并报告已写清单）
	written := make([]string, 0, len(preparedFiles))
	for _, pf := range preparedFiles {
		if err := writeFileAtomic(pf.path, []byte(pf.after)); err != nil {
			m.DropPlan(planID)
			return nil, fmt.Errorf("写入失败（已成功 %d/%d）：%v", len(written), len(preparedFiles), err)
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

func (m *EditManager) persistLocked(projectID string) {
	raw, err := json.MarshalIndent(m.history[projectID], "", "  ")
	if err != nil {
		return
	}
	_ = os.WriteFile(filepath.Join(m.dir, projectID+".json"), raw, 0o644)
}

// loadLocked 从磁盘补历史（服务重启后第一次访问该项目时触发）。
// 注意：撤销/重做栈是会话级的，不持久化 —— 重启后可以查看历史，但不能跨会话撤销。
func (m *EditManager) loadLocked(projectID string) {
	raw, err := os.ReadFile(filepath.Join(m.dir, projectID+".json"))
	if err != nil {
		m.history[projectID] = []*EditRecord{}
		return
	}
	var list []*EditRecord
	if err := json.Unmarshal(raw, &list); err != nil {
		m.history[projectID] = []*EditRecord{}
		return
	}
	m.history[projectID] = list
}

func (m *EditManager) History(projectID string) []*EditRecord {
	m.mu.Lock()
	defer m.mu.Unlock()
	if _, ok := m.history[projectID]; !ok {
		m.loadLocked(projectID)
	}
	list := m.history[projectID]
	out := make([]*EditRecord, len(list))
	copy(out, list)
	return out
}

func (m *EditManager) findRecord(projectID, id string) *EditRecord {
	if _, ok := m.history[projectID]; !ok {
		m.loadLocked(projectID)
	}
	for _, r := range m.history[projectID] {
		if r.ID == id {
			return r
		}
	}
	return nil
}

// Switch 依据快照把一批文件改写为指定内容（撤销 = 写 Before，重做 = 写 After）。
func (m *EditManager) Switch(p *Project, record *EditRecord, direction string) error {
	lock := m.projectLock(p.ID)
	lock.Lock()
	defer lock.Unlock()

	for _, f := range record.Files {
		full, err := p.ResolvePath(f.Path)
		if err != nil {
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
			return fmt.Errorf("%s 已被外部修改，无法%v（请先刷新）", toSlash(full), direction)
		}
		if err := writeFileAtomic(full, []byte(target)); err != nil {
			return err
		}
	}
	return nil
}

// Undo 撤销最近一次编辑。
func (m *EditManager) Undo(p *Project, hub *Hub) (*EditRecord, error) {
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
