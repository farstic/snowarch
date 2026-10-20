#!/usr/bin/env bash
# Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
# snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
# render-diagrams.sh — render every *.mmd under a directory to *.svg (or png/pdf), LOCALLY.
#
# Wraps @mermaid-js/mermaid-cli (mmdc) via npx (or a global mmdc if present).
#
# CONFIDENTIALITY (non-negotiable): renders LOCALLY only. It never sends a diagram to an
# external render service (kroki.io / mermaid.ink / etc.) — a ServiceNow architecture
# diagram can carry client-identifying structure, and that would breach the firewall.
#
# Usage: bash scripts/render-diagrams.sh [DIR] [FORMAT]
#   DIR     directory to scan recursively (default: .)
#   FORMAT  svg (default) | png | pdf
#
# If puppeteer cannot find a browser, install one once:
#   npx puppeteer browsers install chrome-headless-shell
# (On Windows, prefer scripts/render-diagrams.ps1 — it reuses Edge/Chrome, no download.)

set -uo pipefail
DIR="${1:-.}"
FMT="${2:-svg}"

command -v node >/dev/null 2>&1 || { echo "Node.js not found. Install from https://nodejs.org and re-run."; exit 1; }
if command -v mmdc >/dev/null 2>&1; then RUN=(mmdc); else RUN=(npx -y -p @mermaid-js/mermaid-cli mmdc); fi

# House-style Mermaid theme (palette/fonts/spacing) — applied automatically when present.
THEME="$(cd "$(dirname "$0")" && pwd)/mermaid-theme.json"
THEMEARGS=(); [[ -f "$THEME" ]] && THEMEARGS=(-c "$THEME")

# UTF-8, no BOM (printf does not add one) — mmdc JSON.parses this file.
PCFG="$(mktemp)"; printf '{ "args": ["--no-sandbox"] }' > "$PCFG"

ok=0; fail=0; found=0
while IFS= read -r -d '' f; do
  found=$((found + 1))
  out="${f%.mmd}.${FMT}"
  echo "rendering $(basename "$f") -> $(basename "$out")"
  if "${RUN[@]}" -i "$f" -o "$out" -p "$PCFG" ${THEMEARGS[@]+"${THEMEARGS[@]}"} -b white; then ok=$((ok + 1)); else fail=$((fail + 1)); echo "failed: $f"; fi
done < <(find "$DIR" -type f -name '*.mmd' -print0)
rm -f "$PCFG"

[[ $found -eq 0 ]] && { echo "No .mmd files under $DIR"; exit 0; }
echo "done: $ok rendered, $fail failed  ($DIR)"
[[ $fail -gt 0 ]] && exit 1 || exit 0
