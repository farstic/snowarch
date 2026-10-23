#!/usr/bin/env node
// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-08-S08 — the SessionStart banner: one truthful `Mode:` line, and at most four nudges.
// ARC-11-C1 — and, second, the `Licence:` line, from `.local/licence.json` and the cached revocation list.
//
// THREE PROMISES, and they are the reason this file is shaped the way it is.
//
//   IT NEVER FAILS A SESSION. Every path exits 0, nothing reaches stderr, and any exception at all
//   becomes one honest line. A hook that exits non-zero or writes to stderr is a session that
//   starts with an error message about the tool that was supposed to help.
//
//   IT IS FAST. The fast path reads two small JSON files and prints — two more for the licence line,
//   with one small module and one signature check — and it imports no part of the
//   doctor, because importing the check registry to decide whether it needs the check registry
//   would spend the whole budget before the decision. The doctor arrives through a lazy `import()`
//   on the re-run branch only.
//
//   IT NEVER GUESSES. The line it prints was DERIVED by the doctor from the toggle file and the
//   store (ARC-08-S05) and cached; when the cache no longer describes this checkout it re-runs the
//   offline subset rather than printing something older than the facts.
//
// The root comes from this file's own location, never from `cwd` and never from
// `CLAUDE_PROJECT_DIR`: inside a session that variable is the SESSION's project, which is the same
// directory here and is not guaranteed to be, and a banner that described another checkout would
// be worse than no banner.
import { existsSync, readFileSync, realpathSync, writeSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/** The re-run's budget. Half the hook's own 10 s timeout, so the watchdog is always the first to fire. */
export const WATCHDOG_MS = 5_000;

/** How old a cache may be before it is re-derived, whatever the mtimes say. */
export const MAX_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * How old an upgrade check may be before the banner stops repeating it (ARC-09-S07).
 *
 * Inlined rather than imported from `lib/upgrade-check.mjs`, and that is the one duplication this
 * file accepts on purpose: the hook's whole budget is 300 ms on a machine that may have no Node.
 * Its rule, as measured for ARC-09-C199, is lazy modules on the banner path, never the doctor, and
 * constants inlined: a dynamic import here would put a module resolution on the critical path to
 * save a constant. `tests/hook/session-start.test.mjs` asserts the two numbers agree.
 */
export const UPGRADE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * ARC-09-C199 — this tree's release, for the upgrade record's judge: `v<version of record>`, or null on a
 * development tree.
 *
 * E-28 asks git (`describe --tags --exact-match`); the banner spawns nothing, so it reads `package.json`, which a
 * release tree carries at its tag. They can differ on one tree: a release with commits on top of its tag, where
 * E-28's answer is null and this one is the tag. There the banner can be quieter than E-28, never louder, because
 * `here` only ever silences a record (rule 2, ARC-09-C210).
 */
function releaseOf(root) {
  const version = readJson(join(root, 'package.json'))?.version;
  return typeof version === 'string' && version && !/-dev\b/.test(version) ? `v${version}` : null;
}

/** Read a JSON file, or `null`. A malformed cache is a stale cache, never a crash. */
function readJson(path) {
  try {
    return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null;
  } catch {
    return null;
  }
}

/**
 * The four nudges, in the story's order, from the ONE definition of each.
 *
 * `first` is only a first run when THIS invocation created the cache: a design-only checkout that
 * has been running for a month does not need to be told again every session.
 */
function nudges({ report, cache, banner, firstRun, upgrade, upgradeSays,
  // ARC-07-C31 — the spelling the banner's lines are rendered with. Passed, not read: this function
  // is handed its `banner` too, so reading a shell here would be the one thing in it that came from
  // somewhere other than its arguments.
  spell }) {
  const lines = [];
  const instances = report?.server?.instances ?? cache?.server?.instances ?? [];
  if (firstRun && report?.mode !== 'live' && instances.length === 0) lines.push(banner.firstRun(spell));
  // ARC-09-C199 — what the record says, as E-28 reads it (`upgrade-record.mjs`): a measurement, FRESH
  // and not merely present (ARC-09-S07), that says behind, of a release newer than this one. A
  // `behind: true` from a fortnight ago, one an upgrade wrote, one from another tree, one naming a
  // prerelease: each is SILENCE, never a hedged nudge, since a line that is wrong teaches a reader
  // to skip it, and then the one that matters is skipped too.
  if (upgradeSays?.speak) lines.push(banner.upgrade(upgrade.latestTag, spell));
  const stale = report?.stale?.claudeJsonEntries ?? cache?.report?.stale?.claudeJsonEntries ?? [];
  if (stale.some((e) => e.scope === 'this-folder')) lines.push(banner.staleRegistration(spell));
  const fail = report?.summary?.fail ?? cache?.summary?.fail ?? 0;
  if (fail > 0) lines.push(banner.doctorFail(fail, spell));
  return lines;
}

/**
 * ARC-11-C141 — the checkout's own files, at the start of every session: `Integrity: …`, third, after the Licence line.
 *
 * THE OWNER'S RULING (2026-10-14): a change to the AI Architect's own files does not take effect. So the hook runs the
 * one function the server and the launcher run (`ensureIntegrity`), on its stat key: a `stat` per covered file when
 * nothing moved, the moved files hashed when something did. A change is put back and the line says so; with
 * CLAUDE.md or anything under .claude/ among them, it adds "— restart claude", because this session read those before
 * the hook ran (the one-session bound, R6). A tree that cannot be restored prints its "cannot restore" line, which the
 * CLAUDE.md sentence keys on. A verified, development or non-engine tree prints nothing. Never throws: no line is the
 * honest failure, as for the licence line.
 */
async function integrityEvent({ root, now, keys }) {
  try {
    const { ensureIntegrity } = await import('../../../packages/snowarch/dist/licence/integrity.js');
    const { localDir } = await import('../lib/local-paths.mjs');
    const { productDir } = await import('../lib/spawn-env.mjs');
    const { spellings } = await import('../lib/text.mjs');
    const e = ensureIntegrity(root, { local: localDir(root), cli: spellings().cli, projectDir: productDir(root),
      now: () => new Date(now), keys });
    if (e.state === 'restored') return e.claudeChanged ? `${e.line} — restart claude` : e.line;
    return e.state === 'refused' ? e.line : null;
  } catch {
    return null;
  }
}

/**
 * The doctor, in process, under a watchdog.
 *
 * `Promise.race` rather than an `AbortController` threaded through every check: the runner has no
 * abort seam, and adding one so a banner could interrupt it would put the banner's deadline inside
 * twenty-eight checks. The run is abandoned instead — it writes its own cache when it finishes, so
 * the next session gets the answer this one waited too long for.
 */
async function reRun({ config, watchdogMs, run }) {
  const doctor = run ?? (await import('../lib/doctor/index.mjs')).runDoctor;
  let timer;
  try {
    return await Promise.race([
      // ARC-11-C7 — E-32 is the one quick check that reads every covered file, so the banner never runs it: `status`
      // and `doctor --quick` compute it, and the banner shows the verdict they cached. The hook never hashes.
      doctor({ root: ROOT, config, quick: true, noNetwork: true, writeCache: true, exclude: ['E-32'] }),
      new Promise((_, reject) => {
        // ARC-09-C77 — REF'D: it bounds an awaited run, and `finally` clears it, so it never holds a
        // hook whose run has answered. Unref'd, a run pending on nothing ended the hook in exit 13
        // before the watchdog fired — no banner, and an exit code that is the one thing Claude Code
        // reads from this process.
        timer = setTimeout(() => reject(new Error('watchdog')), watchdogMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * ARC-11-C1 — `Licence: <state> …`, or `null` when it cannot be worked out.
 *
 * `null` prints nothing, and that is the honest failure for this line: the hook never fails a session, and a
 * guessed state is worse than none. The CLAUDE.md sentence reads the line; with no line it has nothing to read.
 * A small module and two small files, read in-process — no doctor, no child, no network.
 */
async function licenceLine({ root, now, env, keys }) {
  try {
    const { bannerLine, licenceStatus } = await import('../lib/licence/state.mjs');
    const s = licenceStatus(root, { now: new Date(now), keys });
    return bannerLine(s);
  } catch {
    return null;
  }
}

/**
 * ARC-09-C5 — where the re-run path's time goes, measured, and OFF unless asked.
 *
 * The Windows cells spend 690–920 ms of the product's own time on this path and nobody knows on
 * what; the cap must not move until somebody does. So the phases are timed in the hook itself
 * rather than inferred from outside, and printed to STDERR — stdout is the banner's, and a
 * diagnostic on it would reach a user's session.
 *
 * The flag is read once, here, and its ABSENCE is the tested default: a timing hook that can be
 * left on by accident is a product that measures itself for ever. `tests/hook/session-start.test.mjs`
 * asserts an ordinary run prints nothing extra.
 */
const PHASES = process.env.SNOWARCH_BANNER_PHASES === '1';

function phases() {
  if (!PHASES) return { mark: () => {}, done: () => {} };
  const marks = [];
  let last = process.hrtime.bigint();
  return {
    mark: (name) => {
      const nowNs = process.hrtime.bigint();
      marks.push([name, Number(nowNs - last) / 1e6]);
      last = nowNs;
    },
    done: (path) => {
      const total = marks.reduce((a, [, ms]) => a + ms, 0);
      writeSync(2, `banner-phases: path=${path} total=${Math.round(total)} ms · `
        + `${marks.map(([n, ms]) => `${n} ${Math.round(ms)}`).join(' · ')}\n`);
    },
  };
}

export async function banner({ root = ROOT, now = Date.now(), watchdogMs = WATCHDOG_MS,
  run = null, env = process.env, licenceKeys = undefined } = {}) {
  const phase = phases();
  // The lines belong to THIS call. They were module state once, which is harmless in production —
  // the hook runs once per process — and wrong the moment anything calls it twice, which the tests
  // do: a case's assertion picked up the previous case's line.
  const out = [];
  const say = (line) => { if (line) out.push(line); };
  // ARC-07-C31 — `spellings` comes from the SAME destructure as `BANNER`, at function scope. The
  // block at the `unbootstrapped` branch below has its own import, and reaching for that one from
  // here would be a ReferenceError — the fourth out-of-scope reference this programme has paid for,
  // so this one is read from the signature rather than assumed.
  const { BANNER, spellings } = await import('../lib/text.mjs');
  const { cachePath, inputsPath, cacheStale } = await import('../lib/doctor-cache.mjs');
  // ARC-11-C1 — the licence line, second on every path that prints a Mode line. From the files as they
  // are: the licence and the cached revocation list. The hook never fetches, however old the list is.
  const licence = await licenceLine({ root, now, env, keys: licenceKeys });
  // ARC-11-C141 — before the cache is read: a restore changes files the doctor's cache keys on.
  const integrity = await integrityEvent({ root, now, keys: licenceKeys });

  const cache = readJson(cachePath(root));
  const inputs = readJson(inputsPath(root));
  const upgrade = readJson(join(root, '.local', 'upgrade-check.json'));
  // ARC-09-C199 — the judge E-28 uses, loaded only when there is a record to judge.
  const upgradeSays = upgrade
    ? (await import('../lib/upgrade-record.mjs')).recordSays(upgrade,
      { here: releaseOf(root), now, maxAgeMs: UPGRADE_MAX_AGE_MS })
    : null;

  // 1. The fast path. Nothing beyond these two files has been read, and nothing else will be.
  const staleness = cacheStale(root, { now, maxAgeMs: MAX_AGE_MS });
  phase.mark('cache-read+decision');
  if (cache && inputs && !staleness.stale && cache.modeLine) {
    say(cache.modeLine);
    say(licence);
    say(integrity);
    for (const line of nudges({ cache, banner: BANNER, firstRun: false, upgrade, upgradeSays, spell: spellings() })) say(line);
    phase.mark('render');
    phase.done('cache');
    return { path: 'cache', lines: out };
  }

  // 3. Never bootstrapped — checked BEFORE the re-run, because a doctor on a checkout with no
  // state answers a question nobody asked and costs a second doing it.
  if (!existsSync(join(root, '.local', 'bootstrap-state.json'))) {
    // The hook renders for the person in front of it, so the PROCESS is the right shell here.
    const { MODE_VARIANTS, modeLine } = await import('../lib/text.mjs');
    say(modeLine({ mode: 'unknown', qualifier: MODE_VARIANTS.notBootstrapped(spellings()) }));
    say(licence);
    say(integrity);
    return { path: 'unbootstrapped', lines: out };
  }

  // 2. The re-run.
  const { loadConfig } = await import('../lib/config.mjs');
  let report = null;
  const config = loadConfig(root);
  phase.mark('state+config');
  try {
    ({ report } = await reRun({ config, watchdogMs, run }));
    phase.mark('doctor');
  } catch (e) {
    if (e?.message !== 'watchdog') throw e;
    // The watchdog. An old line marked old beats no line: the mode rarely changes, and the
    // suffix says how much to trust it.
    // ARC-07-C31 — the hook renders for the person in front of it, so the PROCESS is the right shell.
    say(cache?.modeLine
      ? `${cache.modeLine}${BANNER.staleSuffix(spellings())}`
      : BANNER.timedOut(spellings()));
    say(licence);
    say(integrity);
    return { path: 'timeout', lines: out };
  }

  say(report.modeLine);
  say(licence);
  say(integrity);
  for (const line of nudges({ report, banner: BANNER, firstRun: cache === null, upgrade, upgradeSays, spell: spellings() })) say(line);
  phase.mark('render');
  phase.done('rerun');
  return { path: 'rerun', lines: out };
}

/**
 * `isMain` rather than a bare call: the tests import `banner()` and must not print on import.
 *
 * Compared through `realpath`. On macOS `/var` is a symlink to `/private/var`, so a hook run from
 * a temp checkout has `argv[1]` under one name and `import.meta.url` under the other — the same
 * trap the doctor's root check hit — and the file would decide it was not the main module and
 * print nothing at all. Silence is the one failure mode a banner must not have.
 */
const samePath = (a, b) => {
  const real = (p) => { try { return realpathSync.native(p); } catch { return resolve(p); } };
  return real(a) === real(b);
};
const isMain = process.argv[1] && samePath(process.argv[1], fileURLToPath(import.meta.url));
if (isMain) {
  let lines;
  try {
    ({ lines } = await banner());
  } catch (e) {
    // The CLASS, never the message: a message can carry a path, a URL or a value, and this line
    // goes into a session transcript.
    // ARC-07-C31 — `spellings` from the SAME destructure, because this is the CLI WRAPPER's catch
    // block, not `banner`'s: the one at function scope above is out of reach here. Read from the
    // structure rather than assumed — the fifth out-of-scope reference this programme has paid for.
    const { BANNER, spellings } = await import('../lib/text.mjs');
    lines = [BANNER.failed(e?.constructor?.name ?? 'Error', spellings())];
  }
  process.stdout.write(`${lines.join('\n')}\n`);
  // Always. Whatever Claude Code does with a hook's exit code, it can never be provoked from here.
  process.exitCode = 0;
}
