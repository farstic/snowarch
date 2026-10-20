#!/usr/bin/env bash
# Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
# snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
# render-drawio.sh — render every *.drawio under a directory to PNG (and/or SVG), LOCALLY,
# using the draw.io Desktop CLI. This is the house renderer for client-ready figures produced
# by the Diagramming Specialist (draw.io = the polished, NOT-Mermaid format). Companion to
# render-diagrams.sh (which renders Mermaid). macOS / Linux.
#
# Why draw.io (not Mermaid) for documents: Word/.docx must embed a rendered, house-styled
# figure — never a Mermaid code block. The Diagramming Specialist emits .drawio; this script
# rasterises it so md-to-docx.py can embed the PNG.
#
# CONFIDENTIALITY (non-negotiable): draw.io Desktop renders LOCALLY. Nothing is sent to an
# external service — a ServiceNow architecture diagram can carry client-identifying structure.
#
# Usage: scripts/render-drawio.sh [DIR] [FORMAT] [SCALE]
#   DIR     directory scanned recursively (default: .)
#   FORMAT  png (default) | svg | pdf
#   SCALE   PNG pixel scale for crispness (default: 3; ignored for svg/pdf)
#
# Install the renderer once: brew install --cask drawio   (macOS)
set -uo pipefail
DIR="${1:-.}"; FMT="${2:-png}"; SCALE="${3:-3}"

DRAWIO="$(command -v drawio || true)"
for c in "/Applications/draw.io.app/Contents/MacOS/draw.io" \
         "/Applications/drawio.app/Contents/MacOS/drawio" \
         "/usr/bin/drawio"; do
  [[ -z "$DRAWIO" && -x "$c" ]] && DRAWIO="$c"
done
if [[ -z "$DRAWIO" ]]; then
  echo "ERROR: draw.io Desktop not found. Install it: brew install --cask drawio" >&2
  exit 3
fi

ok=0; fail=0; found=0
while IFS= read -r -d '' f; do
  found=$((found + 1))
  out="${f%.drawio}.${FMT}"
  echo "rendering $(basename "$f") -> $(basename "$out")"
  args=(-x -f "$FMT" -o "$out" -b 8 --no-sandbox)
  [[ "$FMT" == "png" ]] && args+=(-s "$SCALE")   # white background by default (no -t/--transparent)
  if "$DRAWIO" "${args[@]}" "$f" >/dev/null 2>&1; then
    ok=$((ok + 1))
  else
    fail=$((fail + 1)); echo "failed: $f"
  fi
done < <(find "$DIR" -type f -name '*.drawio' -print0)

[[ $found -eq 0 ]] && { echo "No .drawio files under $DIR"; exit 0; }
echo "done: $ok rendered, $fail failed  ($DIR)"
[[ $fail -gt 0 ]] && exit 1 || exit 0
