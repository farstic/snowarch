// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * L01 — every `snow_*` token in an engine text is a tool the server actually has.
 *
 * P-04: the engine's texts cited tools by name, the server renamed 394 of them, and nothing
 * connected the two. A citation of a tool that does not exist fails at the worst possible
 * moment — mid-task, as `UNKNOWN_TOOL`, to a user who has no way to know the text was stale.
 */
import { isHistory, readLines } from '../lib/scan.mjs';

const TOKEN = /\bsnow_[a-z0-9_]+\b/g;
const PREFIXED = /\bmcp__[a-z0-9_-]+__(snow_[a-z0-9_]+)\b/g;

/** Levenshtein, capped: we only care whether it is ≤ `max`. */
function distance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
      best = Math.min(best, row[j]);
    }
    // Whole row already worse than the cap: no completion can come back under it.
    if (best > max) return max + 1;
    prev = row;
  }
  return prev[b.length];
}

/** `snow_core_query_records` → the multiset {core, query, records}, prefix dropped. */
const segments = (name) => name.split('_').slice(1).sort().join('_');

/**
 * The nearest real tool name, or null.
 *
 * Two passes, and the second is not decoration. Levenshtein ≤ 3 catches a misspelling; it does
 * NOT catch the most likely mistake with these names, which is remembering the segments in the
 * wrong order — `snow_core_query_records` for `snow_core_records_query` is eight edits apart and
 * one thought apart. The story's own criterion 2 expects that hint, and a distance-only
 * implementation cannot produce it. So a reordering of the same segments is checked first.
 */
function nearest(token, names) {
  const wanted = segments(token);
  for (const n of names) {
    if (n !== token && segments(n) === wanted) return n;
  }

  let best = null;
  let bestD = 4;
  for (const n of names) {
    const d = distance(token, n, 3);
    if (d < bestD) { bestD = d; best = n; }
  }
  return bestD <= 3 ? best : null;
}

export const id = 'L01';
export const title = 'every snow_ token names a tool the contract has';

export function run(ctx) {
  const names = new Set(ctx.contract.tools.map((t) => t.name));
  const findings = [];

  for (const file of ctx.files) {
    if (isHistory(file)) continue;
    const lines = readLines(ctx.root, file);
    lines.forEach((line, i) => {
      const tokens = new Set();
      for (const m of line.matchAll(TOKEN)) tokens.add(m[0]);
      for (const m of line.matchAll(PREFIXED)) tokens.add(m[1]);
      for (const token of tokens) {
        if (names.has(token)) continue;
        // A retired name is L03's finding, not L01's. Reporting it twice would make one defect
        // look like two and split the remedy across two messages.
        if (ctx.retiredNames[token] !== undefined) continue;
        const hint = nearest(token, names);
        findings.push({
          file,
          line: i + 1,
          message: `token ${token} not in contract${hint ? ` (nearest: ${hint})` : ''}`,
        });
      }
    });
  }
  return findings;
}
