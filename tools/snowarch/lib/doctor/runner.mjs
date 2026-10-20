// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-08-S01 — the runner: filter, run, time, redact, count.
//
// Three promises live here rather than in any check:
//
//   EVERY SELECTED CHECK RUNS. One that throws becomes a `fail` carrying its message; one that
//   hangs becomes a `fail` saying so after its timeout. A doctor that aborted on the first bad
//   answer would report a checkout as healthy up to the point where it stopped looking, which is
//   the worst possible half-truth to hand somebody debugging.
//
//   NOTHING REACHES THE OUTPUT UNREDACTED. The redaction pass is applied HERE, to every result,
//   so a check cannot forget it.
//
//   A CODE'S REMEDY COMES FROM THE CONTRACT. A check that sets `code` gets the registry's remedy
//   and command; one that sets both `code` and its own `remedy` is a second opinion about what to
//   do, and the runner refuses it rather than silently preferring one.
import { remedyFor } from '../../../../packages/contract/lib/contract.mjs';

import { redactResult } from './redact.mjs';
import { LEFT_OUT, NOT_IN_QUICK, NOT_IN_SECTION } from './report-text.mjs';
import { isServerCheck, SECTIONS } from './registry.mjs';
import { spellings } from '../launcher-spelling.mjs';

export const DEFAULT_TIMEOUT_MS = 15_000;
export const NETWORK_TIMEOUT_MS = 20_000;

/** `--section a,b`. `server` means every `SV-` check, whatever section they declare. */
export function selectSections(requested) {
  if (!requested) return null;
  const names = String(requested).split(',').map((s) => s.trim()).filter(Boolean);
  const unknown = names.filter((n) => !SECTIONS.includes(n));
  return { names, unknown };
}

/**
 * Which checks this run performs, and why the others do not.
 *
 * `--quick` is `quick && !spawns && !network`: a check that spawns a process is not quick however
 * fast it is, because the cost being avoided is the process, not the milliseconds.
 *
 * `exclude` names checks this run leaves out whatever else they are (ARC-11-C7). No flag sets it; the
 * SessionStart banner does, for E-32.
 */
export function planRun(checks, { quick = false, noNetwork = false, sections = null, exclude = [] } = {}) {
  const selected = [];
  const skipped = [];
  for (const check of checks) {
    const inSection = sections === null
      || sections.includes(check.section)
      || (sections.includes('server') && isServerCheck(check.id));
    if (!inSection) { skipped.push({ check, reason: NOT_IN_SECTION }); continue; }
    if (exclude.includes(check.id)) { skipped.push({ check, reason: LEFT_OUT }); continue; }
    if (quick && (!check.quick || check.spawns || check.network)) {
      skipped.push({ check, reason: NOT_IN_QUICK });
      continue;
    }
    // ARC-09-C32 fix-up. `|| quick` was redundant — the branch above already skips every network
    // check under `--quick` — so removing it changes nothing there, and the rule that remains is
    // about `--no-network` alone. A check that declares `offline: true` RUNS: it has an answer
    // that costs no network (E-28 reads its cache), and skipping it meant the sentences it was
    // written to print could never appear. They had been unreachable since ARC-09-S07.
    if (noNetwork && check.network && check.offline !== true) {
      skipped.push({ check, reason: '--no-network' });
      continue;
    }
    selected.push(check);
  }
  return { selected, skipped };
}

const timeoutFor = (check) => (check.network ? NETWORK_TIMEOUT_MS : DEFAULT_TIMEOUT_MS);

/** One check, run defensively: never throws, always timed, always shaped like a CheckResult. */
async function runOne(check, ctx, now, budgetFor = timeoutFor) {
  const started = now();
  const budget = budgetFor(check);
  let timer;
  try {
    const result = await Promise.race([
      Promise.resolve(check.run(ctx)),
      new Promise((_, reject) => {
        // ARC-09-C77 — REF'D, because it bounds an awaited check, and cleared in `finally` so it never
        // holds a run whose checks have answered. It was unref'd "so it does not keep the process alive
        // once every check has answered" — which the `clearTimeout` already guaranteed — and the price
        // was a budget the event loop could not see: a check pending on nothing ended the whole doctor
        // in exit 13 before its budget fired, with no report at all.
        timer = setTimeout(() => reject(new Error(`timed out after ${Math.round(budget / 1000)} s`)),
          budget);
      }),
    ]);
    return { ...result, id: check.id, durationMs: now() - started };
  } catch (e) {
    const message = e?.message ?? String(e);
    return {
      id: check.id,
      status: 'fail',
      // "timed out" is a fact about the check; "check crashed" is a fact about the code. A reader
      // needs to tell them apart, so the two messages are different from each other.
      detail: /^timed out after/.test(message) ? message : `check crashed: ${message}`,
      durationMs: now() - started,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fill `remedy`/`command` from the contract when the check named a `code`.
 *
 * `docs/TROUBLESHOOTING.md` is generated from the same entries, so a doctor's remedy and the
 * troubleshooting page cannot disagree — they are the same string. A check that hand-wrote one
 * beside a code is the drift this prevents, and it throws in tests rather than quietly winning.
 */
/**
 * ARC-07-C32 — `spell` REQUIRED, because this is the engine's half of the substitution.
 *
 * `codes.ts` holds `<cli>` rather than a literal now, so a reader that does not substitute prints the
 * placeholder to somebody — which is precisely what W17's first attempt did and why C32 became a row.
 * Required rather than defaulted: the one product caller is `runChecks`, which has the ctx, and a
 * default would let the process answer for a run that was told its platform.
 */
export function applyContractRemedy(result, contract, spell) {
  if (!result.code) return result;
  if (result.remedy !== undefined) {
    throw new Error(`${result.id}: a check may set \`code\` or \`remedy\`, not both — `
      + 'the remedy for a code is the contract\'s');
  }
  const entry = contract ? remedyFor(contract, result.code, spell) : undefined;
  if (!entry) return result;
  return {
    ...result,
    remedy: entry.remedy,
    ...(entry.command ? { command: entry.command } : {}),
  };
}

/** Tally, in the order a reader counts them. `fixable` counts results, not checks. */
export function summarise(results, checks) {
  const byId = new Map(checks.map((c) => [c.id, c]));
  const summary = { ok: 0, warn: 0, fail: 0, skip: 0, fixable: 0, notInSection: 0, notInQuick: 0 };
  for (const r of results) {
    summary[r.status] = (summary[r.status] ?? 0) + 1;
    // A SUBSET of `skip`, never an addition to it. `summariseMerged` is what reaches the report;
    // this one is kept in step with it so the two summarisers cannot disagree about one run.
    if (r.status === 'skip' && r.detail === NOT_IN_SECTION) summary.notInSection += 1;
    // ARC-07-W15 — a SUBSET of `skip` like the one above, for the bootstrap's own line.
    if (r.status === 'skip' && r.detail === NOT_IN_QUICK) summary.notInQuick += 1;
    const fixable = r.fixable ?? byId.get(r.id)?.fixable ?? false;
    if (fixable && (r.status === 'fail' || r.status === 'warn')) summary.fixable += 1;
  }
  return summary;
}

/**
 * The whole run. Sequential within the plan, because two checks writing interleaved lines produce
 * a report whose order changes between runs — and a report you cannot diff is a report nobody
 * compares.
 */
export async function runChecks(checks, ctx, options = {}) {
  const now = options.now ?? (() => Date.now());
  const { selected, skipped } = planRun(checks, options);
  const results = [];

  for (const check of selected) {
    // `options.timeoutFor` beside `options.now`: a budget the tests replace, so it is proven without
    // being spent (ARC-03-C1's rule). Absent, each check gets the one `timeoutFor` gives it.
    const raw = await runOne(check, ctx, now, options.timeoutFor);
    results.push(redactResult(
      applyContractRemedy(raw, ctx?.contract ?? null, spellings({ platform: ctx?.platform, env: ctx?.env })),
      options));
  }
  for (const { check, reason } of skipped) {
    results.push({ id: check.id, status: 'skip', detail: reason, durationMs: 0 });
  }

  // Report order is registry order, whatever order the run took.
  const order = new Map(checks.map((c, i) => [c.id, i]));
  results.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  return { results, summary: summarise(results, checks) };
}

/** 0 no FAIL · 1 at least one FAIL. (2 usage and 3 cannot-run belong to the command.) */
export const exitCodeFor = (summary) => (summary.fail > 0 ? 1 : 0);
