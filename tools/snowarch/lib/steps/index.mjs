// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-06-S03 — the registry and the runner: what runs, in what order, and what may be skipped.
//
// The runner owns three decisions and nothing else: ORDER, whether a step's recorded result may
// stand in for running it, and what happens to the state when one fails or the operator interrupts.
// Everything a step knows about itself — when it applies, what invalidates it, what it does — lives
// in the step module, so ARC-06-S04…S09 each replace one `run()` and touch nothing here.
import { spawn as nodeSpawn } from 'node:child_process';
// ARC-08-C30 — a step records WHICH VERSION ran it. Without that, a state carrying B04 from
// before an upgrade and B05 from after is indistinguishable from one where both are current, and
// "the bootstrap finished" is a claim nobody can check.
import { version as engineVersionOf } from '../config.mjs';
import * as B00 from './B00.mjs';
import * as B01 from './B01.mjs';
import * as B02 from './B02.mjs';
import * as B03 from './B03.mjs';
import * as B04 from './B04.mjs';
import * as B05 from './B05.mjs';
import * as B06 from './B06.mjs';
import * as B07 from './B07.mjs';
import * as B08 from './B08.mjs';
import * as B09 from './B09.mjs';
import { hashFor } from '../inputs.mjs';
import { failureBlock, stepLine, stopLine } from './format.mjs';
import { checkoutKey, recordedHere, saveState } from '../state.mjs';
import { EXIT_FAIL, EXIT_INTERRUPTED, EXIT_MEANING, EXIT_OK } from '../exit.mjs';
import { spellings } from '../launcher-spelling.mjs';

export const STEPS = Object.freeze([B00, B01, B02, B03, B04, B05, B06, B07, B08, B09]);
export const LAST = STEPS[STEPS.length - 1].id;
export const stepById = (id) => STEPS.find((s) => s.id === id) ?? null;

/**
 * Steps that a `--yes` design-only run will actually execute, for the plan screen's Steps line.
 *
 * ARC-08-C29 LOOKED AT B03 AND LEFT IT OUT, which is a decision rather than an omission and is
 * recorded here so the next reader does not re-open it by accident.
 *
 * The owner's upgrade transcript shows `[B03/09] mode … ok (cached)` under a Steps line that does
 * not name it, and a reader reconciling a list of eight against a run of nine is a real cost. But
 * this line belongs to the PLAN SCREEN, which asks for two choices — Mode and Docs — and
 * `bootstrap-plan.test.mjs` states the rule it follows: *"B03 records the answers; it is not a
 * choice"*. B03 is the step that writes down what the reader just decided; naming it among the
 * things they are deciding about is a different confusion, not less of one.
 *
 * B00 is excluded for a different reason again — it has already run by the time the screen exists.
 *
 * So the mismatch is real and the fix is not here: it is that the UPGRADE reuses a screen written
 * for an interactive install. Raised rather than patched.
 */
export function plannedSteps(ctx) {
  return STEPS.filter((s) => s.id !== 'B00' && s.id !== 'B03' && runs(s, ctx));
}

const runs = (step, ctx) => step.runsWhen(ctx) !== false;
const cacheableOf = (step) => step.cacheable !== false;
/** ARC-09-C140 — does the step say its output is gone? Today only B01 declares `outputMissing`; a step without it is never forced. */
export const outputMissingOf = (step, ctx) => typeof step.outputMissing === 'function' && step.outputMissing(ctx) === true;

/**
 * End a child and everything it started.
 *
 * `child.kill()` on Windows is `TerminateProcess` on the direct child only, which for `npm ci`
 * means the npm shim dies and the node process doing the installing carries on — so the tree is
 * ended with `taskkill /T`. `spawn` is injected so the Windows argv can be asserted from a POSIX
 * machine; the branch is chosen by the `platform` argument, never by an ambient read, for the same
 * reason.
 */
export function killTree(child, { platform = process.platform, spawn = nodeSpawn } = {}) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return null;
  if (platform === 'win32') {
    const args = ['/PID', String(child.pid), '/T', '/F'];
    spawn('taskkill', args, { stdio: 'ignore' });
    return { how: 'taskkill', args };
  }
  child.kill('SIGINT');
  return { how: 'SIGINT', args: [] };
}

/**
 * The runner.
 *
 * `onLine` rather than a logger: the same function has to serve `--json` (human lines to stderr),
 * the tests (lines into an array) and the launchers' parity checks. A runner that reached for a
 * logger of its own would be a second place deciding what a step line says.
 */
export async function runSteps({ root, ctx, state, from = null, onLine = () => {},
  now = () => new Date(), save = saveState, steps = STEPS, last = null,
  live = { child: null, step: null },
  // The hasher, as a seam. In the product it is ARC-09-S05's TABLE, by step id — one declaration
  // of "what are my inputs", read the same way by the runner, by `staleSteps()` and by the
  // generated ARCHITECTURE table. A test driving FAKE steps has no table row for its invented ids
  // and passes its own; that is a test fixture, not a second source.
  hash: hashOf = (step) => hashFor(step.id, ctx) }) {
  // ARC-09-C198 — A RECORD OF ANOTHER FOLDER IS NOT A RECORD OF THIS ONE. A copied `.local/` carried steps whose inputs
  // hash the same in every checkout of a release, and they were cached where they had never run. A record that does
  // not name this checkout, another folder's or one written before this release named any, keeps none of its steps,
  // and names this checkout from here on. The two go together, so a key is only ever written beside steps that ran
  // under it. The ENGINE root, never `.local/`'s (`state.mjs`).
  if (!recordedHere(state, root, ctx.platform)) state.steps = {};
  state.checkout = checkoutKey(root, ctx.platform);
  const summary = { ok: 0, warn: 0, fail: 0, skipped: 0, cached: 0 };
  // B09 composes the closing block; the runner carries it out so `--json` prints the SAME string a
  // human saw rather than a second rendering of it.
  let next = null;
  const fromIndex = from ? steps.findIndex((s) => s.id === from) : -1;
  // `live` is the caller's handle on what is running RIGHT NOW, and it is passed IN rather than
  // created here: the SIGINT handler is registered outside this function and fires while the
  // `await` below is still pending, so a handle created in here would never be visible to it. That
  // was the first version, and it meant Ctrl-C left the child running.
  // The denominator comes from the list being run, not from the module constant: a test driving
  // three stub steps must not print `/09`, or every line it asserts is a line no user ever sees.
  const lastId = last ?? steps[steps.length - 1].id;

  for (let i = 0; i < steps.length; i += 1) {
    const step = steps[i];
    const recorded = state.steps[step.id] ?? null;

    if (!runs(step, ctx)) {
      // ARC-11-C6 (ruling R1) — a reason may depend on the run, as B06's and B08's do: design-only, or no licence in
      // force. A string still works.
      const reason = typeof step.skipReason === 'function' ? step.skipReason(ctx) : step.skipReason;
      const detail = reason ?? 'not applicable';
      // ARC-07-C31 slice 4 — a skip note is a FUNCTION of the shell now, because the one that exists
      // names a launcher. A step that supplies a plain string still works; one that supplies a
      // function is called with the run's own spelling.
      const raw = step.skipNote ?? null;
      const note = typeof raw === 'function'
        ? raw(spellings({ platform: ctx.platform, env: ctx.env }), ctx)
        : raw;
      state.steps[step.id] = { status: 'skipped', inputsHash: null, detail,
        finishedAt: now().toISOString(), durationMs: 0 };
      summary.skipped += 1;
      onLine(stepLine({ id: step.id, title: step.title, status: 'skipped', detail, note,
        last: lastId }));
      continue;
    }

    // The hash is computed even when the step is about to run: it is what the NEXT run compares
    // against, so a step that ran without recording its inputs would re-run for ever.
    const hash = cacheableOf(step) ? hashOf(step, ctx) : null;
    const forced = fromIndex !== -1 && i >= fromIndex;
    // ARC-09-C140 — and a step whose OUTPUT is gone runs, whatever its inputs say: B01's signed manifest, which an
    // upgrade from before 2.1 never fetched. Asked last, so a step already re-running costs nothing more.
    const cached = cacheableOf(step) && !forced
      && recorded?.status === 'ok' && recorded.inputsHash === hash && !outputMissingOf(step, ctx);

    if (cached) {
      summary.cached += 1;
      summary.ok += 1;
      // ARC-08-C36 — RE-STAMPED, because the answer has just been accepted as current for THIS
      // build. The inputs hash matched, which is a stronger statement about currency than a version
      // is: nothing this step depends on has moved. Leaving the old stamp is what sent the owner a
      // FAIL reading `bootstrap incomplete since 2.0.3-dev: B01 recorded under 2.0.2` on a bootstrap
      // that had just finished, and it had been failing in this repository's own upgrade e2e on every
      // run behind an assertion a count cannot fail.
      //
      // `finishedAt`, `durationMs` and `inputsHash` are NOT touched: the step did not re-run, the
      // resume rule promises exactly that, and its own test asserts the timestamp is unchanged. What
      // moves is the one field whose question is "does this answer belong to the build that is here
      // now" — and for a cached step the answer is yes.
      recorded.engineVersion = engineVersionOf(root);
      state.steps[step.id] = recorded;
      // AND SAVED, or the re-stamp only reaches disk if a LATER step happens to run. My first cut of
      // this fix `continue`d straight past the `save` below, so a cached step's new stamp lived in
      // memory only — and the doctor E-29 runs in reads the FILE. The e2e still reported one step
      // stale after the fix for exactly that reason.
      save(root, state);
      onLine(stepLine({ id: step.id, title: step.title, status: 'cached', last: lastId }));
      continue;
    }

    const started = Date.now();
    live.step = step.id;
    let result;
    try {
      result = await step.run({
        ...ctx,
        state,
        /**
         * A step's own output. B00 prints seven check lines before its step line, and a step that
         * reached for `console.log` would bypass redaction and the log file both — so the runner
         * hands it the same sink every step line goes through.
         */
        line: onLine,
        /** Steps spawn through here so the interrupt handler can reach their children. */
        spawn: (cmd, args, opts) => {
          const child = nodeSpawn(cmd, args, opts);
          live.child = child;
          child.on('exit', () => { if (live.child === child) live.child = null; });
          return child;
        },
      });
    } catch (e) {
      result = { status: 'fail', detail: e.message, remedy: null };
    }
    const durationMs = Date.now() - started;
    live.step = null;

    // An interrupt already wrote this step's entry and its own exit code. Whatever the step went on
    // to return — an `ok` from a body that ignored the dead child, a `fail` from one that noticed —
    // must not overwrite that: the record of WHY the run stopped is the thing a resume reads. In
    // production `process.exit` usually wins this race; correctness should not depend on it.
    if (live.interrupted) {
      return { code: EXIT_INTERRUPTED, summary, state, stoppedAt: step.id, live };
    }

    // ARC-09-C213 — THE RECORDED HASH DESCRIBES THE INPUTS AS THE STEP LEFT THEM. B06 migrates the store, one of its
    // own inputs, and recorded the hash it computed before: the next bootstrap ran it again, and C196's at-tag plan told
    // a finished move it had steps to run. Hashed again after a step that ran to its end; for a step that does not
    // touch its inputs the two are equal. The cache test above still compares the hash taken before a run.
    let left = hash;
    if (hash !== null && (result.status === 'ok' || result.status === 'warn')) {
      try { left = hashOf(step, ctx); } catch { left = hash; }
    }
    const entry = { status: result.status === 'warn' ? 'warn' : result.status,
      inputsHash: left, finishedAt: now().toISOString(), durationMs,
      // The checkout's version AT THE MOMENT THIS STEP RAN. `state.engineVersion` is write-once —
      // `emptyState` sets it at install and nothing updates it — so it names the version a
      // checkout was FIRST installed at, not the one it is on. Only a per-step value can say
      // whether a step's answer belongs to the build that is here now.
      engineVersion: engineVersionOf(root) };
    if (result.detail) entry.detail = result.detail;
    if (result.data) entry.data = result.data;
    state.steps[step.id] = entry;

    if (result.status === 'fail') {
      summary.fail += 1;
      onLine(stepLine({ id: step.id, title: step.title, status: 'fail', last: lastId }));
      for (const l of failureBlock({ id: step.id, cause: result.detail, remedy: result.remedy,
        // ARC-07-C31 slice 4 — from the ctx's shell, so the "re-run …" line a reader follows is the
        // one their shell accepts. It was a POSIX default on this function and this caller never
        // passed it, which is exactly how a default comes to answer for a caller that knew better.
        launcher: spellings({ platform: ctx.platform, env: ctx.env }).bootstrap })) {
        onLine(l);
      }
      save(root, state);
      // A step may name its own exit code — B00's failures are missing PREREQUISITES, which is a
      // different thing from "a step failed" and a different number to key on.
      const code = result.code ?? EXIT_FAIL;
      // ...and because that number is not unique across the product — `3` is a missing prerequisite
      // here and a missing corpus in the docs family — the run says which on its last line
      // (ARC-06-C10). This is the line a truncated CI log carries.
      onLine(stopLine({ id: step.id, code, meaning: EXIT_MEANING[code] ?? 'unclassified', detail: result.detail }));
      return { code, summary, state, stoppedAt: step.id, live };
    }

    if (result.next) next = result.next;
    summary[result.status === 'warn' ? 'warn' : 'ok'] += 1;
    onLine(stepLine({ id: step.id, title: step.title, status: result.status, durationMs,
      ...(result.showDetail && result.detail ? { detail: result.detail, showDetail: true } : {}),
      last: lastId }));
    // Saved after EVERY step, not at the end: the whole point of the state file is that a run which
    // does not reach the end still knows where it got to.
    save(root, state);
  }

  return { code: EXIT_OK, summary, state, stoppedAt: null, live, next };
}

/**
 * What Ctrl-C does. A function, not just a handler, so it can be tested without delivering a signal
 * — Windows cannot receive one from `process.kill` the way POSIX can, and a test that could only
 * run on one platform would leave the other's path unproven.
 */
export function interrupt({ root, state, live, onLine = () => {}, now = () => new Date(),
  // ARC-07-C31 slice 4 — `env` beside the `platform` this already had, because `isWindowsShell`
  // reads SHELL and MSYSTEM and a platform alone renders POSIX on any mac.
  save = saveState, platform = process.platform, env = process.env, spawn = nodeSpawn }) {
  if (live) live.interrupted = true;
  const killed = killTree(live?.child, { platform, spawn });
  const at = live?.step ?? null;
  if (at) {
    state.steps[at] = { ...(state.steps[at] ?? {}), status: 'failed', reason: 'interrupted',
      finishedAt: now().toISOString() };
    // ARC-07-C31 slice 4 — from the `platform` this function ALREADY took, plus the env, because
    // `isWindowsShell` reads SHELL and MSYSTEM and a platform alone renders POSIX on any mac.
    onLine(`interrupted during ${at} — re-run ${spellings({ platform, env }).bootstrap} `
      + `to resume at ${at}`);
  } else {
    onLine('interrupted — nothing was in progress');
  }
  try { save(root, state); } catch { /* an interrupt must not fail over its own bookkeeping */ }
  return { code: EXIT_INTERRUPTED, killed, at };
}
