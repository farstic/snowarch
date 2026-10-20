// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-08-C37 — which check the count is talking about.
 *
 * Three surfaces print a tally of the same run: `./snowarch status`'s panel (`Doctor: 13 ok, 1
 * warn, 1 fail`), the doctor's own report and B09's closing block (`DOCTOR: 14 ok, 1 warn, 0 fail,
 * 26 skipped`). FAILs are named in full underneath, by `failureLines` — a warning was not named
 * anywhere, so a reader was told one existed and had to run a second command to learn which.
 *
 * THE ID, NOT THE REMEDY. A warning's remedy is a multi-line block with its own continuations
 * (E-23's is four physical lines of `claude mcp remove …`), and pushing that into a panel whose
 * other rows are single `key: value` lines is what this deliberately does NOT do. `./snowarch
 * doctor` is still where a reader goes for the remedy; this only answers "which one".
 *
 * A PURE LEAF, and it has to be. `tests/doctor/panel.test.mjs` walks the panel's import graph and
 * fails if `node:fs`, `process.env` or a clock appears anywhere in it — `report-text.mjs` is that
 * test's positive control precisely because `useColour` reads the environment, so the shared helper
 * could not live there without making the panel impure by association. When that walker last caught
 * `report-text.mjs` on the way in, the pure renderers moved DOWN into the panel rather than the test
 * being narrowed; this file is the same move made once, for two readers.
 */

/**
 * ` (E-23)`, ` (E-23, E-30)`, or nothing at all.
 *
 * THE COUNT AND THE IDS COME FROM DIFFERENT PLACES, and this returns the empty string rather than
 * guessing when they cannot agree. `summary.warn` is the runner's tally; the ids are read from the
 * report's own `checks`. B09's fallback path counts `state.steps` when the doctor could not be
 * spawned at all and has no `checks` to read — so `1 warn` with nothing in brackets is a true line
 * there, where `1 warn (unknown)` would be a made-up one. Absence is reported as silence.
 */
export function idsFor(checks, status) {
  const ids = (Array.isArray(checks) ? checks : [])
    .filter((c) => c && c.status === status)
    .map((c) => c && c.id)
    .filter((id) => typeof id === 'string' && id !== '');
  return ids.length > 0 ? ` (${ids.join(', ')})` : '';
}
