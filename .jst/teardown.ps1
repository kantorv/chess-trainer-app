#!/usr/bin/env pwsh
# .jst/teardown.ps1 — Windows twin of teardown.sh. MANUAL cleanup, not run by
# any skill. See teardown.sh for the full explanation.
#
# Usage:  pwsh -NoProfile -File .jst\teardown.ps1 [--deps]
$ErrorActionPreference = 'Stop'

$WorktreeDir = if ($env:JST_WORKTREE_DIR) { $env:JST_WORKTREE_DIR } else { git rev-parse --show-toplevel }
Set-Location $WorktreeDir

$WipeDeps = ($args.Count -ge 1 -and $args[0] -eq '--deps')

Remove-Item -Force -ErrorAction SilentlyContinue (Join-Path $WorktreeDir '.env.local')
Remove-Item -Recurse -Force -ErrorAction SilentlyContinue (Join-Path $WorktreeDir 'node_modules/.vite')
Remove-Item -Recurse -Force -ErrorAction SilentlyContinue (Join-Path $WorktreeDir 'dist')
Write-Host "teardown: removed .env.local, node_modules/.vite, dist"

if ($WipeDeps) {
    Remove-Item -Recurse -Force -ErrorAction SilentlyContinue (Join-Path $WorktreeDir 'node_modules')
    Write-Host "teardown: removed node_modules (--deps) — re-run .jst/bootstrap.ps1 before working here again"
}

Write-Host "teardown: done. This does not remove the git worktree itself — use 'git worktree remove' for that."
