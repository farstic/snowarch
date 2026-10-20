// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * How a finding reaches a reader: one line each, then a status line per check.
 *
 * The JSON shape is fixed by ARC-08 — its doctor imports these check modules and merges the
 * findings into its own report, so the ids and the field names here are a contract with that
 * story, not a formatting choice.
 */

/** A check produced no findings but could not actually run — never rendered as a pass. */
export const SKIP = 'skip';

export function statusOf(check, findings) {
  if (check.skipped) return SKIP;
  return findings.length === 0 ? 'ok' : 'fail';
}

/**
 * `L01 FAIL docs/x.md:57 message` for each finding, then one status line per check.
 *
 * The per-check status line prints even when the check passed. A lint that says nothing on
 * success leaves the reader unable to tell "all five ran and passed" from "three ran".
 */
export function renderText(results) {
  const lines = [];
  for (const r of results) {
    for (const f of r.findings) {
      const where = f.line ? `${f.file}:${f.line}` : (f.file ?? '');
      lines.push(`${r.id} FAIL ${where ? `${where} ` : ''}${f.message}`);
    }
  }
  lines.push('');
  lines.push(results.map((r) => `${r.id} ${r.status}${r.status === 'fail' ? ` (${r.findings.length})` : ''}`
    + (r.note ? ` [${r.note}]` : '')).join(' · '));
  return `${lines.join('\n')}\n`;
}

export function renderJson(results) {
  return `${JSON.stringify({
    checks: results.map((r) => ({
      id: r.id,
      status: r.status,
      findings: r.findings.map((f) => ({
        file: f.file ?? null,
        line: f.line ?? null,
        message: f.message,
      })),
    })),
  }, null, 2)}\n`;
}
