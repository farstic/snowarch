// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// B00 preflight — every prerequisite, checked before anything is installed.
//
// Two rules shape this step, and both come from watching installers get it wrong:
//
//   EVERY CHECK RUNS, even after one has failed. An operator who is missing git AND behind a
//   TLS-intercepting proxy should learn both in one pass, not discover the second after fixing the
//   first. So nothing short-circuits; the failures are collected and counted at the end.
//
//   EVERY FAILURE NAMES ITS REMEDY. "Prerequisite missing" is a status, not help. The sentences
//   live in `remedies.json` because the Node-free launchers print the same ones (S10/S11) and the
//   doctor quotes them (ARC-08) — one wording, three programs.
//
// This step runs BEFORE the plan screen and is never cached: it decides whether the machine can run
// the others, and a cached "yes" from last week is exactly the answer nobody wants after Node has
// been uninstalled.
import { execFileSync } from 'node:child_process';
import { batchCommand, isBatch } from '../spawn-batch.mjs';
import { statfsSync } from 'node:fs';
import { arch, platform, release } from 'node:os';
import { resolve } from 'node:path';
import { EXIT_PREREQ } from '../exit.mjs';
import { pathKey } from '../path-key.mjs';
import { remedyFor } from '../remedies.mjs';
import { formatVersion, meetsFloor, parseVersion } from '../versions.mjs';
import { MODE, RETRY_WAITS_MS, attemptSuffix } from '../docs/sync.mjs';
import { corpusProbe, probeNetwork, probeRetryReason } from '../probe-net.mjs';
import { which } from '../which.mjs';
import { INPUTS } from '../inputs.mjs';

export const id = 'B00';
export const title = 'preflight';
export const needsNode = false;
export const runsWhen = () => true;
export const cacheable = false;
// ARC-09-S05: the declaration lives in `lib/inputs.mjs`. Ten steps answering "what are my
// inputs" in ten files is ten places to get the resume rule wrong, and no way to show a user the
// set — the table is one answer, and `docs/ARCHITECTURE.md` renders from it.
export const inputs = INPUTS.B00.resolve;

/** Disk. Not a configured floor — it is what this repository costs, and the numbers are its own. */
const GIB = 1024 ** 3;
export const DISK_SPARSE = 1 * GIB;      // sparse docs ≈ 300 MB + deps ≈ 72 MB + headroom
export const DISK_FULL = 1.5 * GIB;      // `--docs full` is the whole corpus

const mb = (bytes) => `${Math.round(bytes / (1024 * 1024))} MB`;
const gb = (bytes) => `${(bytes / GIB).toFixed(1)} GB`;

/**
 * Run a tool by its RESOLVED path.
 *
 * `which` first, then spawn the file — never a bare name, which on Windows sends `child_process`
 * through a shell to resolve `.cmd`, and never `npx`, which would reach the network from the step
 * whose job is to find out whether the network works.
 */
export function makeExec({ env = process.env, plat = process.platform,
  // The two seams, with the real implementations as defaults. `plat` alone is not enough to test
  // the Windows branch below: proving it needs a `.cmd` to resolve to and a spawn to observe, and
  // neither exists on the machines this suite mostly runs on.
  resolve: resolveBin = which, exec: run = execFileSync } = {}) {
  return (name, args) => {
    const bin = resolveBin(name, { env, platform: plat });
    if (!bin) return { found: false, ok: false, stdout: '', stderr: '' };
    try {
      /*
       * WINDOWS: a `.cmd` / `.bat` cannot be spawned directly — Node closed CVE-2024-27980 in 20.12
       * by refusing to exec a batch file without a shell, and the refusal is an EINVAL, so
       * `npm --version` (which resolves to `npm.CMD`) came back as "found but did not answer" on
       * every Windows machine.
       *
       * ARC-09-C67/C68 — AND `shell: true` WAS THE WRONG FIX, in the two ways the comment that used
       * to sit here predicted when it said "it re-introduces quoting rules". Node 24 deprecates
       * `shell: true` with an args array (DEP0190) and printed that warning on every launcher run;
       * and it concatenates arguments without quoting, so a resolved
       * `C:\Program Files\nodejs\npm.cmd` arrived as three tokens and E-03 said
       * `'C:\Program' is not recognized` on a machine whose npm was fine. `spawn-batch.mjs` runs it
       * through `cmd.exe /d /s /c` with one command line we quoted ourselves.
       */
      const useBatch = plat === 'win32' && isBatch(bin);
      const call = useBatch ? batchCommand(bin, args, { env }) : { file: bin, args, options: {} };
      const stdout = run(call.file, call.args,
        { encoding: 'utf8', stdio: 'pipe', timeout: 10_000, ...call.options });
      return { found: true, ok: true, stdout, stderr: '', bin };
    } catch (e) {
      return { found: true, ok: false, stdout: String(e.stdout ?? ''),
        stderr: String(e.stderr ?? e.message ?? ''), bin };
    }
  };
}

const ok = (id2, detail, extra = {}) => ({ id: id2, status: 'ok', detail, ...extra });
const warn = (id2, detail, remedy = null) => ({ id: id2, status: 'warn', detail, remedy });
const fail = (id2, detail, remedy, extra = {}) => ({ id: id2, status: 'fail', detail, remedy, ...extra });

/**
 * 1. The working directory is the checkout, and git agrees it is a repository root.
 *
 * Paths are compared through `realpath`. `resolve` alone is not enough: on macOS `/tmp` and
 * `/var` are symlinks, home directories are often symlinked on managed machines, and git always
 * reports the resolved path — so a checkout reached through a link compared unequal to itself and
 * the user was told to `cd` to the directory they were already standing in.
 *
 * ARC-09-C198 — the normalisation is `pathKey` (`../path-key.mjs`), moved there unchanged, because the bootstrap
 * state's record of its folder needs the same rule written down as a key.
 */
export const samePath = (a, b, plat = process.platform) => pathKey(a, plat) === pathKey(b, plat);

export function checkRoot({ root, cwd, exec, plat }) {
  const remedy = remedyFor('root', { platform: plat, values: { root } });
  if (!samePath(cwd, root, plat)) {
    return fail('root', `not at the repository root — run: ${remedy}`, remedy);
  }
  const top = exec('git', ['-C', root, 'rev-parse', '--show-toplevel']);
  if (!top.found || !top.ok) {
    // git's own absence is check 2's finding, not this one's — reporting it twice would have the
    // operator fix one problem and see two lines about it.
    return warn('root', `${root} (git could not confirm the repository root)`);
  }
  if (!samePath(top.stdout.trim(), root, plat)) {
    return fail('root', `not at the repository root — run: ${remedy}`, remedy);
  }
  return ok('root', root);
}

/** 2. git, at or above the configured floor. */
export function checkGit({ exec, floors, plat }) {
  const remedy = remedyFor('git', { platform: plat });
  const r = exec('git', ['--version']);
  if (!r.found) return fail('git', 'git not found', remedy);
  const { ok: passes, found } = meetsFloor(r.stdout, floors.git);
  if (!found) return fail('git', `git version not understood: ${r.stdout.trim()}`, remedy);
  if (!passes) {
    // The reason is built from the configured floor, never from a number typed here: ADR-0008 is
    // why the floor is what it is, and if the floor moves this sentence has to move with it.
    return fail('git', `git ${formatVersion(found)} found, ≥ ${floors.git} required `
      + `(below ${floors.git}, \`sparse-checkout set --cone\` stores \`--cone\` as a pattern)`, remedy);
  }
  return ok('git', formatVersion(found));
}

/**
 * 3. Claude Code, and whether it is logged in.
 *
 * The login probe is attempted only when the installed CLI advertises the sub-command, and never
 * fails the run: signing in is Claude Code's own first-run flow, and a preflight that refused to
 * install an engine because the user had not signed in yet would be refusing the wrong thing.
 */
export function checkClaudeCode({ exec, floors, plat, skip }) {
  if (skip) return warn('claudeCode', 'Claude Code check skipped (--skip-claude-check)');
  const remedy = remedyFor('claudeCode', { platform: plat });
  const r = exec('claude', ['--version']);
  if (!r.found) {
    return fail('claudeCode',
      `Claude Code not found on PATH — install it from https://code.claude.com/docs/en/setup, `
      + 'then re-run', remedy);
  }
  const { ok: passes, found } = meetsFloor(r.stdout, floors.claudeCode);
  if (!found) return fail('claudeCode', `Claude Code version not understood: ${r.stdout.trim()}`, remedy);
  if (!passes) {
    return fail('claudeCode', `Claude Code ${formatVersion(found)} found, ≥ ${floors.claudeCode} `
      + 'required (tool-list refresh after a registration change)', remedy);
  }

  const help = exec('claude', ['--help']);
  if (!help.ok || !/\bauth\b/.test(`${help.stdout}${help.stderr}`)) {
    return ok('claudeCode', `${formatVersion(found)} · login: not verified `
      + '(claude auth status unavailable)');
  }
  const auth = exec('claude', ['auth', 'status']);
  return auth.ok
    ? ok('claudeCode', `${formatVersion(found)} · login: ok`)
    : warn('claudeCode', 'Claude Code is not logged in — run: claude', 'claude');
}

/** 4. Enough disk for the corpus, the dependencies and some headroom. */
export function checkDisk({ root, docs, plat, statfs = statfsSync }) {
  // `MODE.full` rather than the word: it is ARC-03's vocabulary for a checkout shape, and it is
  // also spelled like a preset the contract owns, so a quoted copy here is the wrong kind of name.
  const need = docs === MODE.full ? DISK_FULL : DISK_SPARSE;
  let free;
  try {
    const s = statfs(root);
    free = Number(s.bavail) * Number(s.bsize);
  } catch (e) {
    return warn('disk', `free space not measured (${e.code ?? e.message})`);
  }
  if (free < need) {
    const remedy = remedyFor('disk', { platform: plat,
      values: { needed: mb(need - free), mount: root } });
    return fail('disk', `${gb(free)} free, ${gb(need)} needed`, remedy);
  }
  return ok('disk', `${gb(free)} free`);
}

/**
 * 5. The host THIS RUN will contact, through whatever the environment puts in the way.
 *
 * ARC-09-C29: that host is the corpus remote, because the corpus is what the run fetches (B02).
 * It used to be `https://github.com/<repo>.git` — the product repository, which no step in a
 * bootstrap contacts — so the check asked about a host the run does not use and said nothing about
 * the one it does. In the default configuration the corpus IS on github.com and nothing changes.
 *
 * An upstream that needs no network, or one this probe cannot speak to, is reported rather than
 * skipped in silence: the line says which, and the two are not the same claim.
 */
/**
 * A pause the tests replace, so the schedule is proven without being spent (ARC-03-C1's rule).
 *
 * ARC-09-C76 — and a pause that HOLDS the event loop. It used to `unref()` its timer, and an awaited
 * unref'd timer is a promise nothing keeps alive: when a retryable failure leaves no socket open — a
 * refused connection does exactly that — the loop is empty for the whole wait, and Node ends the
 * process with `main()` still pending: exit 13, `Detected unsettled top-level await`, where the
 * operator was owed a retry and then exit 3. Under `node:test` the runner keeps the loop alive, so no
 * in-process case can see it; the one that does runs the real CLI in a child
 * (`tools/snowarch/tests/b00-settles.test.mjs`).
 */
const pause = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

export async function checkNetwork({ env, plat, probe = probeNetwork, target, upstream,
                                     sleep = pause }) {
  const plan = target ? { local: false, probe: true, host: new URL(target).hostname, target }
    : corpusProbe(upstream);
  if (!plan.probe) return ok('network', plan.reason);

  // ARC-09-C40 — the same three attempts B02's checkout has had since ARC-03-C1, one step earlier.
  //
  // A preflight that failed a whole install on ONE unlucky HTTP probe was the ARC-03-C1 defect
  // moved forward in the run: the same flaky minute that B02 survives by waiting 3 s used to stop
  // the bootstrap before it started, and `bootstrap (macos-latest, node 24)` on #193 is the
  // occurrence that made the case — exit 3 with no log, and disk or network the only two
  // candidates.
  //
  // The SCHEDULE and the closing sentence are shared with B02 (`RETRY_WAITS_MS`, `attemptSuffix`);
  // the CLASSIFIER is not, and deliberately: `transientReason` reads libcurl's words as git
  // surfaces them, while this probe returns errno and DNS codes and an HTTP status. Rendering
  // those back into prose so a text matcher could read them would discard the better evidence.
  //
  // COST, measured rather than assumed: a permanent class — a name that does not resolve, an
  // intercepted TLS chain — stops on the first attempt and costs nothing, which is the common
  // shape of a genuinely broken setup. Only a flaky network pays, and it pays at most the two
  // waits (3 s + 9 s) plus its own probe timeouts.
  let r;
  for (let attempt = 1; ; attempt += 1) {
    r = await probe({ env, target: plan.target });
    if (r.ok) {
      return ok('network', `${plan.host} reachable (HTTP ${r.status})`
        + (r.proxy ? ` via proxy ${r.proxy}` : '')
        + (attempt > 1 ? ` after ${attempt} attempts` : ''));
    }
    const reason = probeRetryReason(r);
    const waitMs = RETRY_WAITS_MS[attempt - 1];
    if (reason === null || waitMs === undefined) {
      // Exhausted or permanent, told apart the way #186 tells them apart: `(3 attempts)` when the
      // schedule ran out, `stopped after N` when the class turned settled partway through, and
      // nothing at all after a single attempt, because a count of one is noise.
      return fail('network', `${r.detail}${attemptSuffix(attempt, reason !== null)}`,
        remedyFor('network', { platform: plat }));
    }
    await sleep(waitMs);
  }
}

/**
 * 6. Node and npm — a FAIL only when live mode was asked for.
 *
 * Design-only needs no Node at all: the launchers do that path themselves. So an absent Node is a
 * `note:` there and a hard stop only when the operator asked for the mode that cannot work without
 * it. Saying "install Node" to someone who does not need it is how installers earn their reputation.
 */
export function checkNode({ exec, locate = (n) => which(n), floors, plat, mode }) {
  const remedy = remedyFor('node', { platform: plat });
  const live = mode === 'live';
  // `usable` is recorded separately from the STATUS, because the two answer different questions:
  // an absent Node is a `note` in design-only (status ok) and still means live mode cannot run.
  // The plan screen reads this to decide whether it may offer live at all — parsing it back out of
  // the sentence, which is what the first version did, is a sentence away from being wrong.
  const missing = (detail) => (live
    ? fail('node', `live mode needs Node.js ${parseVersion(floors.node).major}+ — ${remedy}`, remedy,
      { usable: false })
    : ok('node', `note: ${detail}`, { usable: false }));

  const r = exec('node', ['--version']);
  if (!r.found) {
    return missing(`Node.js not found — design-only only; live mode needs Node `
      + `${parseVersion(floors.node).major}+ (${remedy})`);
  }
  const { ok: passes, found } = meetsFloor(r.stdout, floors.node);
  if (!found || !passes) {
    return missing(`Node.js ${formatVersion(found) ?? r.stdout.trim()} found, `
      + `≥ ${floors.node} needed for live mode (${remedy})`);
  }
  // npm is checked for PRESENCE, and deliberately not run on Windows.
  //
  // There it is `npm.cmd`, and since the CVE-2024-27980 fix (Node 20.12 / 21.7) `child_process`
  // refuses to spawn a `.cmd` without a shell — so asking it for `--version` fails and npm looks
  // missing on every Windows machine, which is what the runner showed. Spawning it through a shell
  // is the thing this module does not do. Presence is the requirement anyway: no floor is compared
  // against npm's version, so reading it is a nicety and reading it wrongly is a wrong FAIL.
  const npmPath = locate('npm');
  if (!npmPath) {
    return missing(`Node.js ${formatVersion(found)} found but npm is not on PATH (${remedy})`);
  }
  const shim = /\.(cmd|bat)$/i.test(npmPath);
  const npmVersion = shim ? null : parseVersion(exec('npm', ['--version']).stdout);
  return ok('node', `${formatVersion(found)} · npm ${npmVersion ? formatVersion(npmVersion) : 'present'}`,
    { usable: true });
}

/** 7. What machine this is — recorded for B09 and the doctor; only 32-bit is worth a warning. */
export function checkPlatform({ plat, cpu = arch(), rel = release() }) {
  const detail = `${plat} ${cpu} ${rel}`;
  return cpu.includes('32') || cpu === 'ia32'
    ? warn('platform', `${detail} — 32-bit`, remedyFor('platform', { platform: plat }))
    : ok('platform', detail);
}

/** All seven, in order, none of them short-circuiting. */
export async function runChecks(ctx) {
  const exec = ctx.exec ?? makeExec({ env: ctx.env, plat: ctx.plat });
  const locate = ctx.locate ?? ((n) => which(n, { env: ctx.env, platform: ctx.plat }));
  const common = { ...ctx, exec, locate };
  return [
    checkRoot(common),
    checkGit(common),
    checkClaudeCode(common),
    checkDisk(common),
    await checkNetwork(common),
    checkNode(common),
    checkPlatform(common),
  ];
}

/** `ok B00 git: 2.39.5` · `WARN B00: …` · `FAIL B00: …` — the story's forms, one per check. */
export function checkLine(check) {
  if (check.status === 'ok') return `ok B00 ${check.id}: ${check.detail}`;
  return `${check.status === 'warn' ? 'WARN' : 'FAIL'} B00: ${check.detail}`;
}

export const run = async (ctx) => {
  const plat = ctx.plat ?? process.platform;
  const checks = await runChecks({
    root: ctx.root, cwd: ctx.cwd ?? process.cwd(), env: ctx.env ?? process.env,
    floors: ctx.config.floors, docs: ctx.docs, mode: ctx.mode, plat,
    skip: Boolean(ctx.skipClaudeCheck), exec: ctx.exec, locate: ctx.locate, probe: ctx.probe,
    statfs: ctx.statfs,
    target: ctx.env?.SNOWARCH_TEST_NET_URL,
    // ARC-09-C29: what this run will fetch. `SNOWARCH_TEST_NET_URL` above still wins, because a
    // test that needs a specific endpoint is asking a different question from "what is configured".
    upstream: ctx.config?.docs?.upstream,
  });

  for (const c of checks) {
    ctx.line?.(checkLine(c));
    if (c.remedy && c.status !== 'ok') ctx.line?.(`Remedy: ${c.remedy}`);
  }

  const failures = checks.filter((c) => c.status === 'fail');
  const versionOf = (cid) => parseVersion(checks.find((c) => c.id === cid)?.detail ?? '');
  const data = {
    node: formatVersion(versionOf('node')),
    git: formatVersion(versionOf('git')),
    claudeCode: formatVersion(versionOf('claudeCode')),
    platform: plat, arch: arch(), release: release(),
    nodeUsable: checks.find((c) => c.id === 'node')?.usable === true,
    checks: Object.fromEntries(checks.map((c) => [c.id, c.status])),
  };

  if (failures.length > 0) {
    return { status: 'fail', code: EXIT_PREREQ, data,
      // NAMED, not counted. ARC-08-C3 is the same defect one step later: B09's summary "printed a
      // failure count and named nothing", which is what Sitting A's owner found first. A count is
      // what you write when you have the list and do not print it.
      detail: `${failures.length} prerequisite(s) missing: ${failures.map((f) => f.id).join(', ')}`,
      remedy: failures.map((f) => f.remedy).filter(Boolean)[0] ?? null };
  }
  const warned = checks.filter((c) => c.status === 'warn').length;
  return { status: warned > 0 ? 'warn' : 'ok', data,
    detail: warned > 0 ? `${warned} warning(s)` : undefined };
};
