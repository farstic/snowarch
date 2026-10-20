// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// B09 summary — one verdict, one Mode line, and the exact next thing to type.
//
// The last five lines are the only part of the installation most people will read twice, and two of
// them are promises: the `Mode:` line is quoted back by the banner and by `/snowarch status`, and
// the dialog count is a claim about what happens thirty seconds from now. Both come from
// `lib/text.mjs`, which is also what the Node-free launchers print — one definition, four readers.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { doctorCachePath } from '../local-paths.mjs';
import { contractSha, version as engineVersion } from '../config.mjs';
import { recordedInstance } from '../state.mjs';
import { writeDoctorCache } from '../doctor-cache.mjs';
import { RUNNING_STEP_ENV, childEnv } from '../spawn-env.mjs';
import { EXPECTED_DIALOGS, summaryBlock } from '../text.mjs';
// ARC-08-C18 — `nonOkLines`/`failureLines` moved to the doctor's human renderer, which is where
// their other two readers already live. Same definition, imported rather than copied: B09's
// install summary, the upgrade report and `./snowarch status` must print a failing check the
// same way, and three surfaces sharing one function is how that stays true.
import { failureLines } from '../doctor/panel.mjs';

export const id = 'B09';
export const title = 'summary';
export const needsNode = false;
export const runsWhen = () => true;
/** Never cached: it reports on the run that just happened, so a cached one describes another. */
export const cacheable = false;
export const inputs = () => [];

/** The steps whose results the design-only cache carries, so the first banner has something real. */
export const DESIGN_CACHE_STEPS = Object.freeze(['B01', 'B02', 'B05', 'B07']);

/**
 * `./snowarch doctor --quick --json` when that sub-command exists; this run's own tally otherwise.
 *
 * ARC-08 has not been written, and B09 must still print a number. Counting its own steps is not a
 * placeholder for the doctor — it is the honest answer to "what does this run know", and it is
 * replaced the moment there is something better to ask.
 */
export function doctorCounts(state, { root, run = spawnSync, hasDoctor = null,
  runningStep = id } = {}) {
  // ARC-08 (Sitting A) — GATE ON WHAT THE SPAWN NEEDS, which is the launcher in THIS checkout.
  //
  // This used to ask `which('snowarch')` — whether the command is on PATH — while the spawn below
  // runs `<root>/tools/snowarch/bin/snowarch.mjs` by absolute path and needs nothing on PATH at all.
  // Nobody installs `snowarch` globally to use a checkout, so the gate was false in normal use, the
  // doctor was never asked, and the fallback tally printed instead — under a line that says DOCTOR.
  //
  // That tally counts `state.steps`, which PERSISTS between runs. So a step that failed in an
  // earlier run was reported by a later, successful one: Sitting A saw `mode design` succeed and
  // print `1 fail`, and that failure was B06's from the `mode live` before it. The standalone
  // doctor disagreed because it was the only one of the two actually running checks.
  const available = hasDoctor ?? existsSync(join(root, 'tools', 'snowarch', 'bin', 'snowarch.mjs'));
  if (available) {
    const r = run(process.execPath, [join(root, 'tools/snowarch/bin/snowarch.mjs'),
      'doctor', '--quick', '--json'],
    // THE CHILD IS TOLD WHICH STEP IS ASKING. The runner records a step only after its `run()`
    // returns, so while this spawn is in flight `runningStep` is absent from the state file — and
    // E-29, which checks that every planned step is recorded, reported it as "never ran" under the
    // step that was running it. The id travels rather than being spelled in the reader, so a future
    // step that asks the doctor for a summary gets the same treatment without E-29 learning its name.
    { encoding: 'utf8', stdio: 'pipe', cwd: root,
      env: childEnv(root, { [RUNNING_STEP_ENV]: runningStep }) });
    try {
      const parsed = JSON.parse(r.stdout ?? '{}');
      // The failing checks travel WITH the count. They were already in this JSON and were thrown
      // away with it, which is how a `1 fail` reached a user with nothing to act on.
      // ARC-08-C37 — `checks` travels so the DOCTOR line can name the warning it counted. `failures`
      // above already spells every FAIL out underneath; a doctor WARNING was counted here and named
      // nowhere, because `warnings` in the block below is `warningsFrom(state)` — the bootstrap
      // steps' own warnings, a different source that must not be conflated with these.
      if (parsed?.summary) {
        return { ...parsed.summary, source: 'doctor', failures: failureLines(parsed),
          checks: parsed.checks ?? null };
      }
    } catch { /* fall through to this run's own tally */ }
  }
  const counts = { ok: 0, warn: 0, fail: 0, source: 'bootstrap' };
  for (const entry of Object.values(state.steps ?? {})) {
    if (entry.status === 'ok') counts.ok += 1;
    else if (entry.status === 'warn') counts.warn += 1;
    else if (entry.status === 'fail' || entry.status === 'failed') counts.fail += 1;
  }
  return counts;
}

/** B01's cloud-sync note and B02's dead citations — the two worth saying twice. */
export function warningsFrom(state) {
  const out = [];
  const cloud = state.steps?.B01?.data?.cloudSync;
  if (cloud) out.push(cloud);
  const b02 = state.steps?.B02;
  if (b02?.status === 'warn' && b02.detail) out.push(b02.detail);
  return out;
}

export const run = async (ctx) => {
  const state = ctx.state;
  const counts = doctorCounts(state, { root: ctx.root,
    ...(ctx.runDoctor ? { run: ctx.runDoctor } : {}),
    ...(ctx.hasDoctor === undefined ? {} : { hasDoctor: ctx.hasDoctor }) });

  const instance = instanceFrom(state);
  const block = summaryBlock({
    mode: ctx.mode,
    instance,
    counts,
    nodeUsable: ctx.node?.present !== false,
    dialogs: EXPECTED_DIALOGS,
    serverKey: ctx.config.mcp.serverKey,
    root: ctx.root,
    platform: ctx.plat,
    env: ctx.env,
    warnings: warningsFrom(state),
    failures: counts.failures ?? [],
  });

  // Design-only runs never reach B08, so the banner would have no cache at all on a first install.
  // Live runs already have one, and overwriting it here would replace a handshake's findings with
  // a summary's.
  if (ctx.mode !== 'live' && !existsSync(doctorCachePath(ctx.root))) {
    writeDoctorCache(ctx.root, {
      mode: ctx.mode,
      engineVersion: engineVersion(ctx.root),
      contractSha: contractSha(ctx.root)?.slice(0, 12) ?? null,
      checks: DESIGN_CACHE_STEPS
        .filter((step) => state.steps?.[step])
        .map((step) => ({ id: step, status: normalise(state.steps[step].status),
          detail: state.steps[step].detail ?? '' })),
    });
  }

  // The block is RETURNED, not printed here: the runner prints a step's line after `run()`
  // returns, so a block written from inside would be followed by `[B09/09] summary … ok` and the
  // closing five lines would not be the last five. The caller prints it once the step line is out.
  return { status: 'ok', detail: `${counts.ok} ok, ${counts.warn} warn, ${counts.fail} fail`,
    data: { counts: { ok: counts.ok, warn: counts.warn, fail: counts.fail },
      source: counts.source, dialogs: EXPECTED_DIALOGS },
    next: block };
};

/**
 * The label, environment and preset — the three fields that are not secrets.
 *
 * ARC-06-C15: this used to read `state.steps.B08.data.instance ?? state.instance`, and nothing in
 * the tree wrote either, so it returned `null` for every live install. `recordedInstance` is the
 * one place that knows where B06 puts it, shared with `mode.mjs` so there is no second answer.
 */
const instanceFrom = (state) => recordedInstance(state);

/** The cache's vocabulary is ok/warn/fail; the state also uses `failed` for an interrupt. */
const normalise = (status) => (status === 'failed' ? 'fail' : status);
