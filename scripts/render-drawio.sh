#!/usr/bin/env bash
# Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
# snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
# render-drawio.sh — render every *.drawio under a directory to PNG (and/or SVG), LOCALLY,
# using the draw.io Desktop CLI. This is the house renderer for client-ready figures produced
# by the Diagramming Specialist (draw.io = the polished, NOT-Mermaid format). Companion to
# render-diagrams.sh (which renders Mermaid). macOS, Linux and Windows (Git Bash).
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
# Install the renderer once:
#   macOS    brew install --cask drawio
#   Windows  the zip whose name ends in -windows.zip, from https://github.com/jgraph/drawio-desktop/releases,
#            unpacked into %LOCALAPPDATA%\Programs\drawio (no administrator rights; the installer needs them)
#   Linux    the .deb, .rpm or AppImage from the same page
set -uo pipefail
DIR="${1:-.}"; FMT="${2:-png}"; SCALE="${3:-3}"

pick() { [[ -z "$DRAWIO" && -x "$1" ]] && DRAWIO="$1"; }
# Windows hands Git Bash its folders as C:\… paths, which bash cannot test; cygpath makes each a /c/… one.
unixpath() { if command -v cygpath >/dev/null 2>&1; then cygpath -u "$1"; else printf '%s\n' "$1"; fi; }

# find_drawio — set DRAWIO to the draw.io Desktop CLI, or say why not and return 3. It only LOOKS: it never starts
# anything, which is what lets the tests source this file and ask where it would look.
find_drawio() {
  local os n how
  # The platform decides where draw.io Desktop is looked for and which install line the error gives.
  # uname says Darwin on macOS, MINGW64_NT-… in Git Bash, MSYS_NT-… in MSYS2 and CYGWIN_NT-… in Cygwin.
  case "$(uname -s 2>/dev/null)" in
    Darwin) os=mac ;;
    MINGW*|MSYS*|CYGWIN*) os=windows ;;
    *) os=linux ;;
  esac

  # PATH first, under the names draw.io Desktop goes by: `drawio` (macOS, Linux, and a shim someone made),
  # `draw.io` and `draw.io.exe` (Windows: the zip and the installers all make draw.io.exe, and a folder on
  # PATH is the one thing a person without administrator rights can add).
  DRAWIO=""
  for n in drawio draw.io draw.io.exe; do
    [[ -z "$DRAWIO" ]] && DRAWIO="$(command -v "$n" || true)"
  done

  # Then the places each platform's install lands, in order. A variable that is unset or empty adds no place:
  # it must never become a path at the root.
  case "$os" in
    mac)
      pick "/Applications/draw.io.app/Contents/MacOS/draw.io"
      pick "/Applications/drawio.app/Contents/MacOS/drawio" ;;
    windows)
      if [[ -n "${LOCALAPPDATA:-}" ]]; then
        pick "$(unixpath "$LOCALAPPDATA")/Programs/drawio/draw.io.exe"      # the zip
        pick "$(unixpath "$LOCALAPPDATA")/Programs/draw.io/draw.io.exe"     # the installer, for one user
      fi
      if [[ -n "${PROGRAMFILES:-}" ]]; then
        pick "$(unixpath "$PROGRAMFILES")/draw.io/draw.io.exe"              # the installer, for every user
      fi ;;
    *)
      pick "/usr/bin/drawio" ;;
  esac

  [[ -n "$DRAWIO" ]] && return 0
  case "$os" in
    mac) how='Install it: brew install --cask drawio' ;;
    windows) how='Without administrator rights: download the zip whose name ends in -windows.zip from https://github.com/jgraph/drawio-desktop/releases and unpack it into %LOCALAPPDATA%\Programs\drawio, so that draw.io.exe is in that folder. (The installer on the same page needs administrator rights.)' ;;
    *) how='Install the .deb or .rpm from https://github.com/jgraph/drawio-desktop/releases, or put its AppImage on PATH under the name drawio.' ;;
  esac
  printf 'ERROR: draw.io Desktop not found. %s\n' "$how" >&2
  return 3
}

# Sourced (the tests do), the file stops here: find_drawio is defined and nothing has run.
[[ "${BASH_SOURCE[0]:-}" != "$0" ]] && return 0

find_drawio || exit $?

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
