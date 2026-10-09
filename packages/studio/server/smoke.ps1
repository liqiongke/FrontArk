# ---------------------------------------------------------------
# FrontArk Studio API smoke test (repeatable).
#
#   packages\studio\server\smoke.ps1                       # read-only checks
#   packages\studio\server\smoke.ps1 -Apply                # also applies + undoes one edit
#
# Requires the Go server to be running:
#   go -C packages/studio/server run . -root <repoRoot>
#
# ASCII-only on purpose (PowerShell 5.1 + UTF-8 without BOM = mojibake).
# ---------------------------------------------------------------
param(
    [string]$Base = 'http://127.0.0.1:8788',
    [string]$Target = '',
    [string]$Route = '/base/table',
    [switch]$Apply
)

$ErrorActionPreference = 'Stop'
$fail = 0

function Check([string]$label, [bool]$ok, [string]$extra = '') {
    $mark = if ($ok) { 'PASS' } else { 'FAIL' }
    if (-not $ok) { $script:fail++ }
    Write-Host ("[{0}] {1}{2}" -f $mark, $label, $(if ($extra) { " -- $extra" } else { '' }))
}

function Get-Json([string]$path) {
    return Invoke-RestMethod -Uri "$Base$path" -Method Get
}

function Post-Json([string]$path, $body) {
    $json = $body | ConvertTo-Json -Depth 24 -Compress
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
    return Invoke-RestMethod -Uri "$Base$path" -Method Post -Body $bytes `
        -ContentType 'application/json; charset=utf-8'
}

# ── health ───────────────────────────────────────────────────────
$health = Get-Json '/api/health'
Check 'GET /api/health' ($health.ok -eq $true)
Write-Host ("      repoRoot : {0}" -f $health.data.repoRoot)
Write-Host ("      analyzer : {0}" -f ($health.data.analyzer | ConvertTo-Json -Compress))

# ── project register ─────────────────────────────────────────────
if ($Target -eq '') {
    $repoRoot = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))
    $Target = Join-Path $repoRoot 'apps\demo'
}
$create = Post-Json '/api/projects' @{ rootPath = $Target }
$project = $create.data.project
Check 'POST /api/projects' ($null -ne $project) $project.name
Write-Host ("      pagesDir : {0}" -f $project.source.pagesDir)
Write-Host ("      framework: {0}" -f $project.source.frameworkSrc)
Check 'detected as frontark project' ($project.kind -eq 'frontark')

# ── pages ────────────────────────────────────────────────────────
$pages = Get-Json ("/api/projects/{0}/pages" -f $project.id)
Check 'GET pages' ($pages.data.pages.Count -gt 0) ("{0} pages" -f $pages.data.pages.Count)

# ── analyze ──────────────────────────────────────────────────────
$analysis = Get-Json ("/api/projects/{0}/pages/analyze?route={1}" -f $project.id, [uri]::EscapeDataString($Route))
$nodes = $analysis.data.nodes
Check 'GET page analyze' ($nodes.Count -gt 10) ("{0} nodes" -f $nodes.Count)
Check 'page level is L1' ($analysis.data.page.level -eq 'L1') $analysis.data.page.level
Check 'no blocking issue' (($analysis.data.issues | Where-Object { $_.level -eq 'error' }).Count -eq 0)

$titleNode = $nodes | Where-Object { $_.id -eq 'view.table1.items[1].title' } | Select-Object -First 1
Check 'found table column title node' ($null -ne $titleNode) $titleNode.value

# ── meta / templates / editors ───────────────────────────────────
$meta = Get-Json ("/api/projects/{0}/meta" -f $project.id)
Check 'GET meta (enums)' ($meta.data.enums.ViewType.members.Count -gt 0) ("{0} ViewType members" -f $meta.data.enums.ViewType.members.Count)

$tpl = Get-Json ("/api/templates?projectId={0}&containerKey=items" -f $project.id)
Check 'GET templates' ($tpl.data.candidates.Count -gt 0)

$editors = Get-Json '/api/editors?scan=1'
Check 'GET editors' ($null -ne $editors.data.editors) ("{0} detected" -f $editors.data.editors.Count)

# ── theme ────────────────────────────────────────────────────────
$theme = Get-Json ("/api/projects/{0}/theme" -f $project.id)
$rootTokens = ($theme.data.files | ForEach-Object { $_.tokens } | Where-Object { $_.selector -eq ':root' })
Check 'GET theme tokens' ($rootTokens.Count -gt 10) ("{0} :root tokens" -f $rootTokens.Count)

# ── source ───────────────────────────────────────────────────────
$viewFile = Join-Path $project.rootPath 'src\pages\base\table\view.tsx'
$src = Get-Json ("/api/source?projectId={0}&file={1}" -f $project.id, [uri]::EscapeDataString($viewFile))
Check 'GET source' ($src.data.text.Length -gt 0) ("{0} lines" -f $src.data.lines)

# ── edit plan / apply / undo ─────────────────────────────────────
if ($null -ne $titleNode) {
    $plan = Post-Json '/api/edit/plan' @{
        projectId = $project.id
        route     = $Route
        op        = @{ kind = 'set'; target = $titleNode.id; value = 'ProductNameSmoke' }
    }
    Check 'POST /api/edit/plan' ($plan.data.files.Count -eq 1) ("{0} file(s)" -f $plan.data.files.Count)

    if ($Apply -and $plan.ok) {
        $before = Get-Json ("/api/source?projectId={0}&file={1}" -f $project.id, [uri]::EscapeDataString($viewFile))
        $applied = Post-Json '/api/edit/apply' @{ projectId = $project.id; planId = $plan.data.id }
        Check 'POST /api/edit/apply' ($applied.data.record.files.Count -eq 1)

        $after = Get-Json ("/api/source?projectId={0}&file={1}" -f $project.id, [uri]::EscapeDataString($viewFile))
        $delta = $after.data.lines - $before.data.lines
        Check 'lossless write (line count unchanged)' ($delta -eq 0) ("delta={0}" -f $delta)
        Check 'only the target literal changed' ($after.data.text.Contains("'ProductNameSmoke'"))

        $undo = Post-Json '/api/edit/undo' @{ projectId = $project.id }
        Check 'POST /api/edit/undo' ($undo.ok -eq $true)
        $restored = Get-Json ("/api/source?projectId={0}&file={1}" -f $project.id, [uri]::EscapeDataString($viewFile))
        Check 'file restored to original bytes' ($restored.data.sha -eq $before.data.sha)
    }
}

# ── history ──────────────────────────────────────────────────────
$history = Get-Json ("/api/projects/{0}/history" -f $project.id)
Check 'GET history' ($null -ne $history.data.history) ("{0} records" -f $history.data.history.Count)

Write-Host ''
if ($fail -eq 0) {
    Write-Host 'ALL PASS' -ForegroundColor Green
    exit 0
} else {
    Write-Host ("{0} CHECK(S) FAILED" -f $fail) -ForegroundColor Red
    exit 1
}
