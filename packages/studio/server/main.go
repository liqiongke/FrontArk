// FrontArk Studio 服务端（Go）。
//
// 职责边界（刻意保持清晰）：
//   - 唯一对外 HTTP 入口、唯一静态托管者；
//   - **唯一写盘者**：AST 分析交给 Node sidecar，但字符区间替换、备份与原子写都在这里；
//   - 外部编辑器唤起、编辑历史/撤销重做、SSE 事件广播；
//   - 预览宿主进程不在本进程内托管，只做端口就绪探测与信息下发。
//
// 安全：默认只绑 127.0.0.1；用 -addr 对外时必须同时给 -token。
package main

import (
	"flag"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

func main() {
	addr := flag.String("addr", "127.0.0.1:8788", "监听地址；默认只绑本机（避免同局域网内可写你的源码）")
	repoRoot := flag.String("root", "", "仓库根目录（含 packages/studio）。默认为当前目录或由可执行文件位置推断")
	configDir := flag.String("config", "", "配置目录（projects.json 与编辑历史）。默认为用户配置目录下的 frontark-studio")
	webDir := flag.String("web", "", "前端构建产物目录（存在时由本服务托管；开发模式用 Vite dev server 即可）")
	token := flag.String("token", "", "对外暴露时的访问 Token（-addr 非本机时必填）")
	flag.Parse()

	root := resolveRepoRoot(*repoRoot)
	log.Printf("仓库根目录：%s", root)

	cfgDir := *configDir
	if cfgDir == "" {
		base, err := os.UserConfigDir()
		if err != nil {
			base = root
		}
		cfgDir = filepath.Join(base, "frontark-studio")
	}

	registry, err := NewRegistry(cfgDir)
	if err != nil {
		log.Fatalf("初始化项目注册表失败：%v", err)
	}
	sidecar, err := NewSidecar(root)
	if err != nil {
		log.Fatalf("启动静态分析进程失败：%v\n提示：请确认已安装 Node.js 且已执行 pnpm install", err)
	}
	defer sidecar.Close()

	if *token == "" && !isLocalAddr(*addr) {
		log.Fatalf("-addr %s 会让局域网内任意人可写你的源码，必须同时提供 -token", *addr)
	}

	s := &Server{
		repoRoot:   root,
		configDir:  cfgDir,
		registry:   registry,
		sidecar:    sidecar,
		editors:    NewEditorService(),
		hub:        NewHub(),
		edits:      NewEditManager(cfgDir),
		previewURL: selfBaseURL(*addr),
		token:      *token,
		startedAt:  time.Now(),
	}

	mux := http.NewServeMux()

	mux.HandleFunc("GET /api/health", s.handleHealth)
	mux.HandleFunc("GET /api/events", s.hub.ServeSSE)

	mux.HandleFunc("GET /api/projects", s.handleProjects)
	mux.HandleFunc("POST /api/projects", s.handleProjectCreate)
	mux.HandleFunc("GET /api/projects/{id}", s.handleProjectGet)
	mux.HandleFunc("PUT /api/projects/{id}", s.handleProjectUpdate)
	mux.HandleFunc("DELETE /api/projects/{id}", s.handleProjectDelete)
	mux.HandleFunc("POST /api/projects/{id}/probe", s.handleProjectProbe)
	mux.HandleFunc("GET /api/projects/{id}/pages", s.handlePages)
	mux.HandleFunc("GET /api/projects/{id}/pages/analyze", s.handlePageAnalyze)
	mux.HandleFunc("GET /api/projects/{id}/refs", s.handleRefs)
	mux.HandleFunc("GET /api/projects/{id}/meta", s.handleMeta)
	mux.HandleFunc("GET /api/projects/{id}/history", s.handleHistory)
	mux.HandleFunc("GET /api/projects/{id}/theme", s.handleThemeGet)
	mux.HandleFunc("GET /api/projects/{id}/preview", s.handlePreview)

	mux.HandleFunc("GET /api/source", s.handleSource)
	mux.HandleFunc("GET /api/templates", s.handleTemplates)

	mux.HandleFunc("POST /api/edit/plan", s.handleEditPlan)
	mux.HandleFunc("POST /api/edit/apply", s.handleEditApply)
	mux.HandleFunc("POST /api/edit/undo", s.handleUndo)
	mux.HandleFunc("POST /api/edit/redo", s.handleRedo)

	mux.HandleFunc("GET /api/editors", s.handleEditors)
	mux.HandleFunc("POST /api/open", s.handleOpen)

	if *webDir != "" {
		if _, err := os.Stat(filepath.Join(*webDir, "index.html")); err == nil {
			mux.Handle("/", spaHandler(*webDir))
			log.Printf("静态托管前端产物：%s", *webDir)
		} else {
			log.Printf("警告：-web 指向的目录里没有 index.html，已忽略：%s", *webDir)
		}
	}

	handler := withCORS(withLogging(s.auth(mux)))

	log.Printf("FrontArk Studio 服务：http://%s", *addr)
	log.Printf("配置目录：%s", cfgDir)
	log.Printf("已注册项目：%d 个", len(registry.List()))
	if *webDir == "" {
		log.Printf("开发模式：请另开终端执行 pnpm --filter @jl/studio-web dev（默认 http://localhost:5174）")
	}
	if *token != "" {
		log.Printf("已启用 Token 校验（局域网访问需要 Authorization: Bearer <token>）")
	}

	if err := http.ListenAndServe(*addr, handler); err != nil {
		log.Fatalf("服务启动失败：%v", err)
	}
}

// handleTemplates 代理 analyzer 的模板清单（「+ 添加」菜单数据来源）。
func (s *Server) handleTemplates(w http.ResponseWriter, r *http.Request) {
	var project *Project
	if id := r.URL.Query().Get("projectId"); id != "" {
		project, _ = s.registry.Get(id)
	}
	params := map[string]any{
		"containerKey": r.URL.Query().Get("containerKey"),
		"index":        r.URL.Query().Get("index"),
	}
	if m := r.URL.Query().Get("memberKind"); m != "" {
		params["memberKind"] = m
		params["memberName"] = r.URL.Query().Get("memberName")
		params["id"] = r.URL.Query().Get("id")
		var out map[string]any
		if err := s.sidecar.CallInto("templates.member", params, &out, 20*time.Second); err != nil {
			writeErr(w, http.StatusBadGateway, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, okPayload(out))
		return
	}
	if project != nil {
		params["frameworkSrc"] = project.Source.FrameworkSrc
	}
	var out map[string]any
	if err := s.sidecar.CallInto("templates.list", params, &out, 20*time.Second); err != nil {
		writeErr(w, http.StatusBadGateway, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, okPayload(out))
}

// ── 中间件 ────────────────────────────────────────────────────────

func isLocalAddr(addr string) bool {
	host, _, err := net.SplitHostPort(addr)
	if err != nil {
		host = addr
	}
	if host == "" || host == "localhost" {
		return true
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}

func selfBaseURL(addr string) string {
	host, port, err := net.SplitHostPort(addr)
	if err != nil {
		return "http://127.0.0.1:8788"
	}
	if host == "" || host == "0.0.0.0" || host == "::" {
		host = "127.0.0.1"
	}
	return fmt.Sprintf("http://%s:%s", host, port)
}

// resolveRepoRoot 定位仓库根：优先 flag，其次从 cwd / 可执行文件位置向上找 packages/studio。
func resolveRepoRoot(flagRoot string) string {
	if flagRoot != "" {
		if abs, err := filepath.Abs(flagRoot); err == nil {
			return abs
		}
	}
	tryFrom := func(start string) (string, bool) {
		dir := start
		for i := 0; i < 10; i++ {
			if _, err := os.Stat(filepath.Join(dir, "packages", "studio", "analyzer", "src", "index.mjs")); err == nil {
				return dir, true
			}
			// 允许直接把 -root 指向 packages/studio
			if _, err := os.Stat(filepath.Join(dir, "..", "analyzer", "src", "index.mjs")); err == nil {
				if abs, err := filepath.Abs(filepath.Join(dir, "..", "..")); err == nil {
					return abs, true
				}
			}
			parent := filepath.Dir(dir)
			if parent == dir {
				break
			}
			dir = parent
		}
		return "", false
	}
	if wd, err := os.Getwd(); err == nil {
		if root, ok := tryFrom(wd); ok {
			return root
		}
	}
	if exe, err := os.Executable(); err == nil {
		if root, ok := tryFrom(filepath.Dir(exe)); ok {
			return root
		}
	}
	wd, _ := os.Getwd()
	return wd
}

// spaHandler 托管前端产物，非 /api 的未命中路径回退到 index.html。
func spaHandler(dir string) http.Handler {
	fs := http.FileServer(http.Dir(dir))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api/") {
			http.NotFound(w, r)
			return
		}
		target := filepath.Join(dir, filepath.FromSlash(strings.TrimPrefix(r.URL.Path, "/")))
		if info, err := os.Stat(target); err != nil || info.IsDir() {
			http.ServeFile(w, r, filepath.Join(dir, "index.html"))
			return
		}
		fs.ServeHTTP(w, r)
	})
}

// withCORS 允许本地前端（Vite dev server / 预览宿主）跨端口访问。
func withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin != "" && (strings.HasPrefix(origin, "http://localhost:") ||
			strings.HasPrefix(origin, "http://127.0.0.1:") ||
			strings.HasPrefix(origin, "http://[::1]:")) {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
			w.Header().Set("Vary", "Origin")
		}
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func withLogging(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasPrefix(r.URL.Path, "/api/") || r.URL.Path == "/api/events" {
			next.ServeHTTP(w, r)
			return
		}
		start := time.Now()
		next.ServeHTTP(w, r)
		log.Printf("%s %s (%s)", r.Method, r.URL.Path, time.Since(start).Round(time.Millisecond))
	})
}
