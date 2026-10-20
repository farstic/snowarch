// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-06-S04 — reading a version out of whatever a tool decided to print.
//
// Four tools, four formats, and three of them carry a suffix that is not part of the version:
// `git version 2.39.5 (Apple Git-146)`, `git version 2.47.0.windows.1`, `v22.11.0`. The parsers are
// deliberately narrow — first semver-looking triple on the first line — because a parser that is
// clever about vendor suffixes is a parser that will be wrong about the next vendor.
const TRIPLE = /(\d+)\.(\d+)\.(\d+)/;

/** `{ major, minor, patch }`, or null when the text carries no version at all. */
export function parseVersion(text) {
  const first = String(text ?? '').split('\n').find((l) => l.trim() !== '') ?? '';
  const m = TRIPLE.exec(first);
  if (!m) return null;
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]), raw: m[0] };
}

/** -1 · 0 · 1, comparing two `{major,minor,patch}`. */
export function compareVersion(a, b) {
  for (const k of ['major', 'minor', 'patch']) {
    if (a[k] !== b[k]) return a[k] < b[k] ? -1 : 1;
  }
  return 0;
}

/**
 * Is `text`'s version at least `floor`?
 *
 * `floor` is a STRING read from `engine.config.json` and parsed here — never a number typed into
 * this file. AC 7 lowers the configured floor in a temp copy and expects the threshold to move,
 * which only works if nothing in the code remembers what the floor used to be.
 */
export function meetsFloor(text, floor) {
  const found = parseVersion(text);
  const want = parseVersion(floor);
  if (!found || !want) return { ok: false, found, want };
  return { ok: compareVersion(found, want) >= 0, found, want };
}

export const formatVersion = (v) => (v ? `${v.major}.${v.minor}.${v.patch}` : null);
