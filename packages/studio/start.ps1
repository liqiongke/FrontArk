# ---------------------------------------------------------------
# Start FrontArk Studio: Go API server + Studio web + preview host
#
#   packages\studio\start.ps1  [-Target d:\path\to\app] [-Addr 127.0.0.1:8788]
#
# Three processes, each in its own window; close the window to stop.
# Frontend package manager: pnpm (only pnpm-lock.yaml is committed).
#
# NOTE: this file is intentionally ASCII-only. Windows PowerShell 5.1
# reads a UTF-8 file WITHOUT BOM as ANSI/GBK, which turns non-ASCII
# text into mojibake and breaks parsing. Keep it ASCII, or save it as
# "UTF-8 with BOM".
# ---------------------------------------------------------------
param(
    [string]$Addr = '127.0.0.1:8788',
    [string]$Token = ''
)

$ErrorActionPreference = 'Stop'

$studioDir = $PSScriptRoot
$repoRoot = Split-Path -Parent (Split-Path -Parent $studioDir)
$serverDir = Join-Path $studioDir 'server'
$webDir = Join-Path $studioDir 'web'
$previewDir = Join-Path $studioDir 'preview'

if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
    Write-Host 'pnpm not found. Install it with one of:' -ForegroundColor Red
    Write-Host '  corepack enable pnpm' -ForegroundColor Yellow
    Write-Host '  npm i -g pnpm' -ForegroundColor Yellow
    exit 1
}

if (-not (Test-Path (Join-Path $webDir 'node_modules'))) {
    Write-Host 'First run: installing workspace deps (pnpm install at repo root)...' -ForegroundColor Cyan
    Push-Location $repoRoot
    pnpm install
    Pop-Location
}

$serverArgs = @('run', '.', '-root', $repoRoot, '-addr', $Addr)
if ($Token -ne '') { $serverArgs += @('-token', $Token) }

Write-Host "Starting Go server   http://$Addr" -ForegroundColor Green
Start-Process -FilePath 'cmd.exe' `
    -ArgumentList '/k', "cd /d `"$serverDir`" && go $($serverArgs -join ' ')"

Start-Sleep -Seconds 1

Write-Host 'Starting preview host http://127.0.0.1:7099' -ForegroundColor Green
Start-Process -FilePath 'cmd.exe' `
    -ArgumentList '/k', "cd /d `"$previewDir`" && pnpm dev"

Start-Sleep -Seconds 1

Write-Host 'Starting Studio web   http://localhost:5174' -ForegroundColor Green
Start-Process -FilePath 'cmd.exe' `
    -ArgumentList '/k', "cd /d `"$webDir`" && pnpm dev"

Write-Host ''
Write-Host 'Open http://localhost:5174 in your browser.' -ForegroundColor Yellow
Write-Host 'Then: add a project -> point it at an app folder (e.g. apps/demo) -> browse and edit.' -ForegroundColor Yellow
