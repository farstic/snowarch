// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
import { needSpell } from '../launcher-spelling.mjs';
// ARC-06-S03 — the step line, in one place, because three programs print it.
//
// The Node CLI prints it; `bootstrap.sh` (S10) and `bootstrap.ps1` (S11) print the same lines with
// no Node at all. Three implementations of one format is three chances for a user to see two
// different vocabularies for the same event depending on whether Node happened to be installed —
// so the wording lives in ONE table here, and S10/S11 render from this file's constants rather
// than from a bash string somebody retyped.
export const WORDING = Object.freeze({
  ok: 'ok',
  cached: 'ok (cached)',
  warn: 'warn',
  fail: 'FAIL',
  skipped: 'skipped',
  running: '…',
});

/**
 * `(48 s)` — and `(0.4 s)` for anything under a second.
 *
 * The convention's example is whole seconds, which reads as `(0 s)` for the many steps that finish
 * in a few hundred milliseconds. That is not a duration, it is a shrug. Sub-second gets one decimal
 * so the line still says something true.
 */
export function humanDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return null;
  return ms < 950 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms / 1000)} s`;
}

/**
 * Every shape `humanDuration` can produce, in the position a step line carries it.
 *
 * ARC-09-C18. A test that compares step lines has to remove the clock first, and
 * `input-hash.test.mjs` did it with its own regex — `/\(\d+\.\d+ s\)/`, which knows the
 * SUB-SECOND form and not the whole-second one. So a run where B00 took a second or more printed
 * `(1 s)`, the normaliser left it alone, and the comparison failed on a duration. It read as a
 * flake because it needs a slow step to appear; it is deterministic given one, and the release
 * gate — running the suite while everything else runs — is exactly where a step gets slow. That is
 * where it bit, in rehearsal run 6, stopping the release before the writes.
 *
 * So the grammar lives HERE, next to the thing that produces it, and a test imports it. Both forms,
 * because `humanDuration` has two.
 *
 * NOT `(cached)`, and not a skip's `(reason)`: those are parenthesised STATUS, not a clock, and a
 * normaliser that erased them would hide the difference between a step that ran and one that did
 * not — which is the very thing `input-hash.test.mjs` exists to assert.
 */
export const DURATION_IN_LINE = /\((?:\d+\.\d+|\d+) s\)/g;

/** A step line with its duration replaced, for comparing lines without comparing clocks. */
export const withoutDuration = (line, placeholder = '(time)') =>
  line.replace(DURATION_IN_LINE, placeholder);

/**
 * `[B02/09] docs … ok (48 s)`
 *
 * The denominator is derived from the last step's id, never typed: a tenth step would otherwise
 * leave nine printed on every line of a ten-step run.
 */
export function stepLine({ id, title, status, detail = null, note = null, durationMs = null,
  showDetail = false, last }) {
  // `[B02/09]` — the id keeps its letter, the denominator does not. That asymmetry is the
  // conventions block's, not a slip: the left half is a name you can grep for in the state file and
  // in `--from B06`, the right half is a count.
  const total = String(last).replace(/^B/, '');
  const head = `[${id}/${total}] ${title} ${WORDING.running} `;

  // `note` is the CONSEQUENCE of a skip, not the reason for it: `(--docs skip)` says what the
  // operator asked for, and the note says what it will cost them. Optional, because most skips cost
  // nothing — a live-only step skipped in design-only is simply not applicable.
  if (status === 'skipped') {
    return `${head}${WORDING.skipped} (${detail})${note ? ` — ${note}` : ''}`;
  }
  if (status === 'cached') return `${head}${WORDING.cached}`;
  if (status === 'fail') return `${head}${WORDING.fail}`;

  const d = humanDuration(durationMs);
  const suffix = d ? ` (${d})` : '';
  // `showDetail` is OPT-IN, and the opt-in is the point rather than caution. Nine ok/warn results
  // across five steps carry a `detail`; printing all of them would reshape every bootstrap's output
  // for the sake of one line, and printing B06's by NAME here would put a step's id in the shared
  // renderer. So a step says when its detail is the decision a reader needs on the line — B06's
  // keep-path does, because "ok" alone hides the choice ARC-08-C28 was raised over.
  const shown = showDetail && detail ? ` — ${detail}` : '';
  return `${head}${status === 'warn' ? WORDING.warn : WORDING.ok}${suffix}${shown}`;
}

/**
 * The three lines that follow a FAIL, in the order the conventions fix them.
 *
 * A cause with no remedy is a bug report addressed to the user, so the remedy is not optional here:
 * a step that fails without one gets a sentence saying so, which is at least honest and shows up in
 * review as something to fix.
 */
/**
 * ARC-07-C31 slice 4 — `launcher` REQUIRED: two callers, and the rule this row settled is a count.
 * It already took the spelling as a parameter; what it had was a POSIX DEFAULT, which is how the one
 * caller that forgot rendered the wrong shell for a Windows reader resuming an install.
 */
export function failureBlock({ id, cause, remedy, launcher }) {
  if (typeof launcher !== 'string' || launcher === '') {
    throw new TypeError('failureBlock needs a launcher spelling — the block tells a reader how to '
      + 'resume, and a default here is how that sentence comes to name the wrong shell');
  }
  return [
    `${WORDING.fail} ${id}: ${cause}`,
    `Remedy: ${remedy || `none recorded — please report this with the log from .local/logs/`}`,
    `Re-run ${launcher} to resume at ${id}.`,
  ];
}

/**
 * ARC-06-C10 — the LAST line of a failed run, and the only one a truncated CI log is sure to carry.
 *
 * Three lines above this one say what happened, and a reader who has them needs no more. A reader
 * who has only `##[error]Process completed with exit code 3` has none of them — and `3` means two
 * different things in this product. So the last line repeats the three facts the number cannot
 * give: WHICH step stopped, what that number means in the family it came from, and the class.
 *
 * Last on purpose. A summary in the middle of a log is a summary nobody scrolls to.
 */
export const stopLine = ({ id, code, meaning, detail }) =>
  `stopped at ${id} — exit ${code} (${meaning})${detail ? `: ${detail}` : ''}`;

/**
 * The sentences the Node-FREE launchers print about the corpus.
 *
 * S10 and S11 have no Node and cannot run `verifyCitations`, so they check only that every area in
 * `vendor/docs-areas.txt` exists as a directory and say so. Those exact bytes have to match what the
 * Node path prints for the same situation, or an operator gets two vocabularies for one corpus
 * depending on whether Node happened to be installed. They live here, beside the step-line wording,
 * for the same reason that does: one table, three programs.
 */
export const CORPUS_TEXT = Object.freeze({
  citationsUnverified: 'citations: not verified until Node 20+ is installed',
  // The consequence of `--docs skip`, said at the moment the operator chooses it rather than left
  // for the doctor to spring on them later. It rides on the step line as `skipNote`.
  // ARC-07-C31 slice 4 — FUNCTIONS, because these are read by a step that knows the ctx's shell. A
  // string cannot take one, and a module-load `spellings()` would fix the platform at import.
  skipConsequence: (spell) =>
    `the doctor will report the corpus as FAIL until you run ${needSpell(spell, 'CORPUS_TEXT.skipConsequence').cli} docs sync`,
  areasPresent: (present, total) => `areas: ${present}/${total} present`,
  areaMissing: (area, spell) => `area ${area} missing — run `
    + `${needSpell(spell, 'CORPUS_TEXT.areaMissing').cli} docs sync once Node is installed, `
    + `or re-run ${spell.bootstrap}`,
});
