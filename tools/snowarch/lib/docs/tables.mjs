// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-09-C126 — a table row with more cells than its header, outside fences.
//
// GitHub's renderer cuts a cell at the first unescaped pipe, inside backticks too, and drops every
// cell past the header's count; a pipe escaped with a backslash survives (measured with
// `gh api markdown` on a synthetic table, 2026-10-11). Such a row reads whole in the file and renders
// short on the page, and no other gate notices: the ARC-09-C122 plan row lost every word of its
// status after "written: created" that way. `docs verify` runs this over every tracked Markdown file
// outside `vendor/`, whose corpus is upstream's to fix.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Cells in one table line, as GitHub counts them: unescaped pipes, one leading and trailing pipe off. */
export function cellCount(line) {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
  return s.split(/(?<!\\)\|/).length;
}

const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const DELIMITER = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;
/** A line that starts another block, which ends a table in GitHub's grammar even with a pipe in it. */
const BLOCK_START = /^ {0,3}(#{1,6}(\s|$)|>|[-*+]\s|\d{1,9}[.)]\s)/;

/** Every body row wider than its table's header: `{ file, line, cells, header }`, line 1-based. */
export function findWideRows(text, file = '<inline>') {
  const lines = text.replace(/\r/g, '').split('\n');
  const out = [];
  let fence = null;
  let header = null;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const opens = FENCE.exec(l);
    if (fence !== null) {
      if (opens && opens[1][0] === fence[0] && opens[1].length >= fence.length) fence = null;
      continue;
    }
    if (opens) { fence = opens[1]; header = null; continue; }
    if (header !== null) {
      if (l.trim() === '' || !l.includes('|') || BLOCK_START.test(l)) { header = null; }
      else {
        const cells = cellCount(l);
        if (cells > header) out.push({ file, line: i + 1, cells, header });
        continue;
      }
    }
    const next = lines[i + 1];
    if (l.includes('|') && next !== undefined && DELIMITER.test(next) && next.includes('-')
      && cellCount(next) === cellCount(l)) {
      header = cellCount(l);
      i += 1;
    }
  }
  return out;
}

/** The tracked Markdown files the check reads: everything git tracks outside `vendor/`. */
export function trackedMarkdown(root) {
  return execFileSync('git', ['-C', root, 'ls-files', '-z', '--', '*.md'], { encoding: 'utf8' })
    .split('\0').filter((f) => f && !f.startsWith('vendor/')).sort();
}

export function verifyTables({ root = process.cwd(), files } = {}) {
  const list = files ?? trackedMarkdown(root);
  const wide = list.flatMap((f) => findWideRows(readFileSync(join(root, f), 'utf8'), f));
  return { status: wide.length ? 'fail' : 'ok', scanned: list.length, wide };
}

export function formatTables(r) {
  const lines = r.wide.map((w) => `WIDE ${w.file}:${w.line} ${w.cells} cells, header ${w.header}`);
  if (r.wide.length) lines.push('A pipe ends a table cell, inside backticks too: escape it as \\| or reword the cell.');
  lines.push(`tables: ${r.scanned} file(s) | wide rows: ${r.wide.length}`);
  return { text: lines.join('\n'), code: r.wide.length ? 1 : 0 };
}
