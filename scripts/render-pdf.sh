#!/usr/bin/env bash
# Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
# snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
# render-pdf.sh — macOS/Linux companion to render-pdf-pages.ps1 (which uses Word COM on Windows).
# Renders a .docx (or .md, via md-to-docx.py) to PDF using LibreOffice headless, for visual QA.
#
# Usage:
#   scripts/render-pdf.sh <file.docx> [outdir]
#   scripts/render-pdf.sh <file.md>  [outdir]   # converts md -> docx -> pdf
#
# Requires LibreOffice (`soffice` on PATH, or /Applications/LibreOffice.app on macOS).
set -euo pipefail

SRC="${1:?usage: render-pdf.sh <file.docx|file.md> [outdir]}"
OUTDIR="${2:-$(dirname "$SRC")}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# locate soffice
SOFFICE="$(command -v soffice || true)"
if [[ -z "$SOFFICE" && -x "/Applications/LibreOffice.app/Contents/MacOS/soffice" ]]; then
  SOFFICE="/Applications/LibreOffice.app/Contents/MacOS/soffice"
fi
if [[ -z "$SOFFICE" ]]; then
  echo "ERROR: LibreOffice (soffice) not found. Install it (brew install --cask libreoffice) to render PDFs on Mac." >&2
  exit 3
fi

# if given a .md, convert to .docx first
if [[ "$SRC" == *.md ]]; then
  DOCX="${SRC%.md}.docx"
  python3 "$HERE/md-to-docx.py" --src "$SRC" --out "$DOCX"
  SRC="$DOCX"
fi

mkdir -p "$OUTDIR"
# headless conversion needs an isolated profile to avoid clashing with a running LibreOffice
PROFILE="$(mktemp -d)"
"$SOFFICE" --headless "-env:UserInstallation=file://$PROFILE" \
  --convert-to pdf --outdir "$OUTDIR" "$SRC" >/dev/null
rm -rf "$PROFILE"

PDF="$OUTDIR/$(basename "${SRC%.*}").pdf"
echo "OK: wrote $PDF ($(wc -c < "$PDF" | tr -d ' ') bytes)"
