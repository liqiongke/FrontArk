//go:build !windows

package main

import "os/exec"

// shellCommand 在类 Unix 系统上直接执行。
//
// 不存在 cmd.exe 的二次解析问题：os/exec 把参数作为独立 argv 逐个交给 execve，
// 不经过任何 shell（.cmd/.bat 也不适用于这些平台）。
func shellCommand(resolved string, args []string) *exec.Cmd {
	return exec.Command(resolved, args...)
}
