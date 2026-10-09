package main

import (
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// Server 承载全部 HTTP 处理。
type Server struct {
	repoRoot   string
	configDir  string
	registry   *Registry
	sidecar    *Sidecar
	editors    *EditorService
	hub        *Hub
	edits      *EditManager
	previewURL string
	token      string
	startedAt  time.Time
}

// ── 通用 ───────────────────────────────────────────────────────────

// project 取项目，找不到时已写好响应。
func (s *Server) project(w http.ResponseWriter, r *http.Request) (*Project, bool) {
	id := r.PathValue("id")
	p, ok := s.registry.Get(id)
	if !ok {
		writeErr(w, http.StatusNotFound, "项目不存在："+id)
		return nil, false
	}
	return p, true
}

// auth 局域网模式下校验 Token；本机回环访问免校验。
func (s *Server) auth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if s.token == "" || isLoopback(r.RemoteAddr) {
			next.ServeHTTP(w, r)
			return
		}
		got := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
		if got != s.token {
			writeErr(w, http.StatusUnauthorized, "缺少或错误的访问 Token")
			return
		}
		next.ServeHTTP(w, r)
	})
}

func isLoopback(addr string) bool {
	host, _, err := net.SplitHostPort(addr)
	if err != nil {
		host = addr
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}

func decodeBody(w http.ResponseWriter, r *http.Request, out any) bool {
	if r.Body == nil {
		writeErr(w, http.StatusBadRequest, "缺少请求体")
		return false
	}
	dec := json.NewDecoder(r.Body)
	dec.UseNumber()
	if err := dec.Decode(out); err != nil {
		writeErr(w, http.StatusBadRequest, "请求体解析失败："+err.Error())
		return false
	}
	return true
}

// ── health ────────────────────────────────────────────────────────

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	projects := s.registry.List()
	writeJSON(w, http.StatusOK, okPayload(map[string]any{
		"ok":         true,
		"repoRoot":   toSlash(s.repoRoot),
		"configDir":  toSlash(s.configDir),
		"uptime":     time.Since(s.startedAt).Round(time.Second).String(),
		"projects":   len(projects),
		"analyzer":   s.sidecar.Status(),
		"edit":       s.edits.Stats(),
		"authNeeded": s.token != "",
		"previewUrl": s.previewURL,
	}))
}

// ── 项目 ──────────────────────────────────────────────────────────

type projectProbeResult struct {
	Profile     *Project          `json:"profile"`
	Pages       []map[string]any  `json:"pages"`
	Enums       map[string]any    `json:"enums"`
	EnumMissing []string          `json:"enumMissing"`
	Labels      map[string]string `json:"labels"`
	TSVersion   string            `json:"tsVersion"`
}

func (s *Server) probe(rootPath string, overrides map[string]any) (*projectProbeResult, error) {
	params := map[string]any{"rootPath": rootPath}
	if overrides != nil {
		params["overrides"] = overrides
	}
	var out projectProbeResult
	if err := s.sidecar.CallInto("project.probe", params, &out, 60*time.Second); err != nil {
		return nil, err
	}
	if out.Profile == nil {
		return nil, fmt.Errorf("探测结果为空")
	}
	return &out, nil
}

func (s *Server) handleProjects(w http.ResponseWriter, r *http.Request) {
	list := s.registry.List()
	out := make([]map[string]any, 0, len(list))
	for _, p := range list {
		out = append(out, map[string]any{
			"id":           p.ID,
			"name":         p.Name,
			"packageName":  p.PackageName,
			"rootPath":     p.RootPath,
			"kind":         p.Kind,
			"hasFramework": p.HasFramework,
			"pagesDir":     p.Source.PagesDir,
			"warnings":     p.Warnings,
		})
	}
	writeJSON(w, http.StatusOK, okPayload(map[string]any{"projects": out}))
}

func (s *Server) handleProjectCreate(w http.ResponseWriter, r *http.Request) {
	var body struct {
		RootPath  string         `json:"rootPath"`
		Name      string         `json:"name"`
		Overrides map[string]any `json:"overrides"`
	}
	if !decodeBody(w, r, &body) {
		return
	}
	if strings.TrimSpace(body.RootPath) == "" {
		writeErr(w, http.StatusBadRequest, "缺少 rootPath（目标工程路径）")
		return
	}
	abs, err := filepath.Abs(body.RootPath)
	if err != nil {
		writeErr(w, http.StatusBadRequest, "路径非法："+err.Error())
		return
	}
	if existing, ok := s.registry.FindByRoot(abs); ok {
		writeJSON(w, http.StatusOK, okPayload(map[string]any{
			"project": existing,
			"reused":  true,
			"message": "该目录已注册，直接复用。",
		}))
		return
	}

	res, err := s.probe(abs, body.Overrides)
	if err != nil {
		writeErr(w, http.StatusBadRequest, "探测失败："+err.Error())
		return
	}
	p := res.Profile
	if body.Name != "" {
		p.Name = body.Name
	}
	p.ID = s.uniqueID(p.ID)
	p.CreatedAt = nowISO()
	if err := s.registry.Put(p); err != nil {
		writeErr(w, http.StatusInternalServerError, "保存项目失败："+err.Error())
		return
	}
	s.hub.Broadcast("projects-changed", map[string]any{"id": p.ID})
	writeJSON(w, http.StatusOK, okPayload(map[string]any{
		"project": p,
		"pages":   res.Pages,
		"enums":   res.Enums,
		"labels":  res.Labels,
		"ts":      res.TSVersion,
	}))
}

func (s *Server) uniqueID(base string) string {
	if base == "" {
		base = "project"
	}
	if _, exists := s.registry.Get(base); !exists {
		return base
	}
	for i := 2; i < 100; i++ {
		candidate := fmt.Sprintf("%s-%d", base, i)
		if _, exists := s.registry.Get(candidate); !exists {
			return candidate
		}
	}
	return fmt.Sprintf("%s-%d", base, time.Now().Unix())
}

func (s *Server) handleProjectGet(w http.ResponseWriter, r *http.Request) {
	p, ok := s.project(w, r)
	if !ok {
		return
	}
	writeJSON(w, http.StatusOK, okPayload(map[string]any{"project": p}))
}

func (s *Server) handleProjectUpdate(w http.ResponseWriter, r *http.Request) {
	p, ok := s.project(w, r)
	if !ok {
		return
	}
	var body struct {
		Name      *string        `json:"name"`
		Overrides map[string]any `json:"overrides"`
	}
	if !decodeBody(w, r, &body) {
		return
	}
	if body.Name != nil {
		p.Name = *body.Name
	}
	if len(body.Overrides) > 0 {
		overrides := map[string]any{"id": p.ID, "name": p.Name}
		for k, v := range body.Overrides {
			overrides[k] = v
		}
		res, err := s.probe(p.RootPath, overrides)
		if err != nil {
			writeErr(w, http.StatusBadRequest, "重新探测失败："+err.Error())
			return
		}
		res.Profile.CreatedAt = p.CreatedAt
		p = res.Profile
	}
	if err := s.registry.Put(p); err != nil {
		writeErr(w, http.StatusInternalServerError, "保存失败："+err.Error())
		return
	}
	writeJSON(w, http.StatusOK, okPayload(map[string]any{"project": p}))
}

func (s *Server) handleProjectDelete(w http.ResponseWriter, r *http.Request) {
	p, ok := s.project(w, r)
	if !ok {
		return
	}
	if err := s.registry.Delete(p.ID); err != nil {
		writeErr(w, http.StatusInternalServerError, "删除失败："+err.Error())
		return
	}
	// 只注销注册表，**不动目标工程里的任何文件**
	writeJSON(w, http.StatusOK, okPayload(map[string]any{
		"message": "已注销项目（目标工程中的文件未被改动）",
	}))
}

func (s *Server) handleProjectProbe(w http.ResponseWriter, r *http.Request) {
	p, ok := s.project(w, r)
	if !ok {
		return
	}
	res, err := s.probe(p.RootPath, map[string]any{"id": p.ID, "name": p.Name})
	if err != nil {
		writeErr(w, http.StatusBadRequest, "探测失败："+err.Error())
		return
	}
	res.Profile.CreatedAt = p.CreatedAt
	if err := s.registry.Put(res.Profile); err != nil {
		writeErr(w, http.StatusInternalServerError, "保存失败："+err.Error())
		return
	}
	writeJSON(w, http.StatusOK, okPayload(map[string]any{
		"project": res.Profile,
		"pages":   res.Pages,
		"enums":   res.Enums,
		"labels":  res.Labels,
	}))
}

// ── 页面 ──────────────────────────────────────────────────────────

func (s *Server) handlePages(w http.ResponseWriter, r *http.Request) {
	p, ok := s.project(w, r)
	if !ok {
		return
	}
	var out struct {
		Pages []map[string]any `json:"pages"`
	}
	err := s.sidecar.CallInto("pages.list", map[string]any{
		"pagesDir":     p.Source.PagesDir,
		"frameworkSrc": p.Source.FrameworkSrc,
	}, &out, 30*time.Second)
	if err != nil {
		writeErr(w, http.StatusBadGateway, "列举页面失败："+err.Error())
		return
	}
	writeJSON(w, http.StatusOK, okPayload(map[string]any{"pages": out.Pages}))
}

func (s *Server) handlePageAnalyze(w http.ResponseWriter, r *http.Request) {
	p, ok := s.project(w, r)
	if !ok {
		return
	}
	route := r.URL.Query().Get("route")
	if route == "" {
		route = "/"
	}
	dir, err := p.PageDirOf(route)
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	files, err := p.CollectPageFiles(dir)
	if err != nil {
		writeErr(w, http.StatusBadRequest, "读取页面目录失败："+err.Error())
		return
	}
	if len(files) == 0 {
		writeErr(w, http.StatusNotFound, "页面目录下没有源码文件："+toSlash(dir))
		return
	}

	var out map[string]any
	err = s.sidecar.CallInto("page.analyze", map[string]any{
		"project":      p,
		"route":        route,
		"frameworkSrc": p.Source.FrameworkSrc,
		"files":        files,
	}, &out, 60*time.Second)
	if err != nil {
		writeErr(w, http.StatusBadGateway, "分析失败："+err.Error())
		return
	}
	// 附带每个文件的内容指纹，前端据此判断是否需要在保存后刷新
	out["fileSHAs"] = shasOf(files)
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "data": out})
}

func shasOf(files []SourceFile) map[string]string {
	out := make(map[string]string, len(files))
	for _, f := range files {
		out[f.File] = sha1Hex(f.Text)
	}
	return out
}

func (s *Server) handleRefs(w http.ResponseWriter, r *http.Request) {
	p, ok := s.project(w, r)
	if !ok {
		return
	}
	pages := s.pagesOf(p)
	index := map[string][]map[string]any{}
	for _, route := range pages {
		dir, err := p.PageDirOf(route)
		if err != nil {
			continue
		}
		files, err := p.CollectPageFiles(dir)
		if err != nil || len(files) == 0 {
			continue
		}
		var out struct {
			Refs []map[string]any `json:"refs"`
		}
		if err := s.sidecar.CallInto("page.analyze", map[string]any{
			"project": p, "route": route, "frameworkSrc": p.Source.FrameworkSrc, "files": files,
		}, &out, 60*time.Second); err != nil {
			continue
		}
		for _, ref := range out.Refs {
			kind, _ := ref["kind"].(string)
			key := kind + ":" + fmt.Sprint(ref["member"])
			index[key] = append(index[key], map[string]any{"route": route, "ref": ref})
		}
	}
	writeJSON(w, http.StatusOK, okPayload(map[string]any{"index": index, "pages": pages}))
}

func (s *Server) pagesOf(p *Project) []string {
	var out struct {
		Pages []map[string]any `json:"pages"`
	}
	if err := s.sidecar.CallInto("pages.list", map[string]any{
		"pagesDir": p.Source.PagesDir, "frameworkSrc": p.Source.FrameworkSrc,
	}, &out, 30*time.Second); err != nil {
		return nil
	}
	routes := make([]string, 0, len(out.Pages))
	for _, pg := range out.Pages {
		if r, ok := pg["route"].(string); ok {
			routes = append(routes, r)
		}
	}
	return routes
}

func (s *Server) handleMeta(w http.ResponseWriter, r *http.Request) {
	p, ok := s.project(w, r)
	if !ok {
		return
	}
	var out map[string]any
	if err := s.sidecar.CallInto("meta.enums", map[string]any{
		"frameworkSrc": p.Source.FrameworkSrc,
	}, &out, 30*time.Second); err != nil {
		writeErr(w, http.StatusBadGateway, "读取元数据失败："+err.Error())
		return
	}
	writeJSON(w, http.StatusOK, okPayload(out))
}

// ── 源码读取 ──────────────────────────────────────────────────────

func (s *Server) handleSource(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("projectId")
	p, ok := s.registry.Get(id)
	if !ok {
		writeErr(w, http.StatusNotFound, "项目不存在："+id)
		return
	}
	file := r.URL.Query().Get("file")
	sf, err := p.ReadSource(file)
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	rel, _ := filepath.Rel(p.RootPath, sf.File)
	writeJSON(w, http.StatusOK, okPayload(map[string]any{
		"file":  sf.File,
		"rel":   toSlash(rel),
		"text":  sf.Text,
		"lines": strings.Count(sf.Text, "\n") + 1,
		"sha":   sha1Hex(sf.Text),
	}))
}

// ── 编辑 ──────────────────────────────────────────────────────────

type editPlanRequest struct {
	ProjectID string          `json:"projectId"`
	Route     string          `json:"route"`
	Source    string          `json:"source"` // page（默认）| theme
	Op        json.RawMessage `json:"op"`
	File      string          `json:"file"`
	Selector  string          `json:"selector"`
	Token     string          `json:"token"`
	Value     string          `json:"value"`
	Title     string          `json:"title"`
}

func (s *Server) handleEditPlan(w http.ResponseWriter, r *http.Request) {
	var body editPlanRequest
	if !decodeBody(w, r, &body) {
		return
	}
	p, ok := s.registry.Get(body.ProjectID)
	if !ok {
		writeErr(w, http.StatusNotFound, "项目不存在："+body.ProjectID)
		return
	}

	var raw json.RawMessage
	var err error
	var files []SourceFile

	if body.Source == "theme" {
		files, _, err = p.ReadMany(p.ThemeFiles)
		if err != nil {
			writeErr(w, http.StatusBadRequest, err.Error())
			return
		}
		raw, err = s.sidecar.Call("theme.plan", map[string]any{
			"files":    files,
			"file":     body.File,
			"selector": body.Selector,
			"token":    body.Token,
			"value":    body.Value,
		}, 30*time.Second)
	} else {
		dir, derr := p.PageDirOf(body.Route)
		if derr != nil {
			writeErr(w, http.StatusBadRequest, derr.Error())
			return
		}
		files, err = p.CollectPageFiles(dir)
		if err != nil {
			writeErr(w, http.StatusBadRequest, "读取页面文件失败："+err.Error())
			return
		}
		var op any
		if len(body.Op) > 0 {
			if e := json.Unmarshal(body.Op, &op); e != nil {
				writeErr(w, http.StatusBadRequest, "op 解析失败："+e.Error())
				return
			}
		}
		raw, err = s.sidecar.Call("edit.plan", map[string]any{
			"project":      p,
			"route":        body.Route,
			"frameworkSrc": p.Source.FrameworkSrc,
			"files":        files,
			"op":           op,
		}, 60*time.Second)
	}
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}

	var plan struct {
		Files     []PlanFile       `json:"files"`
		Impacts   []map[string]any `json:"impacts"`
		Uncovered []map[string]any `json:"uncovered"`
		Noop      bool             `json:"noop"`
		Error     *struct {
			Message string `json:"message"`
			Code    string `json:"code"`
		} `json:"error"`
	}
	if err := json.Unmarshal(raw, &plan); err != nil {
		writeErr(w, http.StatusBadGateway, "解析编辑计划失败："+err.Error())
		return
	}
	if plan.Error != nil {
		writeJSON(w, http.StatusOK, map[string]any{
			"ok":      false,
			"message": plan.Error.Message,
			"code":    plan.Error.Code,
		})
		return
	}
	if plan.Noop {
		writeJSON(w, http.StatusOK, okPayload(map[string]any{"noop": true, "message": "新值与当前值一致，无需修改"}))
		return
	}

	// 记录每个文件的基线指纹：apply 时用来判断是否被外部改动过
	byPath := map[string]string{}
	for _, f := range files {
		byPath[f.File] = sha1Hex(f.Text)
	}
	for i := range plan.Files {
		if sha, ok := byPath[plan.Files[i].File]; ok {
			plan.Files[i].SHA = sha
		}
	}

	title := body.Title
	if title == "" {
		title = describeOp(body)
	}
	editPlan := &EditPlan{
		ID:        fmt.Sprintf("p%d", time.Now().UnixNano()),
		ProjectID: p.ID,
		Route:     body.Route,
		Title:     title,
		Files:     plan.Files,
		Impacts:   plan.Impacts,
		Uncovered: plan.Uncovered,
	}
	s.edits.PutPlan(editPlan)
	writeJSON(w, http.StatusOK, okPayload(editPlan))
}

func describeOp(body editPlanRequest) string {
	if body.Source == "theme" {
		return fmt.Sprintf("主题：%s → --%s", body.Selector, body.Token)
	}
	var op struct {
		Kind   string `json:"kind"`
		Target string `json:"target"`
	}
	_ = json.Unmarshal(body.Op, &op)
	switch op.Kind {
	case "set":
		return "修改属性 " + op.Target
	case "set-ref":
		return "修改引用 " + op.Target
	case "insert-array-item":
		return "新增子项 " + op.Target
	case "delete-array-item":
		return "删除子项 " + op.Target
	case "move-array-item":
		return "调整顺序 " + op.Target
	case "delete-prop":
		return "删除属性 " + op.Target
	case "insert-prop":
		return "新增属性 " + op.Target
	case "delete-member":
		return "删除成员 " + op.Target
	case "insert-member":
		return "新增成员 " + op.Target
	case "rename-member":
		return "重命名 " + op.Target
	default:
		return "编辑 " + op.Target
	}
}

func (s *Server) handleEditApply(w http.ResponseWriter, r *http.Request) {
	var body struct {
		ProjectID string `json:"projectId"`
		PlanID    string `json:"planId"`
	}
	if !decodeBody(w, r, &body) {
		return
	}
	p, ok := s.registry.Get(body.ProjectID)
	if !ok {
		writeErr(w, http.StatusNotFound, "项目不存在："+body.ProjectID)
		return
	}
	record, err := s.edits.Apply(p, body.PlanID, s.hub)
	if err != nil {
		writeErr(w, http.StatusConflict, err.Error())
		return
	}
	if record == nil {
		writeJSON(w, http.StatusOK, okPayload(map[string]any{"noop": true}))
		return
	}
	writeJSON(w, http.StatusOK, okPayload(map[string]any{
		"record":  record,
		"message": fmt.Sprintf("已写入 %d 个文件（原文件备份为 .bak）", len(record.Files)),
	}))
}

func (s *Server) handleUndo(w http.ResponseWriter, r *http.Request) {
	s.switchHistory(w, r, "undo")
}

func (s *Server) handleRedo(w http.ResponseWriter, r *http.Request) {
	s.switchHistory(w, r, "redo")
}

func (s *Server) switchHistory(w http.ResponseWriter, r *http.Request, direction string) {
	var body struct {
		ProjectID string `json:"projectId"`
	}
	if !decodeBody(w, r, &body) {
		return
	}
	p, ok := s.registry.Get(body.ProjectID)
	if !ok {
		writeErr(w, http.StatusNotFound, "项目不存在："+body.ProjectID)
		return
	}
	var record *EditRecord
	var err error
	if direction == "undo" {
		record, err = s.edits.Undo(p, s.hub)
	} else {
		record, err = s.edits.Redo(p, s.hub)
	}
	if err != nil {
		writeErr(w, http.StatusConflict, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, okPayload(map[string]any{
		"record":  record,
		"message": map[string]string{"undo": "已撤销", "redo": "已重做"}[direction],
	}))
}

func (s *Server) handleHistory(w http.ResponseWriter, r *http.Request) {
	p, ok := s.project(w, r)
	if !ok {
		return
	}
	list := s.edits.History(p.ID)
	out := make([]map[string]any, 0, len(list))
	for i := len(list) - 1; i >= 0; i-- {
		rec := list[i]
		out = append(out, map[string]any{
			"id":      rec.ID,
			"route":   rec.Route,
			"title":   rec.Title,
			"at":      rec.At,
			"files":   len(rec.Files),
			"impacts": rec.Impacts,
		})
	}
	writeJSON(w, http.StatusOK, okPayload(map[string]any{"history": out}))
}

// ── 主题 ──────────────────────────────────────────────────────────

func (s *Server) handleThemeGet(w http.ResponseWriter, r *http.Request) {
	p, ok := s.project(w, r)
	if !ok {
		return
	}
	files, failed, err := p.ReadMany(p.ThemeFiles)
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	var out map[string]any
	if err := s.sidecar.CallInto("theme.parse", map[string]any{"files": files}, &out, 30*time.Second); err != nil {
		writeErr(w, http.StatusBadGateway, "解析主题失败："+err.Error())
		return
	}
	out["failed"] = failed
	rel := map[string]string{}
	for _, f := range files {
		if r, err := filepath.Rel(p.RootPath, f.File); err == nil {
			rel[f.File] = toSlash(r)
		}
	}
	out["relPaths"] = rel
	writeJSON(w, http.StatusOK, okPayload(out))
}

// ── 外部编辑器 ────────────────────────────────────────────────────

func (s *Server) handleEditors(w http.ResponseWriter, r *http.Request) {
	scan := r.URL.Query().Get("scan") == "1"
	writeJSON(w, http.StatusOK, okPayload(map[string]any{"editors": s.editors.List(scan)}))
}

func (s *Server) handleOpen(w http.ResponseWriter, r *http.Request) {
	var body struct {
		ProjectID string `json:"projectId"`
		File      string `json:"file"`
		Line      int    `json:"line"`
		Column    int    `json:"column"`
		Editor    string `json:"editor"`
		Command   string `json:"command"`
	}
	if !decodeBody(w, r, &body) {
		return
	}
	p, ok := s.registry.Get(body.ProjectID)
	if !ok {
		writeErr(w, http.StatusNotFound, "项目不存在："+body.ProjectID)
		return
	}
	full, err := p.ResolvePath(body.File)
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	if _, err := os.Stat(full); err != nil {
		writeErr(w, http.StatusNotFound, "文件不存在："+toSlash(full))
		return
	}
	used, err := s.editors.Open(body.Editor, body.Command, toSlash(full), body.Line, body.Column, p.RootPath)
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, okPayload(map[string]any{"message": "已唤起编辑器", "command": used}))
}

// ── 预览 ──────────────────────────────────────────────────────────

func (s *Server) handlePreview(w http.ResponseWriter, r *http.Request) {
	p, ok := s.project(w, r)
	if !ok {
		return
	}
	port := 7099
	ready := portOpen("127.0.0.1", port)
	env := p.Source.Env
	if env == nil {
		env = map[string]string{}
	}
	writeJSON(w, http.StatusOK, okPayload(map[string]any{
		"port":      port,
		"ready":     ready,
		"baseUrl":   fmt.Sprintf("http://127.0.0.1:%d/", port),
		"mockBase":  p.Source.MockBaseURL,
		"apiBase":   s.previewURL,
		"framework": p.Source.FrameworkSrc,
		"env":       env,
		"hint":      "预览宿主由 packages/studio/preview 提供；未就绪时请在另一个终端执行 pnpm --filter @jl/studio-preview dev",
	}))
}

func portOpen(host string, port int) bool {
	conn, err := net.DialTimeout("tcp", fmt.Sprintf("%s:%d", host, port), 300*time.Millisecond)
	if err != nil {
		return false
	}
	_ = conn.Close()
	return true
}
