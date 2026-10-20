// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-08-S01 — the human renderer.
//
// Two rules the layout exists to serve:
//
//   `FAIL` IS UPPER-CASE. `grep FAIL` on a doctor's output is how people have triaged this class of
//   tool for thirty years, and the old doctor did it too. `ok`, `warn` and `skip` stay lower-case
//   so the failures are the only thing that shouts.
//
//   THE MODE LINE IS LAST. It is the line a session quotes and the line a person screenshots, and
//   the last line of a transcript is the one that survives a truncated paste. `modeLine()` in
//   `lib/text.mjs` is its ONE definition — this renderer prints what it is given and never
//   re-derives it.
//
// Colour only when stdout is a terminal and `NO_COLOR` is unset: a report redirected to a file or
// piped into `grep` must not carry escape codes, and a user who has said they do not want colour
// has said it once, for every tool.
import { SECTIONS } from './registry.mjs';
// ARC-08-C18 — the pure line renderers live one layer DOWN, in `panel.mjs`. This module reads
// `process.env` for the colour decision, so anything importing it inherits an environment read;
// the panel's promise is that the same report renders to the same bytes for every reader, and it
// is kept structurally rather than by care. Same definitions, imported rather than copied — the
// full report, B09's install summary, the upgrade block and the panel print a capability set and
// a failing check identically.
import { capabilitiesLine, nonOkLines } from './panel.mjs';
// ARC-08-C37 — from the leaf, not from the panel that also imports it: the helper's home is the
// thing both summary lines share, and reading it through `panel.mjs` would make the panel look like
// its owner. This file already depends on the panel, so there is no cycle either way.
import { idsFor } from './check-ids.mjs';

export { capabilitiesLine, nonOkLines };

// Written as escape SEQUENCES, never as the characters themselves: a raw control byte in a source
// file is invisible in a diff and in a review.
const CODES = { ok: '\u001b[32m', warn: '\u001b[33m', FAIL: '\u001b[31m', skip: '\u001b[90m' };
const RESET = '\u001b[0m';

export function useColour({ stream = process.stdout, env = process.env } = {}) {
  return Boolean(stream?.isTTY) && !env.NO_COLOR;
}

/** `ok` · `warn` · `FAIL` · `skip`. Upper-case only where it has to shout. */
export const statusLabel = (status) => (status === 'fail' ? 'FAIL' : status);

const paint = (label, colour) => (colour && CODES[label] ? `${CODES[label]}${label}${RESET}` : label);

/**
 * The header. It says what was ASKED FOR, because a report with three sections missing looks
 * identical to a broken doctor unless the options are on the page.
 */
export function headerLine({ version, ranAt, options = {} }) {
  /*
   * ARC-07-C45 — THE ZONE IS PRINTED, because the report already prints it one line over.
   *
   * The header said `2026-09-28 06:09:58` while the panel's `ranAtLine` said `06:09 UTC` from the
   * same `ranAt`: one instant, two spellings, and the header's was the one a reader would take for
   * local time. `panel.mjs` had already written down exactly this — that this renderer "drops the
   * `Z` without replacing it" — and called it defensible in a report read on the machine that
   * produced it. It stops being defensible the moment the two lines are read together, which is
   * always: they are in the same report.
   *
   * UTC rather than local for the panel's reason: two people comparing pasted copies must be
   * comparing the same bytes. Seconds stay — the header is the precise one — so the two lines differ
   * in precision and agree about the clock.
   *
   * Only an ISO instant is labelled. Anything else is printed as it arrived, the same rule
   * `ranAtLine` follows: a renderer that stamped `UTC` onto a string it did not recognise would be
   * asserting a zone it has no reason to believe.
   */
  const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(String(ranAt));
  const when = String(ranAt).replace('T', ' ').replace(/\.\d+Z?$/, '').replace('Z', '')
    + (iso ? ' UTC' : '');
  const section = options.section ?? 'all';
  return `snowarch doctor ${version ?? '?'} — ${when} `
    + `(quick: ${options.quick ? 'yes' : 'no'} · network: ${options.noNetwork ? 'no' : 'yes'} · section: ${section})`;
}

/** `DOCTOR: 41 ok, 1 warn, 1 fail (2 fixable — run ./snowarch doctor --fix)` */
/**
 * `DOCTOR: 41 ok, 0 warn, 0 fail` — ONE renderer, two callers.
 *
 * The bootstrap's B09 printed its own version of this line from `text.mjs`'s `doctorLine`, and the
 * two drifted the moment this one learned to say `(2 fixable — …)`: an install summary and a
 * doctor report that disagree about the same run are two numbers a reader has to reconcile.
 * `renderSummaryLine` is the alias B09 imports, so the two names say who is calling.
 */
/** The runner's wording for a check the `--section` flag excluded (`doctor/runner.mjs`). */
export const NOT_IN_SECTION = 'not in --section';

/**
 * ...and for one `--quick` left out — ARC-07-W15.
 *
 * THESE TWO STRINGS ARE MATCHED ON, WHICH IS WHY THEY ARE CONSTANTS. `summarise` counts a skip as
 * "not in section" by comparing `r.detail` to the sentence, so the tally and the wording are the
 * same string doing two jobs. `NOT_IN_SECTION` already existed here and `runner.mjs` spelled the
 * literal anyway — in BOTH places, the one that writes the reason and the one that counts it — so
 * there were three authors, and rewording any one of them would have silently zeroed a count while
 * every test that reads the rendered line stayed green. The quick reason had no constant at all.
 */
export const NOT_IN_QUICK = 'not in the --quick subset';

/** ...and for one a caller left out by name (ARC-11-C7), defined in a leaf so the doctor cache can match on it too. */
export { LEFT_OUT } from './left-out.mjs';

/**
 * ARC-08-C37 — `checks` is OPTIONAL, and a caller that omits it gets the line it always got.
 *
 * Three callers, and only two of them can name anything: `renderText` below has the report, and
 * B09 passes the doctor's `checks` through `text.mjs`'s `doctorLine` when it managed to spawn one.
 * B09's OTHER path counts `state.steps` because the doctor could not run at all, and there are no
 * check ids in that world — so the default is silence rather than a bracket it would have to fill
 * with a guess. `idsFor` is the panel's helper, not a second copy of the rule.
 */
export function summaryLine(summary, checks = null, { quick = false, cli } = {}) {
  // ARC-07-W17 — LOUD, NOT `undefined`. A required parameter that renders `undefined doctor --fix` is
  // the same silent wrong-spelling this row removes: the line still reads plausibly, so a reviewer and
  // a green test both miss it. `cli` is named in the message because the caller's next question is
  // which argument, and it is the THIRD — passing it second makes it the checks list.
  if (typeof cli !== 'string' || cli === '') {
    throw new TypeError('summaryLine needs a `cli` spelling (the third argument\'s `cli` key) — '
      + 'this module is pure of the environment and cannot read one');
  }
  const parts = [`${summary.ok} ok`, `${summary.warn} warn${idsFor(checks, 'warn')}`,
    `${summary.fail} fail${idsFor(checks, 'fail')}`];
  // ARC-07-W17 — `cli` HAS NO DEFAULT, and that is the row's rule rather than an oversight. A POSIX
  // default would be the literal this sweep removes, and it would render the wrong spelling on Windows
  // for any caller that forgot to pass one — silently, because the line still reads plausibly. Absent,
  // a forgetful caller prints `undefined doctor`, which no reviewer or test misses. This module cannot
  // read `spellings()` itself: `text.mjs` imports it, so the reverse edge is a cycle, and the purity
  // walker in `tests/doctor/panel.test.mjs` uses this file as its POSITIVE CONTROL — it must reach
  // `process.env` exactly once, through `useColour`, and no further.
  //
  // ARC-07-W15 — THE BOOTSTRAP'S LINE, and it is a different line because it answers a different
  // question. `DOCTOR: 13 ok, 1 warn (E-23), 1 fail` told a reader at the end of an install that
  // something had been checked, without saying that MOST OF IT HAD NOT BEEN: the bootstrap spawns
  // `doctor --quick`, which runs 15 of 41 checks. The counts were true and the impression was not.
  //
  // `notInQuick` rather than `skip`, and that distinction is measured rather than tidy: in a quick
  // run today all 26 skips are quick-exclusions, so `skip` would give the same number — but a
  // quick-subset check that cannot answer is skipped for its own reason, and then `skip` mixes the
  // two and the sentence overstates what running the full doctor would add. The `--section` split
  // three lines down is the same rule, and this reuses it rather than inventing a second one.
  //
  // The launcher is PASSED IN, never read here: `text.mjs` imports this module, so importing
  // `spellings` back would be a cycle. A POSIX default, threaded by every caller that knows the
  // shell — the shape `ADD_INSTANCE` already uses for the same reason.
  if (quick) {
    const more = summary.notInQuick ?? 0;
    return `Health check (quick): ${parts.join(' · ')}`
      + `${more > 0 ? ` · ${more} more run with ${cli} doctor` : ''}`;
  }
  // `--section` splits the skipped count in two, because the two mean different things: "this
  // checkout could not answer" and "you did not ask". Only the first is about the machine.
  if (summary.notInSection > 0) {
    const rest = summary.skip - summary.notInSection;
    if (rest > 0) parts.push(`${rest} skipped`);
    parts.push(`${summary.notInSection} not in section`);
  } else if (summary.skip > 0) parts.push(`${summary.skip} skipped`);
  const fixable = summary.fixable > 0
    ? ` (${summary.fixable} fixable — run ${cli} doctor --fix)`
    : '';
  return `DOCTOR: ${parts.join(', ')}${fixable}`;
}

export { summaryLine as renderSummaryLine };

/**
 * The report, as a person reads it.
 *
 * `modeLine` is passed in and printed unchanged. Passing `null` prints no Mode line at all, which
 * is what this story does — S05 owns assembling it, and a renderer that invented one meanwhile
 * would be a second answer to the question `/snowarch status` exists to answer.
 */
/**
 * The one section header that carries a reason: `server (skipped — design-only)`.
 *
 * Kept to that case on purpose. A generic "(all skipped)" would be true of `--section contract` on
 * a run that asked for something else, where the reason is the flag the reader just typed.
 */
export const sectionNote = (section, reason) => (section === 'server'
  && /dependencies not installed/.test(String(reason))
  ? 'server (skipped — design-only)'
  : null);

export function renderText({ report, checks = [], results = [], colour = false, cli }) {
  // Same rule as `summaryLine` above, for the same reason: this renderer prints the launcher and
  // cannot look it up.
  if (typeof cli !== 'string' || cli === '') {
    throw new TypeError('renderText needs a `cli` spelling — this module is pure of the environment');
  }
  const byId = new Map(checks.map((c) => [c.id, c]));
  // ARC-08-C34 — THE TERMINAL-ONLY DETAIL ARRIVES HERE, OR IT ARRIVES NOWHERE.
  //
  // `report.checks` has already been through `checkToJson`, which builds each entry from an
  // EXPLICIT OBJECT LITERAL that has no `textDetail`. Reading the field off the report was reading
  // it off the copy built to omit it, so the `?? result.detail` below always won and E-23's promise
  // to name the folder here — the whole reason the field exists — was dead from the day it was
  // written. The runner's own results still carry it, so they are passed in beside the report.
  //
  // THE LITERAL IS THE MECHANISM, not `CHECK_KEYS`. Measured: adding `textDetail` to `CHECK_KEYS`
  // alone changes nothing that travels, because that list is the VALIDATOR's required-keys contract
  // — it asserts every consumer-visible key is PRESENT and never forbids an extra one. Adding a
  // field to it without producing the field makes `validate-report` demand it (`textDetail:
  // missing`), which is the opposite direction. So the one place that decides what a stranger can be
  // asked to paste is `checkToJson`'s literal, and the report itself is untouched here: `--json` and
  // the doctor cache are both built from it.
  const terminal = new Map(results.map((r) => [r.id, r]));
  const idWidth = Math.max(0, ...report.checks.map((c) => String(c.id).length));
  const lines = [headerLine(report), ''];

  // ARC-08 (Sitting A) — with `--section`, the checks that are not in it are NOT listed.
  //
  // `./snowarch doctor --section host` printed 39 lines for 2 results: 37 of them said
  // `skip … not in --section`, which is not a finding about the machine, it is a restatement of the
  // flag the reader just typed. The count stays in the summary, where a number belongs, so nothing
  // is hidden — only un-listed. Every other skip reason (`--quick`, design-only, and the rest) is a
  // fact about this checkout and is still shown.
  const listed = report.checks.filter((c) => c.detail !== NOT_IN_SECTION);
  const outOfSection = report.checks.length - listed.length;

  for (const section of SECTIONS) {
    const inSection = listed.filter((c) => (c.section ?? byId.get(c.id)?.section) === section);
    if (inSection.length === 0) continue;
    // A section every one of whose checks skipped for the SAME reason says the reason in its
    // header. The one that matters is design-only: `npm ci` never runs there, so nine `skip` lines
    // under a bare `server` heading read as nine things that went wrong (ARC-08-S04).
    const reasons = new Set(inSection.map((c) => (c.status === 'skip' ? c.detail : null)));
    lines.push(reasons.size === 1 && !reasons.has(null) && sectionNote(section, [...reasons][0])
      ? sectionNote(section, [...reasons][0])
      : section);
    for (const result of inSection) {
      const label = statusLabel(result.status);
      const title = result.title ?? byId.get(result.id)?.title ?? '';
      // Padded on the PLAIN label: the escape codes are invisible and would otherwise eat the
      // padding, so a coloured report's columns would not line up with a piped one's.
      const padding = ' '.repeat(Math.max(0, 5 - label.length));
      // The ID column is padded to the widest id in the report, so `E-00` and `SV-03` put their
      // statuses in the same place. A column that moves per row is a column a reader cannot scan,
      // and scanning for `FAIL` is what this layout is for.
      // ARC-08 (Sitting A D1) — the TERMINAL may say more than the JSON. `textDetail` exists for
      // exactly one reason: E-23 needs to name the other project folders here, where the user goes
      // and runs the command, and must not name them in the `--json` a stranger pastes into a
      // public tracker. `checkToJson` copies a fixed list of fields and does not copy this one.
      // A MULTI-LINE terminal detail keeps the report's shape: E-30 prints one line per orphan
      // plus a command per orphan, and continuation lines that started in column 0 read as
      // output from something else. They are indented to the remedy's column, which is where
      // everything below a check line already sits.
      const shown = String(terminal.get(result.id)?.textDetail
        ?? result.textDetail ?? result.detail ?? '').split('\n');
      lines.push(`  ${result.id.padEnd(idWidth)} ${paint(label, colour)}${padding} `
        + `${title}: ${shown[0]}`);
      for (const extra of shown.slice(1)) lines.push(`             ${extra.trim()}`);
      // The remedy is indented UNDER its check rather than beside it: it is often the longest
      // string in the report, and a wrapped remedy that starts mid-line is the part people stop
      // reading.
      if (result.remedy) {
        const fixable = byId.get(result.id)?.fixable ? `   [fixable: ${cli} doctor --fix]` : '';
        lines.push(`             → ${result.remedy}${fixable}`);
      }
      // ARC-08 (Sitting A D1) — not a SECOND time. `command` duplicates one of the remedy's lines
      // for consumers that want a single runnable string (the `--fix` report's "run:" line). Printed
      // again here it landed BELOW the remedy, so "then review and delete …" appeared above the step
      // it refers to whenever the only removal was on that line.
      if (result.command && !String(result.remedy ?? '').includes(result.command)) {
        lines.push(`               ${result.command}`);
      }
    }
  }

  lines.push('');
  // ARC-08-C24 — `engine.capabilities`, the key the `/snowarch status` template names and the
  // panel reads. This read `prereqs.capabilities`, a second copy of E-04's answer written at a
  // different site: two renderers of one check reading two keys is a disagreement waiting for
  // either site to change.
  const capabilities = capabilitiesLine(report.engine?.capabilities ?? null);
  if (capabilities) lines.push(capabilities);
  // ARC-08-C37 — the REPORT's own checks, which is where the statuses are. `checks` (the
  // definitions) and `results` (the runner's) are both in scope here and are the wrong two: the
  // first carries no status at all, and the second is the pre-`checkToJson` shape whose ids would
  // agree today and drift the day a check is filtered on its way into the report.
  lines.push(summaryLine(report.summary, report.checks, { cli }));
  if (report.modeLine) lines.push(report.modeLine);
  return lines.join('\n');
}
