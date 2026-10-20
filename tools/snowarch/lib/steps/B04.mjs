// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// B04 deps — the server's runtime dependencies, installed once, at the root.
//
// S-15 measured it: `npm ci --omit=dev --ignore-scripts` at the ROOT produces the runtime tree the
// server needs (identical on nine cells), so there is no workspace fallback to choose between and
// one place to change if that verdict ever moves.
//
// `--ignore-scripts` is not a performance flag. It is the difference between installing packages
// and running whatever their authors put in `postinstall` on a machine that has just cloned a
// repository — and this step runs before the operator has been told anything about what is about
// to execute.
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { classifyNpmFailure, NPM_SENTENCE } from '../npm-failures.mjs';
import { remedyFor } from '../remedies.mjs';
import { parseVersion, formatVersion } from '../versions.mjs';
import { childEnv } from '../spawn-env.mjs';
import { which } from '../which.mjs';
import { FILE, TEXT } from './inputs.mjs';
import { INPUTS } from '../inputs.mjs';
import { spellings } from '../launcher-spelling.mjs';

export const id = 'B04';
export const title = 'deps';
export const needsNode = true;
export const runsWhen = (ctx) => ctx.mode === 'live' || ctx.env.SNOWARCH_TEST_FORCE_DEPS === '1';
export const skipReason = 'design-only';
// ARC-09-S05: the declaration lives in `lib/inputs.mjs`. Ten steps answering "what are my
// inputs" in ten files is ten places to get the resume rule wrong, and no way to show a user the
// set — the table is one answer, and `docs/ARCHITECTURE.md` renders from it.
export const inputs = INPUTS.B04.resolve;

export const NPM_ARGS = Object.freeze([
  'ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund',
]);

/**
 * npm, run as a SCRIPT under this Node — never the `npm`/`npm.cmd` shim.
 *
 * Since the CVE-2024-27980 fix, `child_process` refuses to spawn a `.cmd` without a shell, and a
 * shell is what this module does not use. The shim's own `npm-cli.js` sits beside it in every
 * distribution, so resolving the shim and running its neighbour with `process.execPath` works the
 * same way on all three platforms and keeps the Node that is running the bootstrap.
 */
export function npmCommand({ env = process.env, plat = process.platform } = {}) {
  const shim = which('npm', { env, platform: plat });
  if (!shim) return null;
  const dir = shim.replace(/[\\/][^\\/]+$/, '');
  for (const candidate of [
    join(dir, 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    join(dir, '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
  ]) {
    if (existsSync(candidate)) return { exec: process.execPath, prefix: [candidate], shim };
  }
  // No `npm-cli.js` beside the shim: on POSIX the shim itself is a runnable script, so it is used
  // directly. On Windows it would be a `.cmd` and cannot be, which is reported rather than guessed.
  return plat === 'win32' ? null : { exec: shim, prefix: [], shim };
}

/** Bytes under a directory, `.bin` symlinks counted once. For B09's summary, not for a decision. */
export function directorySize(dir) {
  let bytes = 0;
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) walk(p);
      else if (e.isFile()) bytes += statSync(p).size;
    }
  };
  try { walk(dir); } catch { return null; }
  return bytes;
}

/**
 * Every dependency the server declares resolves FROM the entry point's location.
 *
 * Not "does node_modules exist" and not a list of names typed here: the names come from the
 * package's own manifest, and resolution is asked from `dist/server.js`'s directory, which is where
 * the server will actually ask. That makes the check hoisting-safe — it does not care whether npm
 * put a package at the root or nested — and it cannot go stale when a dependency is added.
 */
export function resolutionCheck(root, { requireFrom = createRequire } = {}) {
  const manifest = join(root, 'packages', 'snowarch', 'package.json');
  const entry = join(root, 'packages', 'snowarch', 'dist', 'server.js');
  const deps = Object.keys(JSON.parse(readFileSync(manifest, 'utf8')).dependencies ?? {});
  const req = requireFrom(entry);

  /**
   * Present, by any answer other than "not found".
   *
   * The obvious probe — `resolve(name + '/package.json')` — reports `commander` as MISSING in this
   * very repository: it is installed, and its `exports` map simply does not publish that path, so
   * Node answers ERR_PACKAGE_PATH_NOT_EXPORTED. A check that fails on a correctly installed tree is
   * worse than no check, because the remedy it prints ("rm -rf node_modules") does not help.
   *
   * So the main entry is tried first — that is what the server actually imports — and a
   * NOT_EXPORTED answer counts as present, because only an installed package can refuse a subpath.
   */
  const resolves = (name) => {
    for (const specifier of [name, `${name}/package.json`]) {
      try { req.resolve(specifier); return true; } catch (e) {
        if (e?.code === 'ERR_PACKAGE_PATH_NOT_EXPORTED') return true;
      }
    }
    return false;
  };

  const missing = deps.filter((name) => !resolves(name));
  return { deps, missing };
}

/**
 * `, ~68 MB` — the size this checkout measured LAST time, or nothing at all.
 *
 * ARC-08-C23 — the line said `~72 MB`, hand-typed, and it was wrong twice over: it is the `du`
 * figure from ARC-01-S05 while the step itself reports summed content two screens later (the two
 * differ by 15 MB on the same tree, which is why the footprint gate names the metric it uses), and
 * a number typed into a step cannot follow a dependency being added or dropped.
 *
 * So the hint is a MEASUREMENT or it is absent. B04 already records `sizeBytes` in the state after
 * every successful install, so the second install onwards quotes what this machine actually wrote;
 * the first install says nothing, because there is nothing to say and a made-up magnitude is worse
 * than none — a user watching a download is trying to decide whether to wait, and a wrong number
 * is what makes them stop waiting at the wrong moment.
 */
export function installSizeHint(state, { round = Math.round } = {}) {
  const bytes = state?.steps?.B04?.data?.sizeBytes;
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes <= 0) return '';
  return `, ~${round(bytes / (1024 * 1024))} MB last time`;
}


export const run = async (ctx) => {
  const npm = npmCommand({ env: ctx.env, plat: ctx.plat ?? process.platform });
  if (!npm) {
    return { status: 'fail', detail: NPM_SENTENCE.missing,
      remedy: remedyFor('node', { platform: ctx.plat ?? process.platform }) };
  }

  const version = ctx.npmVersion ?? (() => {
    try {
      return formatVersion(parseVersion(
        execFileSync(npm.exec, [...npm.prefix, '--version'], { encoding: 'utf8', stdio: 'pipe' })));
    } catch { return null; }
  })();

  ctx.line?.(`[B04/09] deps … installing (npm ci${installSizeHint(ctx.state)})`);
  const started = Date.now();
  let log = '';
  try {
    log = (ctx.runNpm ?? defaultRunNpm)(npm, ctx.root, ctx.env);
  } catch (e) {
    // The whole log goes to the file logger; only the classified sentence goes to the console.
    const output = `${e.stdout ?? ''}\n${e.stderr ?? ''}`;
    ctx.log?.debug?.(output);
    return { status: 'fail', remedy: null,
      detail: classifyNpmFailure(output, { logPath: ctx.log?.logFile ?? null }) };
  }
  ctx.log?.debug?.(log);

  const { deps, missing } = resolutionCheck(ctx.root,
    ctx.requireFrom ? { requireFrom: ctx.requireFrom } : {});
  if (missing.length > 0) {
    return { status: 'fail',
      remedy: `run: rm -rf node_modules && ${spellings({ platform: ctx.platform, env: ctx.env }).bootstrap}`,
      detail: `npm ci finished but ${missing.length} of ${deps.length} server dependencies do not `
        + `resolve from dist/server.js (${missing.slice(0, 3).join(', ')})` };
  }

  const sizeBytes = directorySize(join(ctx.root, 'node_modules'));
  return {
    status: 'ok',
    detail: `${deps.length} dependencies${sizeBytes ? `, ${Math.round(sizeBytes / (1024 * 1024))} MB` : ''}`,
    data: { npmVersion: version, durationMs: Date.now() - started, sizeBytes },
  };
};

/**
 * The spawn options npm is given. Exported so the environment can be asserted rather than assumed.
 *
 * npm does not read the session variable, but it goes through the same helper as every other child:
 * an exception maintained by memory is an exception somebody forgets, and the next child added here
 * may well be one that does read it.
 */
export const npmSpawnOptions = (root, env) => ({
  cwd: root, encoding: 'utf8', stdio: 'pipe', maxBuffer: 64 * 1024 * 1024,
  env: childEnv(root, { NODE_ENV: 'production' }, env),
});

const defaultRunNpm = (npm, root, env) =>
  execFileSync(npm.exec, [...npm.prefix, ...NPM_ARGS], npmSpawnOptions(root, env));
