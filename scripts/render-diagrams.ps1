# Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
# snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
#Requires -Version 5.1
<#
.SYNOPSIS
  Render every *.mmd under a directory to *.svg (or png/pdf), LOCALLY.

.DESCRIPTION
  Wraps @mermaid-js/mermaid-cli (mmdc) via npx. Reuses an existing Chromium-family
  browser (Edge/Chrome) so no headless-Chromium download is needed on Windows.

  CONFIDENTIALITY (non-negotiable): renders LOCALLY only. It never sends a diagram to
  an external render service (kroki.io / mermaid.ink / etc.) — a ServiceNow architecture
  diagram can carry client-identifying structure, and that would breach the firewall.

.PARAMETER Path    Directory to scan recursively. Default: current directory.
.PARAMETER Format  svg (default) | png | pdf

.EXAMPLE
  pwsh scripts/render-diagrams.ps1 -Path clients/acme/hld/diagrams
#>
param(
  [string]$Path = ".",
  [ValidateSet("svg","png","pdf")][string]$Format = "svg"
)
$ErrorActionPreference = "Stop"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Error "Node.js not found. Install from https://nodejs.org and re-run."; exit 1
}

$root = (Resolve-Path $Path).Path
$mmd  = Get-ChildItem -Path $root -Recurse -Filter *.mmd -File -ErrorAction SilentlyContinue
if (-not $mmd) { Write-Output "No .mmd files found under $root"; exit 0 }

# Reuse an installed Chromium-family browser to avoid a headless-Chromium download.
$browser = @(
  "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
  "C:\Program Files\Microsoft\Edge\Application\msedge.exe",
  "C:\Program Files\Google\Chrome\Application\chrome.exe",
  "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if ($browser) { Write-Output "Browser: $browser" }
else { Write-Warning "No Edge/Chrome found; relying on a puppeteer-managed browser. If rendering fails, run once: npx puppeteer browsers install chrome-headless-shell" }

$mmdcGlobal = Get-Command mmdc -ErrorAction SilentlyContinue
$cfgPath = Join-Path ([System.IO.Path]::GetTempPath()) "snd-render-pptr.json"
# House-style Mermaid theme (palette/fonts/spacing) — applied automatically when present.
$themeFile = Join-Path $PSScriptRoot "mermaid-theme.json"
$themeArgs = @(); if (Test-Path $themeFile) { $themeArgs = @("-c", $themeFile); Write-Output "Theme: $themeFile" }
$ok = 0; $fail = 0; $i = 0
foreach ($f in $mmd) {
  $i++
  # Per-file puppeteer config with an ISOLATED --user-data-dir. Reusing the browser's
  # default profile makes the 2nd+ headless launch hang on the singleton lock (Windows);
  # a throwaway profile per file avoids it. Write UTF-8 WITHOUT BOM — mmdc JSON.parses it.
  $profDir = Join-Path ([System.IO.Path]::GetTempPath()) ("snd-render-prof-" + $i)
  $bargs = @("--no-sandbox", "--user-data-dir=$profDir")
  if ($browser) { $cfg = @{ executablePath = $browser; args = $bargs } | ConvertTo-Json -Compress }
  else          { $cfg = @{ args = $bargs } | ConvertTo-Json -Compress }
  [System.IO.File]::WriteAllText($cfgPath, $cfg)

  $out = [System.IO.Path]::ChangeExtension($f.FullName, "." + $Format)
  Write-Output ("rendering {0} -> {1}" -f $f.Name, (Split-Path $out -Leaf))
  if ($mmdcGlobal) {
    mmdc -i $f.FullName -o $out -p $cfgPath @themeArgs -b white
  } else {
    npx -y -p '@mermaid-js/mermaid-cli' mmdc -i $f.FullName -o $out -p $cfgPath @themeArgs -b white
  }
  if ($LASTEXITCODE -eq 0) { $ok++ } else { $fail++; Write-Warning "failed: $($f.Name)" }
}
Write-Output ("done: {0} rendered, {1} failed  ({2})" -f $ok, $fail, $root)
if ($fail -gt 0) { exit 1 } else { exit 0 }
