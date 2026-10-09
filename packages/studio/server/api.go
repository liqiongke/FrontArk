package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// 端口集中在这里，避免散落在前后端多处各写一遍。
const (
	// previewPort 预览宿主（packages/studio/preview 的 Vite dev server）。
	previewPort = 7099
	// studioDevPort Studio 前端的 Vite dev server（构建产物由 -web 托管时不使用）。
	studioDevPort = 5174
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
//
// 只保护 /api/*：静态资源（SPA 产物）不带任何源码信息，把它一起拦住
// 只会让局域网里连首页都打不开。
//
// SSE 的 Token 允许走 `?token=`：EventSource 这个浏览器 API **无法设置请求头**，
// 只认（不受保护的）header 就等于 SSE 在局域网模式下永远连不上。
func (s *Server) auth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if s.token == "" || isLoopback(r.RemoteAddr) || !strings.HasPrefix(r.URL.Path, "/api/") {
			next.ServeHTTP(w, r)
			return
		}
		got := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
		if got == "" && r.URL.Path == "/api/events" {
			got = r.URL.Query().Get("token")
		}
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

// maxBodyBytes 请求体上限。编辑计划的请求体里带的是受影响文件的全文快照，
// 几 MB 足够；不给上限等于把内存交给调用方。
const maxBodyBytes = 8 << 20 // 8 MiB

// localOrigin 报告 Origin 头是否为本机来源。
//
// 前端有三种形态：Vite dev server（http://localhost:5174）、预览宿主
// （http://127.0.0.1:7099）、同源 SPA（http://127.0.0.1:8788）。它们的共同点是
// host 落在回环地址上 —— 与 withCORS 的白名单保持同一口径。
func localOrigin(origin string) bool {
	u, err := url.Parse(origin)
	if err != nil {
		return false
	}
	host := u.Hostname()
	if host == "localhost" {
		return true
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}

// checkWriteSource 对写请求做 CSRF 防护。
//
// 为什么必须在服务端做：浏览器的「简单请求」（Content-Type 为 text/plain、
// application/x-www-form-urlencoded 等）**不触发 CORS 预检**，withCORS 中间件
// 拦不住它 —— 任意本机网页都能用 fetch 打 POST /api/open 或 POST /api/projects，
// 而回环地址又恰好免 Token。所以这里是唯一一道防线。
func checkWriteSource(w http.ResponseWriter, r *http.Request) bool {
	if site := r.Header.Get("Sec-Fetch-Site"); site != "" &&
		site != "same-origin" && site != "same-site" && site != "none" {
		writeErr(w, http.StatusForbidden, "拒绝跨站请求（CSRF 防护）")
		return false
	}
	if origin := r.Header.Get("Origin"); origin != "" && !localOrigin(origin) {
		writeErr(w, http.StatusForbidden, "拒绝来自其它站点的请求（CSRF 防护）")
		return false
	}
	return true
}

func decodeBody(w http.ResponseWriter, r *http.Request, out any) bool {
	if !checkWriteSource(w, r) {
		return false
	}
	if r.Body == nil {
		writeErr(w, http.StatusBadRequest, "缺少请求体")
		return false
	}
	// 只接受 JSON：text/plain / form 这类「简单请求」不触发预检，必须在这里挡掉。
	if ct := r.Header.Get("Content-Type"); ct != "" && !strings.HasPrefix(ct, "application/json") {
		writeErr(w, http.StatusUnsupportedMediaType, "请求体必须是 application/json")
		return false
	}
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxBodyBytes))
	dec.UseNumber()
	if err := dec.Decode(out); err != nil {
		var tooLarge *http.MaxBytesError
		if errors.As(err, &tooLarge) {
			writeErr(w, http.StatusRequestEntityTooLarge,
				fmt.Sprintf("请求体超过上限 %d MiB", maxBodyBytes>>20))
			return false
		}
		writeErr(w, http.StatusBadRequest, "请求体解析失败："+err.Error())
		return false
	}
	return true
}

// requireLoopback 拒绝非本机调用。
// 用于「在本机拉起进程」这类只能在服务器所在机器上生效的动作。
func requireLoopback(w http.ResponseWriter, r *http.Request) bool {
	if isLoopback(r.RemoteAddr) {
		return true
	}
	writeErr(w, http.StatusForbidden, "该接口只能在运行 Studio 的本机上调用")
	return false
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
	next := p.Clone()
	if body.Name != nil {
		next.Name = *body.Name
	}
	if len(body.Overrides) > 0 {
		overrides := map[string]any{"id": next.ID, "name": next.Name}
		for k, v := range body.Overrides {
			overrides[k] = v
		}
		res, err := s.probe(next.RootPath, overrides)
		if err != nil {
			writeErr(w, http.StatusBadRequest, "重新探测失败："+err.Error())
			return
		}
		res.Profile.CreatedAt = next.CreatedAt
		next = res.Profile
	}
	next.envLoaded = false // 重新探测后环境变量需要重新读取

	// 用 Update 在写锁内替换，避免与并发请求互相覆盖。
	updated, ok := s.registry.Update(p.ID, func(pp *Project) { *pp = *next })
	if !ok {
		writeErr(w, http.StatusNotFound, "项目不存在："+p.ID)
		return
	}
	writeJSON(w, http.StatusOK, okPayload(map[string]any{"project": updated}))
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
	// Occurrence 同一选择器内出现同名 token 时，指出要改第几处（0 起）。
	// theme.css 这类文件偶有重复声明，早期实现只认第一处，第二处就成了改不动的幽灵值。
	Occurrence int `json:"occurrence"`
	// AcknowledgeUncovered 明确「已知有无法静态确认的引用，仍然继续」。
	// 语义重命名遇到未覆盖项时，不带上它就是拒绝生成可应用的计划。
	AcknowledgeUncovered bool   `json:"acknowledgeUncovered"`
	Title                string `json:"title"`
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

	// 「读文件 + 记基线」这一段拿项目锁：避免在别人 apply 的写盘瞬间取到基线。
	// 拿到快照后立刻释放，sidecar 解析可能耗时较久，不该占着写锁。
	resolveFiles := func() ([]SourceFile, error) {
		lock := s.edits.ProjectLock(p.ID)
		lock.Lock()
		defer lock.Unlock()
		if body.Source == "theme" {
			f, _, e := p.ReadMany(p.ThemeFiles)
			return f, e
		}
		dir, derr := p.PageDirOf(body.Route)
		if derr != nil {
			return nil, derr
		}
		return p.CollectPageFiles(dir)
	}

	if body.Source == "theme" {
		if files, err = resolveFiles(); err != nil {
			writeErr(w, http.StatusBadRequest, err.Error())
			return
		}
		raw, err = s.sidecar.Call("theme.plan", map[string]any{
			"files":      files,
			"file":       body.File,
			"selector":   body.Selector,
			"token":      body.Token,
			"value":      body.Value,
			"occurrence": body.Occurrence,
		}, 30*time.Second)
	} else {
		if files, err = resolveFiles(); err != nil {
			writeErr(w, http.StatusBadRequest, err.Error())
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

	// 未覆盖清单非空 = 有同名标识符我们没能静态归因。
	// 此时不直接给可应用的计划，而是把清单甩回去，要求调用方显式确认。
	// 全局字符串替换是这类重构最典型的翻车方式，这里强制它不可能"静默发生"。
	if len(plan.Uncovered) > 0 && !body.AcknowledgeUncovered {
		writeJSON(w, http.StatusOK, map[string]any{
			"ok":        false,
			"code":      "uncovered-refs",
			"message":   fmt.Sprintf("有 %d 处同名标识符无法静态确认归属，需要人工复核后再继续", len(plan.Uncovered)),
			"uncovered": plan.Uncovered,
		})
		return
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
		// 只有「基线漂移」才是 409（可以刷新后重试）；
		// 路径越界、区间越界这类请求本身有问题，回 400 才不会被前端当成并发冲突。
		status, code := http.StatusBadRequest, "plan-invalid"
		if errors.Is(err, ErrStale) {
			status, code = http.StatusConflict, "stale-plan"
			// 基线已漂移 = 磁盘内容变了，通知前端刷新，别让它继续拿旧模型编辑。
			s.hub.Broadcast("files-changed", map[string]any{"projectId": p.ID, "reason": "stale"})
		}
		writeJSON(w, status, map[string]any{"ok": false, "message": err.Error(), "code": code})
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
	// 「打开编辑器」只可能作用在运行 Studio 的那台机器上，所以只对回环放行。
	// 这条同时掐掉了「局域网里伪造请求 → 在服务器上拉起进程」的路径。
	if !requireLoopback(w, r) {
		return
	}
	var body struct {
		ProjectID string `json:"projectId"`
		File      string `json:"file"`
		Line      int    `json:"line"`
		Column    int    `json:"column"`
		Editor    string `json:"editor"`
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
	// 命令来自服务端白名单 / 服务端配置，请求体只提供「用哪个编辑器」与行列。
	used, err := s.editors.Open(body.Editor, toSlash(full), body.Line, body.Column, p.RootPath)
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, okPayload(map[string]any{"message": "已唤起编辑器", "command": used}))
}

// ── 本机设置（仅回环可用）──────────────────────────────────────────

// handleGetSettings 返回服务端设置 + 前端需要的运行时信息。
func (s *Server) handleGetSettings(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, okPayload(map[string]any{
		"editorCommand": s.editors.Custom(),
		"customEditorHelp": "占位符：{file} {line} {column} {project}；" +
			"例如 myide --goto {file}:{line}:{column}",
		"previewPort": previewPort,
		"studioPort":  studioDevPort,
	}))
}

// handleSetSettings 写入自定义编辑器命令模板（仅回环）。
func (s *Server) handleSetSettings(w http.ResponseWriter, r *http.Request) {
	if !requireLoopback(w, r) {
		return
	}
	var body struct {
		EditorCommand *string `json:"editorCommand"`
	}
	if !decodeBody(w, r, &body) {
		return
	}
	if body.EditorCommand == nil {
		writeErr(w, http.StatusBadRequest, "缺少 editorCommand")
		return
	}
	if err := s.editors.SetCustom(s.configDir, *body.EditorCommand); err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, okPayload(map[string]any{
		"editorCommand": s.editors.Custom(),
		"message":       "已保存自定义编辑器命令",
	}))
}

// ── 预览 ──────────────────────────────────────────────────────────

// ensureEnv 保证内存里有目标工程的 .env 合并结果。
// 这些值不落盘（见 ProjectSource.Env 的 json:"-"），所以服务重启后按需补探测一次。
func (s *Server) ensureEnv(p *Project) *Project {
	if p.envLoaded {
		return p
	}
	res, err := s.probe(p.RootPath, nil)
	if err != nil || res.Profile == nil {
		// 探测失败不致命：预览照常启动，只是页面里的 import.meta.env.* 为空。
		log.Printf("补探测环境变量失败（%s）：%v", p.ID, err)
		if updated, ok := s.registry.Update(p.ID, func(pp *Project) { pp.envLoaded = true }); ok {
			return updated
		}
		return p
	}
	env := res.Profile.Source.Env
	sources := res.Profile.Source.EnvSources
	updated, ok := s.registry.Update(p.ID, func(pp *Project) {
		pp.Source.Env = env
		pp.Source.EnvSources = sources
		pp.envLoaded = true
	})
	if !ok {
		return p
	}
	return updated
}

func (s *Server) handlePreview(w http.ResponseWriter, r *http.Request) {
	p, ok := s.project(w, r)
	if !ok {
		return
	}
	p = s.ensureEnv(p)

	// 环境变量只下发脱敏后的值：Token / 密钥一律掩码。
	// 预览真正需要的（VITE_BASE_URL / VITE_SERVER_PORT 之类）不在敏感名单里。
	env, masked := maskEnv(p.Source.Env)
	ready := portOpen("127.0.0.1", previewPort)

	writeJSON(w, http.StatusOK, okPayload(map[string]any{
		"port":          previewPort,
		"ready":         ready,
		"baseUrl":       fmt.Sprintf("http://127.0.0.1:%d/", previewPort),
		"mockBase":      p.Source.MockBaseURL,
		"apiBase":       s.previewURL,
		"framework":     p.Source.FrameworkSrc,
		"env":           env,
		"maskedEnvKeys": masked,
		"hint": "预览宿主由 packages/studio/preview 提供；" +
			"未就绪时请在另一个终端执行 pnpm --filter @jl/studio-preview dev",
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
