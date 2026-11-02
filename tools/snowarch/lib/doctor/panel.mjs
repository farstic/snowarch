// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-08-C18 — the panel `./snowarch status` prints, and the skill quotes verbatim.
 *
 * WHY THIS FILE EXISTS. `.claude/skills/snowarch/SKILL.md` § status was a renderer written in
 * prose for a model to execute: seven lines, each with the JSON key to read in brackets, a rule
 * for omitting a line whose key is null, a branch for failing checks, a branch for exit 3 and a
 * branch naming one of three causes when the doctor cannot run at all. Every session re-executed
 * it, and a renderer re-executed by a language model is a renderer with no test and no two runs
 * guaranteed alike. It is code here, and the skill's step 3 becomes "run it and print its output
 * verbatim".
 *
 * PURE, and structurally so — `tests/doctor/panel.test.mjs` walks this module's import graph and
 * fails if `node:fs`, `process.env` or a clock appears in any of it. A report goes in, a string
 * comes out. Every fact is the doctor's; nothing here measures anything.
 *
 * WHICH MAKES "VERBATIM" A PROMISE THAT CAN BE KEPT. The promise is not about time — two runs an
 * hour apart describe two different checkouts and should differ. It is that the same report
 * renders to the same bytes for every reader: no clock (`ranAt` is in the report), no `process.env`,
 * no cwd, and `ranAt` printed in UTC rather than local time, because two people comparing pasted
 * output in two timezones is the only reason "verbatim" is worth anything.
 *
 * IT IMPORTS ONE THING (ARC-08-C37), and the choice of what is the whole story. `idsFor` is shared
 * with the doctor's own summary line, and `report-text.mjs` — where that line lives — is the purity
 * walker's POSITIVE CONTROL, because `useColour` reads `process.env`. Importing the helper from
 * there would have made this module impure by association and turned the walker red. So the helper
 * is its own pure leaf and both renderers import it, which is the same move the walker forced the
 * last time it caught `report-text.mjs` on the way in: the code moved, not the test.
 */
import { idsFor } from './check-ids.mjs';
import { bannerLine } from '../licence/line.mjs';
/**
 * ARC-07-W17 — THE LAUNCHER IS AN ARGUMENT HERE, and the purity guard is why.
 *
 * `tests/doctor/panel.test.mjs` walks this module's whole import graph and fails if anything in it
 * reaches `node:fs`, `process.env`, a clock or a random — because the panel is DATA IN, TEXT OUT, so a
 * report captured on one machine renders identically on another. My first attempt imported
 * `spellings` from `../text.mjs` and read it at module load, which broke that guard twice over: the
 * walker found `process.env` through the new edge, and the import created a cycle
 * (`panel -> text -> report-text -> panel`) that threw `Cannot access 'isWindowsShell' before
 * initialization` and took 40 cases red.
 *
 * So the spelling arrives from the caller, and there is NO POSIX DEFAULT: a default would be the very
 * literal this row removes, and `undefined` reaching a template would print `undefined doctor` on the
 * line a reader is meant to type. `commands/status.mjs` is impure and supplies it; ARC-07-W15 reached
 * the same shape for `summaryLine` from the same constraint.
 */

/**
 * The contract sha, shortened to the prefix the rest of the product already uses.
 *
 * TWELVE, not seven. `./snowarch version` prints `contract 8d9d0847b597`, B09's summary block and
 * the doctor cache both `slice(0, 12)`; the SKILL.md sample showed seven, and it was the only one
 * of the four. A reader comparing the panel against `./snowarch version` — which is the whole
 * reason both print it — must not have to notice that one of them is shorter.
 */
export const SHA_PREFIX = 12;
const shortSha = (sha) => (sha ? String(sha).slice(0, SHA_PREFIX) : null);

/**
 * `2026-09-19 22:11 UTC` from the report's own `ranAt`.
 *
 * NOT `toLocaleString`, and the suffix is not decoration. The doctor's own `headerLine` already
 * formats this way and drops the `Z` without replacing it, which is defensible in a report you are
 * reading on the machine that produced it and wrong in a panel whose contract is that two people
 * can compare pasted copies. A local-time render would make the same report produce different
 * bytes in Sofia and in London, which is the one thing "verbatim" forbids.
 */
export function ranAtLine(ranAt) {
  if (!ranAt) return null;
  const text = String(ranAt);
  // Only an ISO instant is reformatted. Anything else is printed as it arrived: a renderer that
  // reshaped a string it did not recognise would be guessing at a value it is supposed to quote.
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(text)) return text;
  return `${text.slice(0, 10)} ${text.slice(11, 16)} UTC`;
}

/** `Engine: snowarch 2.0.0 · tag v2.0.0 · contract 96d056414da5` */
export function engineLine(engine) {
  if (!engine?.version) return null;
  const parts = [`snowarch ${engine.version}`];
  // A development checkout has no tag and says nothing rather than inventing one — `engineBlock`
  // is already honest about that and this line inherits it.
  if (engine.tag) parts.push(`tag ${engine.tag}`);
  if (engine.contractSha) parts.push(`contract ${shortSha(engine.contractSha)}`);
  return `Engine: ${parts.join(' · ')}`;
}

/**
 * `Docs: vendor/ServiceNowDocs @ ba513f2 (australia) · sparse · citations checked: 181 | dead: 0`
 *
 * The citation counts are a SEGMENT, not the line: they come from E-16, which walks the corpus and
 * is outside the quick subset, so on the run the skill mandates they are null while the pin and the
 * family are not. Dropping the whole line for a missing segment would hide the release family,
 * which is the fact a grounding decision turns on.
 */
export function docsLine(docs, cli) {
  if (!docs) return null;
  if (docs.present === false) return 'Docs: not installed';
  const head = `vendor/ServiceNowDocs${docs.pin ? ` @ ${shortSha(docs.pin)}` : ''}`
    + `${docs.family ? ` (${docs.family})` : ''}`;
  const parts = [head];
  if (docs.mode) parts.push(docs.mode);
  // ARC-08-C19 — the drift, when it was measured and is real. A `Docs:` line naming a pin the
  // corpus is not on would be asserting what it did not measure, which is why the quick run spends
  // one bounded `rev-parse` to find out. `null` is "not compared" and says nothing; `true` is the
  // normal case and also says nothing, because a line that announces agreement on every healthy
  // run is a line readers learn to skip.
  if (docs.headMatchesPin === false) {
    parts.push(`corpus is on ${shortSha(docs.head) ?? 'an unknown commit'}, NOT the pin`
      + ` — ${cli} docs sync`);
  }
  if (docs.citations !== null && docs.citations !== undefined) {
    parts.push(`citations checked: ${docs.citations} | dead: ${docs.dead ?? 0}`);
  }
  return `Docs: ${parts.join(' · ')}`;
}

/**
 * `Licence: ok · LIC-2026-0002 · perpetual` — the session-start banner's line, from E-31's data.
 *
 * ARC-11-C1 — ALWAYS, NOT ONLY WHEN SOMETHING IS WRONG. The owner's rc.1 sitting found the panel
 * silent with a licence in force: E-31 is ok then, and the panel lists no check that is ok, so the one
 * answer to "is this checkout licensed" was missing from the place a person asks it. The line is
 * rendered by the banner's own `bannerLine`, so the banner and the panel cannot word it differently;
 * a report with no E-31 data (an older report, or a check that errored) prints no line rather than a
 * guessed one.
 */
export function licenceLine(checks) {
  const data = (Array.isArray(checks) ? checks : []).find((c) => c?.id === 'E-31')?.data;
  if (!data?.state) return null;
  return bannerLine(data);
}

/**
 * `Integrity: verified · v2.1.0 · 369 files` — E-32's line (ARC-11-C7), after the Licence line.
 *
 * In every state E-32 reports, as the Licence line is: verified, modified, no signed manifest, or not checked on a
 * development tree. A report in which E-32 did not run (left out by name, as the status fixtures leave it, or an older
 * report) prints no line rather than a guessed one.
 */
export function integrityStatusLine(checks) {
  const detail = (Array.isArray(checks) ? checks : []).find((c) => c?.id === 'E-32')?.detail;
  return typeof detail === 'string' && detail.startsWith('Integrity: ') ? detail : null;
}

/** `Roster: 28 skills / 9 agents` */
export const rosterLine = (roster) => (roster
  ? `Roster: ${roster.skills} skills / ${roster.agents} agents`
  : null);

/**
 * `Instances: pdi (pdi, custom, default) · uat (test, read-only)`
 *
 * ARC-08-C19 — it reads `report.instances`, not `report.server`. `server` is null on every
 * `--quick` run (ARC-09-C8 took the section out), so this line was omitted on exactly the run
 * SKILL.md mandates — a line specified by a skill and unproducible by the command that skill
 * mandates. `report.instances` carries the store's own records on a quick run and the server's
 * when one answered, with `source` saying which; `notProbedLine` states the difference rather than
 * leaving a reader to infer it from a line that looks identical either way.
 */
export function instancesLine(instances) {
  const entries = Array.isArray(instances) ? instances : (instances?.entries ?? []);
  if (entries.length === 0) return null;
  const one = (i) => {
    const inner = [i.environment, i.preset].filter(Boolean);
    if (i.default === true || i.isDefault === true) inner.push('default');
    return inner.length ? `${i.label} (${inner.join(', ')})` : String(i.label);
  };
  return `Instances: ${entries.map(one).join(' · ')}`;
}

/** `Doctor: 12 ok, 1 warn, 1 fail — quick run 2026-09-19 22:11 UTC · full report: ./snowarch doctor` */
export function doctorLine(report, cli) {
  const s = report?.summary;
  if (!s) return null;
  const kind = report.options?.quick ? 'quick run' : 'full run';
  const when = ranAtLine(report.ranAt);
  // ARC-08-C37 — WHICH check, named where the count is. The remedy stays in `./snowarch doctor`;
  // `failureLines` below is untouched, so a FAIL is still spelled out in full underneath and this
  // adds the id to the tally rather than a second copy of the failure.
  return `Doctor: ${s.ok} ok, ${s.warn} warn${idsFor(report.checks, 'warn')}`
    + `, ${s.fail} fail${idsFor(report.checks, 'fail')}`
    + `${when ? ` — ${kind} ${when}` : ` — ${kind}`}`
    + ` · full report: ${cli} doctor`;
}

/**
 * What a quick run did not measure, named from the keys that are actually null.
 *
 * Built from the report rather than from a remembered sentence: the skill carried this as a fixed
 * string and a fixed list of two, so a check moving in or out of the quick subset would have left
 * the sentence describing the old subset. It says what IS missing in the report in front of it.
 */
export function notProbedLine(report, cli) {
  const missing = [];
  if (!report?.engine?.capabilities) missing.push('Capability packs');
  const docs = report?.engine?.docs;
  const citations = docs?.citations;
  if (docs && (citations === null || citations === undefined)) {
    missing.push('citation counts');
  }
  // ARC-08-C19 — the corpus's BRANCH is the half the one bounded `rev-parse` does not buy. The
  // commit is compared against the pin; whether the corpus is on the configured family is
  // `branchOf`, which is one of the spawns C8 moved out. Named here rather than implied by a
  // `(australia)` on the Docs line that is the config's word for it.
  // `?? null` rather than `=== null`: an older report has no such key at all, and a renderer that
  // treated "absent" as "measured" would go quiet about the one thing it is here to name.
  if (docs && (docs.familyMatches ?? null) === null) missing.push('the corpus branch');
  if (missing.length === 0) return null;
  // ALWAYS `are`. The first version chose the verb from `missing.length`, which looked like
  // agreement and was keyed to the wrong thing: the number that governs it is the subject's, not
  // the list's, and BOTH subjects are plural nouns. One null key produced "Capability packs is not
  // probed" — a sentence disagreeing with itself in the line whose whole job is to be quoted
  // verbatim. There is no singular case to handle here, so there is no conditional.
  // Oxford-comma list once there are three: "a, b and c". Two stay "a and b".
  const subject = missing.length > 2
    ? `${missing.slice(0, -1).join(', ')} and ${missing.at(-1)}`
    : missing.join(' and ');
  return `${subject} are not probed on a quick run — ${cli} doctor reports them.`;
}

/**
 * The capability packs, on one line above the summary.
 *
 * E-04 already reports them as a check; this is the line a reader scans when they are about to
 * author a deliverable rather than diagnose an install, and it names the PROVIDER because "docx
 * yes" does not tell a Windows user whether it was PowerShell or a Python nobody installed.
 */
export function capabilitiesLine(packs) {
  if (!packs) return null;
  const LABELS = { docx: 'docx', pdf: 'PDF QA', drawio: 'draw.io', mermaid: 'Mermaid' };
  const parts = Object.entries(LABELS).map(([key, label]) => {
    const pack = packs[key];
    if (!pack) return `${label} no`;
    // The provider, not the path: `/opt/homebrew/bin/python3` is a path a reader has to parse to
    // learn one word, and the word is the answer.
    const how = pack.how ? String(pack.how).split(/[\\/]/).pop().replace(/\.(exe|cmd|app)$/i, '') : null;
    return pack.present && how ? `${label} yes (${how})` : `${label} no`;
  });
  return `Capabilities: ${parts.join(' · ')}`;
}

/**
 * `E-10 FAIL settings.local toggles match the recorded mode: mode is live but servicenow is disabled`
 *
 * One line per check a reader needs to act on: which one, and what it said. It lives in the
 * doctor's own renderer because all three of its readers are renderers — B09's install summary
 * (ARC-06), the upgrade report's U7 block (ARC-09-C46) and `./snowarch status`'s panel
 * (ARC-08-C18). It was in `steps/B09.mjs` while B09 was its only caller.
 *
 * FAILS FIRST, then warnings, rather than in report order: a reader scanning for the thing that
 * stopped them should not have to pass three warnings to reach it.
 *
 * The status is read off the check instead of being written into the template, so the two views
 * below are ONE implementation. A second copy of a sentence is the thing this repository keeps
 * removing; U7 (ARC-09-C46) was the second reader and the status panel is the third.
 */
export function nonOkLines(parsed, statuses = ['fail', 'warn']) {
  const checks = parsed?.checks ?? [];
  return statuses.flatMap((status) => checks
    .filter((c) => c.status === status)
    // A TITLE MAY BE ABSENT, AND THIS CONDITIONAL IS THE FALLBACK (ARC-09-C56). Since ARC-09-C200,
    // U7's checks are its target's report, titles and all, so a check that report leaves untitled is
    // the case left. `SV-99 WARN: <detail>` is a true line — the id and the detail are the check —
    // where `SV-99 WARN undefined: <detail>` is a broken one.
    .map((c) => `${c.id} ${status.toUpperCase()}${c.title ? ` ${c.title}` : ''}`
      + (c.detail ? `: ${c.detail}` : '')
      + (c.remedy ? ` — ${c.remedy}` : '')));
}

/** FAILs alone — what B09's summary block carries. Its output is unchanged by the above. */
export const failureLines = (parsed) => nonOkLines(parsed, ['fail']);

/**
 * The panel.
 *
 * The Mode line is FIRST and printed unchanged: `report.modeLineDetailed` is `doctor/mode.mjs`'s
 * one definition, quoted here exactly as the banner and `./snowarch mode` quote it. This renderer
 * adds a reader and never a second spelling — the day it re-derived that line would be the day two
 * surfaces could disagree about whether the checkout is live.
 *
 * FAILs are listed one per line with their remedy; warnings are NOT. `./snowarch doctor` is where a
 * reader goes for those, and the panel saying so in its own Doctor line is the whole handover. The
 * list is `failureLines`, the ARC-09-C46 renderer, so the panel, B09's install summary and the
 * upgrade's report print a failing check identically.
 */
export function renderPanel(report, cli) {
  const lines = [
    report?.modeLineDetailed ?? null,
    // Second, as the session-start banner prints it: Mode, then Licence.
    licenceLine(report?.checks),
    // ARC-11-C7 — third: this release's files against its signed manifest.
    integrityStatusLine(report?.checks),
    engineLine(report?.engine),
    docsLine(report?.engine?.docs, cli),
    rosterLine(report?.engine?.roster),
    capabilitiesLine(report?.engine?.capabilities),
    instancesLine(report?.instances ?? report?.server?.instances ?? null),
    doctorLine(report, cli),
    // A line whose key is null is OMITTED, never guessed — the rule SKILL.md stated and a model
    // applied by hand. `filter` is that rule, in one place, for every line.
  ].filter((line) => line !== null && line !== undefined);

  const failures = failureLines(report);
  if (failures.length > 0) lines.push(...failures);
  if ((report?.summary?.fixable ?? 0) > 0) {
    lines.push(`Run ${cli} doctor --fix for the fixable ones (${report.summary.fixable}).`);
  }

  const notProbed = notProbedLine(report, cli);
  if (notProbed) lines.push(notProbed);

  // ARC-08-C19 — WHERE the instances came from, said out loud when it was the store. A store read
  // knows a label, an environment and a preset; it knows nothing about whether any of it works,
  // and the line it produces looks identical to one the server answered. Stated rather than
  // implied is the whole rule this row is built on.
  if (report?.instances?.source === 'store') {
    lines.push('Instances are the store\'s own records; nothing was probed.');
  }

  return lines.join('\n');
}
