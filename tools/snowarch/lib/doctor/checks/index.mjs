// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-08-S02 — the engine's twenty-three checks, in the order a report prints them.
//
// One list, assembled from five files. The registry sorts by section anyway, so the order here is
// the order WITHIN a section: prerequisites before the repository they are needed for, the corpus
// before the citations that read it, the roster before the contract the roster's text must agree
// with. A reader who works down the report is following the dependency chain.
//
// S03 added the `legacy` and `host` detectors (E-23…E-27) and S04 the `SV-` checks — the server
// package's own, adopted rather than re-implemented. All of them append to this list rather than
// building a registry of their own, because `--section` and `--quick` are answers about ONE
// registry.
import { createRegistry } from '../registry.mjs';
import { NOT_IN_QUICK, NOT_IN_SECTION } from '../report-text.mjs';

import { engineContractChecks } from './engine-contract.mjs';
import { engineDocsChecks } from './engine-docs.mjs';
import { enginePrereqChecks } from './engine-prereqs.mjs';
import { engineRepoChecks } from './engine-repo.mjs';
import { engineRosterChecks } from './engine-roster.mjs';
import { hostChecks } from './host.mjs';
import { integrityChecks } from './integrity.mjs';
import { legacyChecks } from './legacy.mjs';
import { licenceChecks } from './licence.mjs';
import { serverChecks } from './server.mjs';

/** Every engine check, as plain definitions — a caller may register a subset. */
export function engineChecks() {
  return [
    ...enginePrereqChecks(),
    ...engineRepoChecks(),
    ...licenceChecks(),
    ...integrityChecks(),
    ...engineDocsChecks(),
    ...engineRosterChecks(),
    ...engineContractChecks(),
    ...legacyChecks(),
    ...hostChecks(),
    ...serverChecks(),
  ];
}

/**
 * The `stale` block of schema v1, assembled from the two detectors that fill it.
 *
 * It was `null` from S01 so that a consumer written against the shape would never have to ask
 * which version of the doctor produced its input. This is the version that fills it. The ids are
 * known HERE rather than in the report builder, because "which check knows about leftovers" is a
 * fact about the registry and the report builder has no business learning it.
 */
export function staleBlock(results = []) {
  const by = new Map(results.map((r) => [r.id, r]));
  const claude = by.get('E-23')?.data ?? {};
  const legacy = by.get('E-24')?.data ?? {};
  const entries = Array.isArray(claude.entries) ? claude.entries : [];
  return {
    claudeJsonEntries: entries.map(({ scope, project, name, command }) => ({
      scope, project, name, command,
    })),
    legacyStore: legacy.present
      ? { path: legacy.path, instances: legacy.instances ?? null }
      : null,
  };
}

/**
 * The `server` block of schema v1 — `null` since S01, filled from the server's own report.
 *
 * `instances[]` is what ARC-07-S09's `--resume` reads, and it arrives already masked from the
 * server module (`s***@corp.example.com`): a shape that is only safe once the engine's runner has
 * touched it would be unsafe for every other caller of `runServerDoctor`.
 */
export function serverBlock(answer) {
  if (!answer) return null;
  if (!answer.report) {
    return { available: false, state: answer.state, version: null, mode: null, instances: [],
      ...(answer.error ? { error: answer.error } : {}) };
  }
  const { version, mode, instances, summary } = answer.report;
  // SV-05's two numbers ride on the block, not only inside its check result: the banner reads this
  // file with 300 ms and no Node, and "how many tools, how slow to start" is what it shows.
  const handshake = answer.report.checks.find((c) => c.id === 'SV-05')?.data ?? {};
  return {
    available: true, state: 'ready', version, mode, instances, summary,
    ...(handshake.toolCount === undefined ? {} : { toolCount: handshake.toolCount }),
    ...(handshake.initializeMs === undefined ? {} : { initializeMs: handshake.initializeMs }),
  };
}

/**
 * The `engine` block: facts the E-checks already established, keyed for a consumer.
 *
 * Assembled from their `data` rather than re-derived — E-02 read the Node version, E-04 resolved
 * the capability packs, E-12…E-16 hold `docsStatus()`'s answer, E-17 counted the roster and E-22
 * the contract. A block that computed any of them again would be a second answer that agrees today.
 */
/**
 * The report's `engine` header.
 *
 * `info` is `versionInfo()`'s object (ARC-09-S04) — the same one `./snowarch version --json` prints,
 * so `engine.version`, `engine.tag` and `engine.contractSha` are that command's answers rather than
 * a second reading of the same files. The rest of the header comes from the checks, which is where
 * it is measured.
 */
export function engineBlock(results = [], info = {}, { docsFallback = null } = {}) {
  const { version = null, contractSha = null, tag = null } = info;
  const data = (id) => results.find((r) => r.id === id)?.data ?? null;
  // ARC-08-C19 — E-12's answer when it ran, the configured corpus when it did not, null when
  // there is no corpus to describe at all. The fallback is a THUNK so that a full run never pays
  // for it: E-12's data is the measured answer and it wins without the cheap one being computed.
  const docs = data('E-12') ?? (docsFallback ? docsFallback() : null);
  return {
    version,
    // The tag NAME, which is what a reader quotes. `null` on a development checkout, honestly:
    // there is no release to name, and inventing one would be worse than saying so.
    tag: typeof tag === 'string' ? tag : (tag?.name ?? null),
    contractSha,
    node: data('E-02')?.version ?? null,
    capabilities: data('E-04')?.packs ?? null,
    // ARC-08-C19 — the CHECK's answer first, the object's own second. E-13 and E-14 are where the
    // pin and the family are measured against the corpus, and they win whenever they ran; the
    // `?? docs.x` half is what a quick run has, and without it the fallback's fields were computed
    // and then dropped on the floor by this mapping — the defect one layer below itself.
    docs: docs ? { present: docs.present, mode: docs.mode ?? null,
      pin: data('E-13')?.pin ?? docs.pin ?? null,
      family: data('E-14')?.family ?? docs.family ?? null,
      // The one bounded `rev-parse` a quick run pays for, and the comparison it buys. `null` on a
      // full run only if E-13 did not record them; `false` means the corpus has drifted off the
      // pin and the panel says so on its own line.
      head: data('E-13')?.head ?? docs.head ?? null,
      headMatchesPin: data('E-13')?.head !== undefined && data('E-13')?.pin !== undefined
        ? data('E-13').head === data('E-13').pin
        : docs.headMatchesPin ?? null,
      // E-14 is where the corpus BRANCH is compared against the configured family. It was never
      // mapped into this block at all, so `familyMatches` was `undefined` for every consumer and
      // the panel's "not probed" sentence could not name the branch — a key read by a renderer and
      // written by nobody. `null` when E-14 did not run, which a quick run never does.
      familyMatches: data('E-14') ? data('E-14').family === docs.family : docs.familyMatches ?? null,
      citations: data('E-16')?.checked ?? null, dead: data('E-16')?.dead ?? null } : null,
    roster: data('E-17') ? { skills: data('E-17').skills, agents: data('E-17').agents } : null,
  };
}

/**
 * Conditions two checks report from different angles, counted once.
 *
 * E-25 sees a cloud-synced CHECKOUT; SV-02 sees a cloud-synced STORE. On the usual install they
 * are the same folder and the same problem, and a summary that counted it twice would tell a user
 * to fix two things. Both lines stay in `checks[]` — each names a different path, and the one a
 * reader needs depends on which they are moving.
 */
export const DEDUPE_KEYS = Object.freeze({ 'E-25': 'cloud-sync', 'SV-02': 'cloud-sync' });

export function dedupeKeyFor(result) {
  const key = DEDUPE_KEYS[result.id];
  if (!key) return null;
  // Only when the two are actually reporting the same thing: SV-02 warns about a dozen other
  // conditions, and collapsing one of those into E-25's count would hide it.
  if (key === 'cloud-sync') {
    const says = /cloud-sync|cloud-synced/i.test(String(result.detail ?? ''));
    return says && result.status === 'warn' ? key : null;
  }
  return key;
}

/** The summary, with each de-duplicated condition counted once. */
export function summariseMerged(results, checks) {
  const byId = new Map(checks.map((c) => [c.id, c]));
  const summary = { ok: 0, warn: 0, fail: 0, skip: 0, fixable: 0, notInSection: 0, notInQuick: 0 };
  const seen = new Set();
  for (const r of results) {
    const key = dedupeKeyFor(r);
    if (key) {
      if (seen.has(key)) continue;
      seen.add(key);
    }
    summary[r.status] = (summary[r.status] ?? 0) + 1;
    // ARC-08 (Sitting A) — counted separately, and as a SUBSET of `skip`, never an addition to it.
    // "You did not ask for this check" is not a fact about the machine, and listing 37 of them as
    // findings buried the 2 that were.
    if (r.status === 'skip' && r.detail === NOT_IN_SECTION) summary.notInSection += 1;
    // ARC-07-W15 — the same subset rule for `--quick`, and THIS is the summariser that reaches the
    // report, so the bootstrap's line gets its number from here. The literal above was the FOURTH
    // author of `not in --section`: the runner wrote it, the runner's own tally matched on it, this
    // tally matched on it, and `NOT_IN_SECTION` sat exported and unused. Rewording any one of them
    // would have zeroed a count with every rendered-line test still green.
    if (r.status === 'skip' && r.detail === NOT_IN_QUICK) summary.notInQuick += 1;
    // The result's own answer first — see `checkToJson`. A check that can be fixable in general
    // still produces findings that are not.
    const fixable = r.fixable ?? byId.get(r.id)?.fixable ?? false;
    if (fixable && (r.status === 'fail' || r.status === 'warn')) summary.fixable += 1;
  }
  return summary;
}

/** The registry the `doctor` command builds when it is not given one. */
export function engineRegistry() {
  return createRegistry(engineChecks());
}
