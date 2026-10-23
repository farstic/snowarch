// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-06-S03 — `.local/bootstrap-state.json`: what this checkout knows about its own installation.
//
// Three properties, and each exists because of a specific way this file could hurt someone:
//
//   ATOMIC   a temp file plus `rename`, so a Ctrl-C mid-write cannot leave half a JSON document
//            where the next run — and `/snowarch status`, and the doctor — expect a whole one.
//   PRIVATE  0600 on POSIX. It is not supposed to hold anything sensitive, and the guard below is
//            what keeps that true, but a file this cheap to lock down should be locked down.
//   GUARDED  a write-time refusal of secret-shaped keys and values. `redact()` stops a secret being
//            PRINTED; this stops one being STORED, which is the longer-lived mistake — a log rotates
//            after ten runs, a state file does not.
//
// It is read by more than the bootstrap: `docsStatus()` (ARC-03-S06) reads `docs.mode`, and the
// `/snowarch status` skill reads `mode` when the doctor cannot run. That is why `docs.mode` is
// nested exactly where it is, and why the shape is versioned.
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { EXIT_FAIL } from './exit.mjs';
import { pathKey } from './path-key.mjs';
import { statePath as statePathOf, doctorCachePath as doctorCachePathOf }
  from './local-paths.mjs';
import { isSecretKey, redact } from './redact.mjs';
import { needSpell, spellings } from './launcher-spelling.mjs';

export const STATE_VERSION = 1;
export const PRODUCT = 'snowarch';

// ARC-07-C43 head 2 — named in `local-paths.mjs` now, the one home for everything under
// `.local/`. Re-exported here because ten call sites and four suites import them from this
// module, and a rename would have been churn with no reader asking for it.
export const statePath = statePathOf;
export const doctorCachePath = doctorCachePathOf;

/** Everything `--reset` may remove. Named here so the runner cannot widen it by accident. */
export const RESET_PATHS = [statePath, doctorCachePath];

/** The sentence `--reset` prints. The two files it names are the ones it must NOT touch. */
export const RESET_MESSAGE =
  'reset: bootstrap state cleared (.local/instances.json and .local/config.json untouched)';

export class StateError extends Error {
  constructor(message, code = EXIT_FAIL) { super(message); this.name = 'StateError'; this.code = code; }
}

/**
 * A value that must never reach the file.
 *
 * Two tests, and the second is the one that generalises: a URL shape, and then "would the redactor
 * change this?". Using the redactor as the oracle means the guard covers addresses, credential-ish
 * `KEY=value` text and anything a caller has registered as secret, without this module keeping a
 * second opinion about what sensitive looks like.
 */
const URLISH = /[a-z][a-z0-9+.-]*:\/\/|@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/i;
export function sensitiveValue(value) {
  if (typeof value !== 'string') return null;
  if (URLISH.test(value)) return 'looks like a URL or an address';
  if (redact(value) !== value) return 'the redactor would rewrite it';
  return null;
}

/**
 * Refuse to store a secret, wherever in the tree it is.
 *
 * Walks the whole object rather than checking the keys this version happens to define: the failure
 * to prevent is a step three stories from now putting an instance URL in its `data` blob, and that
 * step will not be edited into this list first.
 */
export function assertStorable(value, path = 'state') {
  if (Array.isArray(value)) {
    value.forEach((v, i) => assertStorable(v, `${path}[${i}]`));
    return value;
  }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (isSecretKey(k)) {
        throw new StateError(`refusing to write ${path}.${k}: the key names a secret — `
          + 'the state file records what was configured, never a credential');
      }
      assertStorable(v, `${path}.${k}`);
    }
    return value;
  }
  const why = sensitiveValue(value);
  if (why) {
    throw new StateError(`refusing to write ${path}: ${why} — `
      + 'the state file records what was configured, never a credential or an instance address');
  }
  return value;
}

/** The v1 skeleton. `mode` is null until the plan is accepted; the launchers write the same shape. */
export function emptyState({ engineVersion, platform = process.platform, node = null,
  writer = 'node', now = new Date() } = {}) {
  const at = now.toISOString();
  const state = {
    version: STATE_VERSION,
    product: PRODUCT,
    engineVersion,
    mode: null,
    docs: { mode: null, pin: null },
    node: node ?? { present: false, version: null },
    writer,
    platform,
    registration: 'project',
    registrationReason: 'default',
    hooksDisabledByBootstrap: false,
    startedAt: at,
    updatedAt: at,
    steps: {},
  };
  // Windows has no `chmod` worth the name, so the file inherits the directory's ACL and the state
  // says so rather than leaving a reader to assume a mode that was never applied.
  if (platform === 'win32') state.fileModes = 'acl-inherited';
  return state;
}

/**
 * Read the state, or `null` when there is none.
 *
 * A version this build does not know is an error, not something to migrate on the fly: the file may
 * have been written by a newer snowarch whose fields this one would silently drop on the next save.
 */
/**
 * ARC-07-C31 — THESE THREE SENTENCES ARE DELIBERATELY STILL POSIX, and the reason is the slice
 * boundary rather than an oversight.
 *
 * REQUIRED, and the ten callers are why. SEVEN are inside the doctor (`doctor/index.mjs` twice,
 * `doctor/fix.mjs`, `checks/host.mjs`, `checks/engine-repo.mjs` three times), every one holding a ctx
 * that carries a platform — so a DEFAULT would hand each of them the process. That is `E12_ABSENT`'s
 * situation exactly, and what cost twelve Windows cells when `MODE_VARIANTS` read the process. Most
 * of those sites currently discard the message in a `catch`, which hides the defect rather than
 * excusing it; that swallowing is ARC-07-C37's finding, not a reason to default here.
 *
 * It threads through `bootstrap.mjs` and `commands/upgrade.mjs`, both e2e TRIGGER FILES, so this
 * change carries the five `tests/upgrade` files at `--test-concurrency=2` plus `assert-clean`. Those
 * two files keep their OWN launcher sites for the trigger slice: what is added here is the argument,
 * nothing else.
 */
export function loadState(root, spell, { read = readFileSync } = {}) {
  needSpell(spell, 'loadState');
  const p = statePath(root);
  if (!existsSync(p)) return null;

  /*
   * ARC-07-C37 — READING AND PARSING ARE TWO FAILURES, and one `try` around both told the reader the
   * wrong thing about the more alarming one. Measured: `chmod 000` on a perfectly valid state file
   * produced `.local/bootstrap-state.json is not valid JSON (EACCES: permission denied, open ...)` — a
   * file described as corrupt when it is intact and merely unreadable — and a directory in its place
   * produced the same sentence with `EISDIR`. The remedy was wrong to match: `bootstrap --reset`
   * rewrites a corrupt file and does nothing about a permission the process does not have.
   *
   * It is fixed HERE because C37 is what makes this sentence travel: it now reaches `--section host`,
   * `--section prereqs`, E-10 and E-29 instead of dying in a `catch`, so a mislabel that used to be
   * seen once is about to be seen five times.
   */
  /*
   * `read` IS A SEAM FOR THE CASE, and it exists because the platform will not cooperate. The
   * unreadable-file sentence was asserted with `chmod 000`, which is a POSIX mode bit: on the Windows
   * runner the file read fine — the runner is an administrator — so all three Windows doctor cells went
   * red on a case whose PREMISE did not hold there, not on the behaviour it was written for.
   *
   * A named skip on win32 would have been the cheaper answer and a worse one: the sentence is not
   * POSIX-only, so a Windows reader whose file cannot be read deserves the same words, and a skip is
   * how a platform-specific hole survives twelve rows. Injecting the reader asserts what this function
   * WRAPS — a read failure becomes "could not be read", never "is not valid JSON" — on every cell.
   *
   * No product caller passes it. The real-filesystem path keeps its own unconditional case: a
   * DIRECTORY where the file should be fails identically on both platforms (EISDIR), which is why that
   * half needs no seam and no skip.
   */
  let text;
  try { text = read(p, 'utf8'); } catch (e) {
    throw new StateError(`.local/bootstrap-state.json could not be read (${e.message}) — check the `
      + 'permissions on it and on .local/ (snowarch writes the file 0600 and the directory 0700)');
  }
  let parsed;
  // A leading BOM is stripped before parsing: Notepad adds one to anything it saves, and a
  // user who opened this file to look at it should not be told it is corrupt.
  try { parsed = JSON.parse(text.replace(/^\uFEFF/, '')); } catch (e) {
    throw new StateError(`.local/bootstrap-state.json is not valid JSON (${e.message}) — `
      + `run ${spell.cli} bootstrap --reset to start over`);
  }
  const version = parsed?.version;
  if (version > STATE_VERSION) {
    throw new StateError(`state file is from a newer snowarch — run ${spell.cli} upgrade`);
  }
  // A missing or nonsensical version is a DIFFERENT problem, and gets a different sentence: telling
  // someone their file is "from a newer snowarch" when it has no version at all sends them to an
  // upgrade that will not help.
  if (!Number.isInteger(version) || version < 1) {
    throw new StateError('.local/bootstrap-state.json has no usable schema version — '
      + `run ${spell.cli} bootstrap --reset to start over`);
  }
  if (!parsed.steps || typeof parsed.steps !== 'object') parsed.steps = {};
  return parsed;
}

/**
 * The state, or the REASON there is none — ARC-07-C37, and the one place that decides what is
 * tolerable.
 *
 * Seven doctor call sites wrote `try { loadState(...) } catch { return null }`, and that `catch`
 * cannot tell two different things apart:
 *
 *   - `.local/bootstrap-state.json` is unreadable. A fact about the CHECKOUT, which E-11 owns and
 *     which the other checks tolerate so one cause does not produce seven failures.
 *   - `loadState` was called wrong. A fact about THIS CODE. ARC-07-C31 found one of those the hard
 *     way: `recordedMode` reached `loadState` through an injected default, the spelling became
 *     required, the `catch` turned the `TypeError` into a silent `null`, and E-03 reported `warn`
 *     where the recorded mode said `fail`. The only thing that noticed was an assertion two files
 *     away.
 *
 * So the tolerated failure is the one `loadState` RAISES DELIBERATELY — a `StateError`, carrying the
 * sentence a user needs — and everything else propagates. That is C31's rethrow generalised to one
 * function instead of repeated by hand at seven sites, which is the difference between a rule and a
 * habit: the eighth site written next year gets it by calling this.
 *
 * And the reason is RETURNED rather than logged, because who reports it is the caller's decision:
 * E-11 prints the sentence, E-10 and E-29 skip and point at E-11, E-27 drops its claim about a mode
 * it cannot read, and `--section host` stops reporting a checkout as healthier than it is.
 */
export function loadStateOrReason(root, spell, { load = loadState } = {}) {
  try {
    return { state: load(root, spell), reason: null };
  } catch (e) {
    if (!(e instanceof StateError)) throw e;
    return { state: null, reason: e.message };
  }
}

/**
 * Write it, atomically, with the guard in front.
 *
 * The temp name carries the pid so two processes cannot rename over each other's half-written file,
 * and it is removed on failure — a `.tmp` left in `.local/` after a crash is litter a user has to
 * wonder about.
 */
export function saveState(root, state, { now = new Date() } = {}) {
  assertStorable(state);
  const p = statePath(root);
  // `dirname(p)`, not `join(root, '.local')`: the directory created is the one written to, so a
  // redirected state root cannot create one place and write to another.
  mkdirSync(dirname(p), { recursive: true, mode: 0o700 });

  const next = { ...state, updatedAt: now.toISOString() };
  const tmp = `${p}.tmp-${process.pid}`;
  try {
    writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
    if (process.platform !== 'win32') chmodSync(tmp, 0o600);
    renameSync(tmp, p);
  } catch (e) {
    rmSync(tmp, { force: true });
    throw new StateError(`could not write .local/bootstrap-state.json: ${e.message}`);
  }
  return next;
}

/** `--reset`: the state and the doctor's cache, and nothing else that lives in `.local/`. */
export function resetState(root) {
  const removed = [];
  for (const at of RESET_PATHS) {
    const p = at(root);
    if (existsSync(p)) { rmSync(p, { force: true }); removed.push(p); }
  }
  return removed;
}

/**
 * ARC-09-C198 — WHICH FOLDER THE RECORDED STEPS RAN IN.
 *
 * A step is cached when its recorded hash matches its inputs, and B02's, B03's and B07's inputs are the same files in
 * every checkout of a release. So a record copied from another folder — the cross-version sweep carried a 2.2.0 one
 * into a fresh checkout — marked those steps done where they had never run: no corpus, no `settings.local.json`, and
 * E-29 saying "all current". The record now names its folder, and only a record that names this one is this
 * checkout's.
 *
 * A KEY, NOT THE PATH. `assertStorable` refuses any value the redactor would rewrite, and the bootstrap registers the
 * instance's password with the redactor (`instance-file.mjs`), so a folder path that held the password would make
 * every save throw. The sha256 of the path's `pathKey`, the spelling B00's `samePath` compares, names the folder as
 * well, and keeps the path out of the file.
 *
 * The ENGINE root, never `.local/`'s: CI copies `.local/` into `SNOWARCH_STATE_ROOT` for the doctor, and that copy
 * is still its checkout's record. Only the runner writes the key (`steps/index.mjs`), and only together with
 * dropping the steps it cannot vouch for.
 */
export const checkoutKey = (root, plat = process.platform) =>
  createHash('sha256').update(pathKey(root, plat)).digest('base64url');

/** Whether `state` is a record of the checkout at `root`. A record that names no folder is not. */
export const recordedHere = (state, root, plat = process.platform) =>
  typeof state?.checkout === 'string' && state.checkout === checkoutKey(root, plat);

/**
 * Why a record is not this checkout's: `other-folder` when it names another folder, and `no-folder` when it names
 * none, as every record written before this release does, and every record the launchers write.
 */
export const notHereReason = (state) => (typeof state?.checkout === 'string' ? 'other-folder' : 'no-folder');

/**
 * Which steps would run again, and why.
 *
 * ARC-09-S05. The resume rule lives in the runner — skip a step whose recorded hash still matches —
 * and this is the same question asked from outside, for a user who wants to know what running
 * `bootstrap` again is about to do, and for `upgrade` (ARC-09-S07), which needs to say what a new
 * version invalidates before it changes anything.
 *
 * ARC-09-C198 adds two that come before the rest: a step recorded by a record that is not this checkout's runs
 * (`other-folder`, `no-folder`), because the runner keeps none of that record's steps.
 *
 * Four reasons, and the fourth is the one that surprises people:
 *
 *   `never-run`        no record — a fresh checkout, or a step added since
 *   `failed`           it ran and did not succeed; a failure is never cached
 *   `inputs-changed`   the hash moved, and `changed` names the inputs that did
 *   `launcher-recorded` the LAUNCHERS record `inputsHash: null` by design (ARC-06-S14): bash and
 *                      PowerShell cannot compute the table, so a Node-free install leaves every
 *                      step unverifiable and the next Node run re-runs B01/B02 as a reconcile.
 *                      Treated as stale, because "no hash" and "a hash that matches" must never be
 *                      the same answer — the same rule the git seam follows about failure.
 */
export function staleSteps(state, ctx, { hashFor, steps = null, alwaysRuns = () => false } = {}) {
  if (typeof hashFor !== 'function') throw new TypeError('staleSteps needs hashFor');
  const ids = steps ?? Object.keys(state?.steps ?? {});
  const out = [];
  const notHere = recordedHere(state, ctx?.root, ctx?.platform) ? null : notHereReason(state);

  for (const step of ids) {
    // A step that runs every time is not STALE — it is unconditional, and listing it would put
    // B00 and B09 in every answer to "what changed". The runner spells the same fact
    // `cacheable = false`; the table spells it as a row with no inputs, and the caller passes
    // whichever it holds. Both also record `inputsHash: null`, which is why this comes first: the
    // launcher rule below must not claim a null that was never going to be a hash.
    if (alwaysRuns(step)) continue;

    const recorded = state?.steps?.[step];
    // ARC-09-C198 — a step another folder recorded, or a record that names no folder, says nothing about this one.
    // A step with no record at all has simply not run, and keeps that reason.
    if (recorded && notHere) {
      out.push({ step, reason: notHere, changed: [] });
      continue;
    }
    // A step recorded `skipped` was decided against by `runsWhen` — design-only never installs
    // dependencies — so it holds no result to reuse. It has not run in this checkout, and the
    // detail says which of the two ways that came about.
    if (!recorded || recorded.status === 'skipped') {
      out.push({ step, reason: 'never-run', changed: [], ...(recorded ? { detail: 'skipped' } : {}) });
      continue;
    }
    if (recorded.status !== 'ok') {
      out.push({ step, reason: 'failed', changed: [], detail: recorded.status });
      continue;
    }
    if (recorded.inputsHash === null || recorded.inputsHash === undefined) {
      out.push({ step, reason: 'launcher-recorded', changed: [] });
      continue;
    }

    let current;
    try { current = hashFor(step, ctx); } catch (e) {
      // A row that cannot be hashed is stale, not fatal: the step will run, which is the safe
      // direction, and the reason says what happened rather than crashing a resume.
      out.push({ step, reason: 'inputs-changed', changed: [`unhashable: ${e.message}`] });
      continue;
    }
    if (current !== recorded.inputsHash) {
      out.push({ step, reason: 'inputs-changed', changed: [], now: current, was: recorded.inputsHash });
    }
  }
  return out;
}

/** One line per stale step, in the words the bootstrap's own output uses. */
export function explainStale(stale) {
  const REASON = {
    'never-run': 'has not run in this checkout',
    failed: 'did not succeed last time',
    'inputs-changed': 'its inputs changed',
    'launcher-recorded': 'was recorded by a launcher, which cannot compute the hash',
    'other-folder': 'was recorded in another folder',
    'no-folder': 'was recorded without a folder',
  };
  return stale.map(({ step, reason, changed = [], detail }) => {
    const why = REASON[reason] ?? reason;
    const extra = changed.length ? ` (${changed.join(', ')})` : (detail ? ` (${detail})` : '');
    return `${step} will run — ${why}${extra}`;
  });
}

/**
 * The instance this install recorded — label, environment, preset — or `null`.
 *
 * ARC-06-C15. Two readers wanted this and each had its own expression for it: `mode.mjs` built one
 * from `state.instance` and `state.steps.B08.data.instance`, and B09's `instanceFrom` read the same
 * two. NOTHING ever wrote either, so both answered `unknown` (mode) or `null` (B09) on every live
 * checkout. B06 now records it; this is the one place that knows where to look, so the next reader
 * does not invent a third path to the same fact.
 */
export function recordedInstance(state) {
  const i = state?.steps?.B06?.data?.instance
    ?? state?.steps?.B08?.data?.instance
    ?? state?.instance
    ?? null;
  return i?.label ? { label: i.label, environment: i.environment ?? null, preset: i.preset ?? null } : null;
}
