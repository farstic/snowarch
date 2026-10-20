// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-11-C1 — the `Licence:` line, and the days left that follow it, and nothing else, so that every surface can
 * print them.
 *
 * A LEAF, BECAUSE THE STATUS PANEL READS IT. `doctor/panel.mjs` renders this line from E-31's data,
 * and `tests/doctor/panel.test.mjs` walks the panel's import graph and fails on `node:fs`,
 * `process.env` or a clock. `state.mjs`, where the line was written first, reads the licence file, so
 * the panel could not import it; the function moved here, imports nothing, and `state.mjs` re-exports
 * it. The same move `check-ids.mjs` made for the doctor's summary.
 *
 * ONE WORDING. The session-start banner, the doctor's E-31, `licence show`, `verify` and `check`, and
 * the status panel all print this; the server's notice renders it identically, and
 * `tools/snowarch/tests/licence-parity.test.mjs` holds the two.
 */

/**
 * The line. `ok` and `expiring` name the licence and its term. Enforcement is on every build (ARC-11-C6),
 * so no state carries a word for it: the state alone decides whether the session may go on.
 */
export function bannerLine(s) {
  const parts = [`Licence: ${s.state}`];
  if (s.state === 'ok' || s.state === 'expiring') {
    parts.push(s.id);
    if (s.scope === 'design-only') parts.push('design-only');
    parts.push(s.perpetual ? 'perpetual' : `until ${s.validUntil}`);
  }
  return parts.join(' · ');
}

/**
 * ARC-11-C6 step 7 — what is left of the term, as E-31's expiring detail and the server's first-answer notice say
 * it. The day of `valid_until` counts, until 00:00 UTC of the next (docs/USER-GUIDE.md), so 0 days left is the last
 * day, named so. The server's `daysLeftPhrase` (`packages/snowarch/src/licence/state.ts`) is the twin, and the
 * parity test holds the two.
 */
export function daysLeftPhrase(days) {
  if (days === 0) return 'last day';
  return days === 1 ? '1 day left' : `${days} days left`;
}

/**
 * ARC-09-C159 — what to do about a licence in force that is expiring: renew it. Never the refusal's remedy, which tells a
 * reader to install a valid licence when the one installed is valid. E-31's remedy and `licence check` print it.
 */
export const renewalSentence = (s) =>
  `Licence ${s.id} expires on ${s.validUntil} (${daysLeftPhrase(s.daysLeft)}) — ask the issuer for a renewal before then.`;
