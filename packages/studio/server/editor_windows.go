//go:build windows

package main

import (
	"os/exec"
	"strings"
	"syscall"
)

// shellCommand 构造外部进程的启动命令。
//
// Windows 上 VS Code 的安装形态是 `code.cmd`，必须经 cmd.exe 执行；而 cmd.exe 会对
// 参数做**二次解析**：os/exec 的默认转义只处理空格与引号，挡不住 `& | < > ^`。
// 具体后果：目标工程里若存在名为 `a&calc.ts` 的文件，`cmd /c code.cmd a&calc.ts`
// 会被 cmd 拆成两条命令。
//
// 因此这里不走 os/exec 的参数转义，而是自己拼出完整命令行交给 SysProcAttr.CmdLine：
// 每个参数用双引号包裹（cmd 在引号内不解释 & | < > ^），再把仍会展开的 % 与 ! 转义。
func shellCommand(resolved string, args []string) *exec.Cmd {
	if !isShellScript(resolved) {
		return exec.Command(resolved, args...)
	}
	parts := make([]string, 0, len(args)+1)
	parts = append(parts, cmdQuote(resolved))
	for _, a := range args {
		parts = append(parts, cmdQuote(a))
	}
	cmd := exec.Command("cmd")
	cmd.SysProcAttr = &syscall.SysProcAttr{CmdLine: "/c " + strings.Join(parts, " ")}
	return cmd
}

// cmdQuote 把参数包装成 cmd.exe 能安全传递的形式。
//
// 双引号内的 & | < > ^ 不会被 cmd 解释；但 %VAR% 与延迟展开的 !VAR! 即使
// 在引号内也会展开，所以对这两个字符加 ^ 转义。
func cmdQuote(s string) string {
	r := strings.NewReplacer(
		`"`, `""`,
		`%`, `^%`,
		`!`, `^!`,
	)
	return `"` + r.Replace(s) + `"`
}
