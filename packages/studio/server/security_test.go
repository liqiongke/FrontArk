package main

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"unicode/utf16"
)

// ── 路径边界 ────────────────────────────────────────────────────────

func TestCheckEditablePath(t *testing.T) {
	cases := []struct {
		path string
		ok   bool
		why  string
	}{
		{"/proj/src/pages/a/view.tsx", true, "正常源码"},
		{"/proj/src/pages/a/view.ts", true, ""},
		{"/proj/src/index.css", true, ""},
		{"/proj/src/logo.png", false, "非白名单扩展名"},
		{"/proj/src/node_modules/x/index.ts", false, "node_modules 在段中间也要拦"},
		{"/proj/dist/bundle.ts", false, "产物目录"},
		{"/proj/.git/config.json", false, ".git"},
		{"/proj/src-tauri/target/debug/x.ts", false, "构建目录"},
		{"/proj/dist-utils.ts", true, "dist 必须按段匹配，不能误伤 dist-utils.ts"},
		{"/proj/coverage/a.css", false, ""},
	}
	for _, c := range cases {
		got := checkEditablePath(c.path) == nil
		if got != c.ok {
			t.Errorf("checkEditablePath(%q) = %v，期望 %v（%s）", c.path, got, c.ok, c.why)
		}
	}
}

func TestResolveWritePathIsFileScopedForThemes(t *testing.T) {
	dir := t.TempDir()
	projRoot := filepath.Join(dir, "app")
	fwRoot := filepath.Join(dir, "framework")
	mustMkdir(t, filepath.Join(projRoot, "src"))
	mustMkdir(t, filepath.Join(fwRoot, "src", "ui", "styles"))

	theme := filepath.Join(fwRoot, "src", "ui", "styles", "theme.css")
	mustWrite(t, theme, ":root {}\n")
	other := filepath.Join(fwRoot, "src", "ui", "styles", "other.css")
	mustWrite(t, other, ":root {}\n")
	// 框架源码里一个"看起来很像"的目标文件
	inner := filepath.Join(fwRoot, "src", "index.ts")
	mustWrite(t, inner, "export {};\n")

	p := &Project{
		ID:       "t",
		RootPath: filepath.ToSlash(projRoot),
		Source:   ProjectSource{FrameworkSrc: filepath.ToSlash(filepath.Join(fwRoot, "src"))},
		ThemeFiles: []string{
			filepath.ToSlash(theme),
			filepath.ToSlash(filepath.Join(projRoot, "src", "index.css")),
		},
	}

	if _, err := p.ResolveWritePath(filepath.ToSlash(filepath.Join(projRoot, "src", "a.ts"))); err != nil {
		t.Fatalf("工程根内的文件应可写：%v", err)
	}
	if _, err := p.ResolveWritePath(filepath.ToSlash(theme)); err != nil {
		t.Fatalf("列出的主题文件应可写：%v", err)
	}
	// 关键回归：框架包里的**其它**文件不能写（旧实现把整个 packages/framework 放进白名单）
	if _, err := p.ResolveWritePath(filepath.ToSlash(inner)); err == nil {
		t.Fatal("框架包里的非主题文件不应可写（写权限必须精确到文件）")
	}
	if _, err := p.ResolveWritePath(filepath.ToSlash(other)); err == nil {
		t.Fatal("同目录下的另一个 css 也不应可写")
	}
	// 读权限可以更宽：框架源码要能在只读面板里查看
	if _, err := p.ResolvePath(filepath.ToSlash(inner)); err != nil {
		t.Fatalf("框架源码应可读：%v", err)
	}
	if _, err := p.ResolvePath(filepath.ToSlash(filepath.Join(dir, "outside.ts"))); err == nil {
		t.Fatal("工程之外应不可读")
	}
}

// ── 环境变量脱敏 ────────────────────────────────────────────────────

func TestMaskEnv(t *testing.T) {
	out, masked := maskEnv(map[string]string{
		"VITE_BASE_URL":               "http://127.0.0.1:3001/api",
		"VITE_AUTH_TOKEN_EXPIRE_TIME": "7200",
		"APP_SECRET":                  "s3cr3t",
		"MY_PASSWORD":                 "p",
		"EMPTY_TOKEN":                 "",
	})
	if out["VITE_BASE_URL"] != "http://127.0.0.1:3001/api" {
		t.Error("非敏感值不应被改动")
	}
	for _, k := range []string{"VITE_AUTH_TOKEN_EXPIRE_TIME", "APP_SECRET", "MY_PASSWORD"} {
		if out[k] != maskedValue {
			t.Errorf("%s 应被掩码，实际 %q", k, out[k])
		}
	}
	if strings.Contains(strings.Join([]string{out["APP_SECRET"]}, ""), "s3cr3t") {
		t.Error("敏感值不得出现明文")
	}
	if len(masked) != 3 {
		t.Errorf("掩码清单应有 3 项，实际 %v", masked)
	}
}

func TestProjectSourceMarshalDropsEnv(t *testing.T) {
	src := ProjectSource{
		PagesDir:     "/p/src/pages",
		FrameworkSrc: "/fw/src",
		Env:          map[string]string{"VITE_TOKEN": "super-secret"},
		EnvSources:   map[string]string{"VITE_TOKEN": ".env"},
	}
	raw, err := json.Marshal(&Project{ID: "x", Source: src})
	if err != nil {
		t.Fatalf("序列化失败：%v", err)
	}
	if strings.Contains(string(raw), "super-secret") || strings.Contains(string(raw), `"env"`) {
		t.Fatalf("序列化结果不应包含 env：%s", raw)
	}
	if !strings.Contains(string(raw), "/fw/src") {
		t.Fatalf("常规字段必须保留：%s", raw)
	}

	// 反过来必须读得进来（否则 analyzer 的探测结果就白读了）
	var back ProjectSource
	if err := json.Unmarshal([]byte(`{"pagesDir":"/p","env":{"VITE_BASE_URL":"http://x"}}`), &back); err != nil {
		t.Fatalf("反序列化失败：%v", err)
	}
	if back.Env["VITE_BASE_URL"] != "http://x" {
		t.Fatalf("应能读入 env，实际 %#v", back.Env)
	}
}

// ── UTF-16 偏移对齐 ─────────────────────────────────────────────────

func TestApplyTextEditsUsesUTF16Offsets(t *testing.T) {
	// 中文在 UTF-16 里占 1 个 code unit，在 UTF-8 里占 3 字节。
	// analyzer（TS Compiler API）给的是 UTF-16 偏移，这里必须按同一口径换算。
	text := "const a = '产品名称';"
	// UTF-16 单元索引：         0123456789...
	start := strings.Index(text, "产品名称")
	if start < 0 {
		t.Fatal("fixture 有问题")
	}
	units := utf16.Encode([]rune(text))
	uStart := len(utf16.Encode([]rune(text[:start])))
	uEnd := uStart + len(utf16.Encode([]rune("产品名称")))
	if uStart == start {
		t.Log("该 fixture 意外地 UTF-8/UTF-16 同偏移，测试意义有限")
	}
	_ = units

	got, err := applyTextEdits(text, []PlanEdit{{Start: uStart, End: uEnd, NewText: "单价"}})
	if err != nil {
		t.Fatalf("应用失败：%v", err)
	}
	if got != "const a = '单价';" {
		t.Fatalf("结果错误：%q", got)
	}
}

func TestApplyTextEditsRejectsOverlapAndOutOfRange(t *testing.T) {
	if _, err := applyTextEdits("abcdef", []PlanEdit{{Start: 1, End: 4, NewText: "x"}, {Start: 3, End: 5, NewText: "y"}}); err == nil {
		t.Fatal("重叠区间应被拒绝")
	}
	if _, err := applyTextEdits("abc", []PlanEdit{{Start: 0, End: 99, NewText: "x"}}); err == nil {
		t.Fatal("越界区间应被拒绝")
	}
	if _, err := applyTextEdits("abc", []PlanEdit{{Start: 2, End: 1, NewText: "x"}}); err == nil {
		t.Fatal("start > end 应被拒绝")
	}
}

// ── 命令模板 ────────────────────────────────────────────────────────

func TestValidateCommandTemplate(t *testing.T) {
	ok := []string{"code -g {file}:{line}:{column}", "myide --goto {file}:{line}", "tool {project}"}
	for _, s := range ok {
		if err := validateCommandTemplate(s); err != nil {
			t.Errorf("%q 应通过：%v", s, err)
		}
	}
	bad := []string{"", "   ", "calc", "a && b {file}", "a | b {file}", "a;b {file}"}
	for _, s := range bad {
		if err := validateCommandTemplate(s); err == nil {
			t.Errorf("%q 应被拒绝", s)
		}
	}
}

func TestEditorOpenRejectsUnknownID(t *testing.T) {
	svc := NewEditorService("")
	// 白名单外的 ID：这是请求体唯一能影响命令的地方，必须直接拒绝。
	if _, err := svc.Open("definitely-not-installed", "/tmp/x.ts", 1, 1, "/tmp"); err == nil {
		t.Fatal("白名单外的编辑器 ID 必须被拒绝")
	}
	// 未配置自定义模板时应报错，而不是回落到"执行请求体给的命令"。
	if _, err := svc.Open(customEditorID, "/tmp/x.ts", 1, 1, "/tmp"); err == nil {
		t.Fatal("未配置自定义模板时应报错")
	}
	// 模板校验：没有占位符 / 含 shell 元字符的模板要拦下来。
	if err := svc.SetCustom("", "calc"); err == nil {
		t.Fatal("缺少占位符的模板应被拒绝")
	}
	if err := svc.SetCustom("", "a && b {file}"); err == nil {
		t.Fatal("命令名含元字符的模板应被拒绝")
	}
	// 合法模板可以设置（cfgDir 为空时不落盘，不会污染工作区）。
	if err := svc.SetCustom("", "code -g {file}:{line}:{column}"); err != nil {
		t.Fatalf("合法模板应被接受：%v", err)
	}
	if svc.Custom() == "" {
		t.Fatal("自定义模板应已生效")
	}
}

// ── 结构校验 ────────────────────────────────────────────────────────

func TestStaleErrorIsMatchable(t *testing.T) {
	err := &StaleError{File: "/a.ts", Reason: "被外部改了"}
	if !errors.Is(err, ErrStale) {
		t.Fatal("StaleError 必须能被 errors.Is 识别为 ErrStale（HTTP 层据此回 409）")
	}
	if errors.Is(os.ErrNotExist, ErrStale) {
		t.Fatal("其它错误不能被误判为 stale")
	}
}

// ── 监听地址与写请求来源（局域网暴露的两道前置防线） ────────────────

func TestIsLocalAddrTreatsWildcardBindAsPublic(t *testing.T) {
	cases := map[string]bool{
		"127.0.0.1:8788": true,
		"localhost:8788": true,
		"[::1]:8788":     true,
		// 空 host 在 Go 里等价于 0.0.0.0（监听所有网卡）。若把它判成"本机"，
		// `-addr :8788` 就绕过了"对外必须提供 -token"的检查。
		":8788":             false,
		"0.0.0.0:8788":      false,
		"192.168.1.10:8788": false,
	}
	for addr, want := range cases {
		if got := isLocalAddr(addr); got != want {
			t.Errorf("isLocalAddr(%q) = %v, want %v", addr, got, want)
		}
	}
}

func TestCheckWriteSourceBlocksCrossSite(t *testing.T) {
	cases := []struct {
		name      string
		origin    string
		fetchSite string
		want      bool
	}{
		{name: "无 Origin（curl / 同源导航）", want: true},
		{name: "Vite dev server", origin: "http://localhost:5174", want: true},
		{name: "同源 SPA", origin: "http://127.0.0.1:8788", want: true},
		{name: "跨站 Origin", origin: "http://evil.example", want: false},
		{name: "跨站 Fetch Metadata", fetchSite: "cross-site", want: false},
		{name: "同站", fetchSite: "same-site", want: true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			r := httptest.NewRequest(http.MethodPost, "/api/edit/plan", strings.NewReader("{}"))
			if tc.origin != "" {
				r.Header.Set("Origin", tc.origin)
			}
			if tc.fetchSite != "" {
				r.Header.Set("Sec-Fetch-Site", tc.fetchSite)
			}
			if got := checkWriteSource(httptest.NewRecorder(), r); got != tc.want {
				t.Errorf("checkWriteSource = %v, want %v", got, tc.want)
			}
		})
	}
}

func TestDecodeBodyGuards(t *testing.T) {
	t.Run("非 JSON 的 Content-Type 被拒", func(t *testing.T) {
		r := httptest.NewRequest(http.MethodPost, "/api/edit/plan", strings.NewReader(`{"title":"x"}`))
		r.Header.Set("Content-Type", "text/plain")
		rec := httptest.NewRecorder()
		var out struct{ Title string }
		if decodeBody(rec, r, &out) {
			t.Fatal("text/plain 属于「简单请求」，不触发 CORS 预检，必须被拒绝")
		}
		if rec.Code != http.StatusUnsupportedMediaType {
			t.Errorf("status = %d, want %d", rec.Code, http.StatusUnsupportedMediaType)
		}
	})

	t.Run("超过请求体上限被拒", func(t *testing.T) {
		body := `{"title":"` + strings.Repeat("a", maxBodyBytes) + `"}`
		r := httptest.NewRequest(http.MethodPost, "/api/edit/plan", strings.NewReader(body))
		r.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()
		var out struct{ Title string }
		if decodeBody(rec, r, &out) {
			t.Fatal("超过上限的请求体必须被拒绝")
		}
		if rec.Code != http.StatusRequestEntityTooLarge {
			t.Errorf("status = %d, want %d", rec.Code, http.StatusRequestEntityTooLarge)
		}
	})
}

// ── helpers ─────────────────────────────────────────────────────────

func mustMkdir(t *testing.T, dir string) {
	t.Helper()
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
}

func mustWrite(t *testing.T, file, content string) {
	t.Helper()
	mustMkdir(t, filepath.Dir(file))
	if err := os.WriteFile(file, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
}
