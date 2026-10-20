#!/usr/bin/env node
// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-03-S02 — generate vendor/docs-areas.txt from the citations themselves.
//
// The sparse checkout must never be narrower than the grounding rule requires, and never widened by
// hand. So the list is derived, and `--check` fails CI when the committed file and the citations
// disagree. Runs on a checkout with no submodule: the checkout is computed FROM this.
import { existsSync, readFileSync, writeFileSync, writeSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { scanRepo, areasOf } from '../tools/snowarch/lib/docs/citations.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = 'vendor/docs-areas.txt';

const args = process.argv.slice(2);
const write = args.includes('--write');
const check = args.includes('--check');
// Exactly one is required. No TTY sniffing, no `CI` environment check: nothing platform-dependent
// decides what a maintainer command does.
if (write === check) {
  writeSync(2, 'usage: node scripts/gen-docs-areas.mjs (--check | --write)\n');
  process.exit(2);
}

const { citations, warnings, skipped } = scanRepo({ root });
const areas = areasOf(citations);
const body = areas.map((a) => `markdown/${a}`).join('\n') + '\n';   // LF, no header, trailing newline

for (const s of skipped) writeSync(2, `note: scan root "${s}" does not exist yet — skipped\n`);
for (const w of warnings) writeSync(2, `warning: ${w.file}:${w.line}: ${w.reason} (${w.raw})\n`);

if (write) {
  writeFileSync(join(root, OUT), body);
  writeSync(1, `${OUT} written (${areas.length} areas)\n`);
  process.exit(0);
}

const current = existsSync(join(root, OUT)) ? readFileSync(join(root, OUT), 'utf8') : '';
if (current === body) {
  writeSync(1, `${OUT} up to date (${areas.length} areas)\n`);
  process.exit(0);
}
const now = new Set(areas.map((a) => `markdown/${a}`));
const was = new Set(current.split('\n').filter(Boolean));
const added = [...now].filter((a) => !was.has(a)).map((a) => `+${a.replace('markdown/', '')}`);
const removed = [...was].filter((a) => !now.has(a)).map((a) => `-${a.replace('markdown/', '')}`);
writeSync(2, `${OUT} is stale: ${[...added, ...removed].join(' ')} — `
  + 'run: node scripts/gen-docs-areas.mjs --write\n');
// The last statement: nothing follows it to skip.
process.exitCode = 2;
