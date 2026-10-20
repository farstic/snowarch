// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-08-S04 — SV-00…SV-08: the server package's own checks, run inside the engine's report.
//
// THE ENGINE DOES NOT RE-IMPLEMENT ANY OF THEM. Flag rules, store schema, presets and the stdio
// handshake are the server's subject, and a second implementation in engine JavaScript is `00`
// P-16 exactly: two answers to one question, and the one users see is the one that is wrong. So
// this file imports `runServerDoctor`, hands it the options it needs, and adopts its results into
// the registry shape.
//
// The import is BY FILE PATH, never the bare specifier the package's `exports` map publishes:
// `tools/snowarch` has no `node_modules` of its own, and the workspace symlink in the root's only
// exists after `npm ci` — which a design-only checkout never runs. The specifier stays the public
// API for other consumers, and a test asserts both resolve to the same module when it can.
import { existsSync, readFileSync } from 'node:fs';
import { bootstrapOf, cliOf } from '../spell.mjs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { serverDepsInstalled } from '../../instance.mjs';
import { productDir } from '../../spawn-env.mjs';
import { licenceStatus, REFUSED } from '../../licence/state.mjs';
import { NO_LICENCE_IN_FORCE } from './licence.mjs';
import { defineCheck } from '../registry.mjs';

import { fail, skip } from './result.mjs';

/**
 * The ids, in report order — and a SECOND declaration of the server module's `CHECK_IDS`.
 *
 * It has to be one: the checks are registered before anything is imported, and on a design-only
 * checkout nothing ever will be. Two declarations that must agree is the repository's answer to
 * that (the server key has four), so `tests/doctor/server.test.mjs` compares them whenever the
 * module can be loaded and fails if they drift.
 */
export const SERVER_CHECK_IDS = Object.freeze([
  'SV-00', 'SV-01', 'SV-02', 'SV-03', 'SV-04', 'SV-05', 'SV-06', 'SV-07', 'SV-08', 'SV-09',
]);

/** What each id is called before the module has answered — replaced by the module's own title. */
const TITLES = Object.freeze({
  'SV-00': 'Node version', 'SV-01': 'dist artefacts', 'SV-02': 'store', 'SV-03': 'instances',
  'SV-04': 'instance probes', 'SV-05': 'stdio handshake', 'SV-06': 'capabilities match the store',
  'SV-07': 'audit trail', 'SV-08': 'ancestor skill directories', 'SV-09': 'store schema',
});

export const DOCTOR_ENTRY = ['dist', 'doctor', 'index.js'];

export const DEPS_MISSING = 'server dependencies not installed';
export const DIST_MISSING = 'prebuilt server missing';

/**
 * Can the server module be imported at all, and if not, which half is absent?
 *
 * Decided BEFORE importing, because an import that fails takes a stack trace and an errno with it
 * and neither says which of the two states a user is in. `serverDepsInstalled` is the forwarder's
 * own predicate — `createRequire` from the package's manifest, which asks the question Node will
 * ask — rather than a second guess at what "installed" means.
 */
export function availability(root, config, { exists = existsSync, deps = serverDepsInstalled } = {}) {
  const packageDir = config?.mcp?.packageDir ?? join('packages', 'snowarch');
  const entry = join(root, packageDir, ...DOCTOR_ENTRY);
  if (!exists(entry)) return { state: 'no-dist', entry, packageDir };
  if (!deps(root)) return { state: 'no-deps', entry, packageDir };
  return { state: 'ready', entry, packageDir };
}

/**
 * The server's report, run once per doctor run and memoised on the context.
 *
 * Nine checks, one run: the module spawns a real server for SV-05/SV-06, and nine imports of the
 * same module each doing that would cost nine cold starts to answer one question nine ways.
 */
export async function serverReport(ctx) {
  if (ctx._server !== undefined) return ctx._server;
  const state = ctx.serverAvailability ?? availability(ctx.root, ctx.config);
  if (state.state !== 'ready') {
    ctx._server = { ...state, report: null, error: null };
    return ctx._server;
  }
  // The server module resolves ITS store from `CLAUDE_PROJECT_DIR` (or the cwd) — and this call
  // is in-process, so it would otherwise read the environment of whatever spawned the doctor. In
  // production that is the same directory (the command refuses to run anywhere but the root), so
  // this changes nothing there; it makes a doctor run describe the root it was GIVEN, which is
  // what B08, the CI smoke probe and every fixture-based test rely on.
  const saved = { project: process.env.CLAUDE_PROJECT_DIR, store: process.env.SNOW_STORE };
  // ARC-11-C6 step 4b — the directory whose `.local/` the engine reads, so the server's licence is the engine's.
  process.env.CLAUDE_PROJECT_DIR = productDir(ctx.root);
  if (ctx.storePath) process.env.SNOW_STORE = ctx.storePath;
  else delete process.env.SNOW_STORE;
  try {
    const module = await (ctx.importServer ?? ((href) => import(href)))(
      pathToFileURL(state.entry).href);
    const report = await module.runServerDoctor({
      noNetwork: ctx.flags?.noNetwork === true,
      cwd: ctx.root,
    });
    ctx._server = { ...state, report, error: null };
  } catch (e) {
    // A dependency that is missing DEEPER than the SDK — the module imported, one of its imports
    // did not. Same user-visible state as `no-deps`, and named as that rather than as a crash.
    const message = String(e?.message ?? e);
    ctx._server = {
      ...state,
      report: null,
      state: /ERR_MODULE_NOT_FOUND|Cannot find (package|module)/.test(message) ? 'no-deps' : state.state,
      error: message.split('\n')[0],
    };
  } finally {
    if (saved.project === undefined) delete process.env.CLAUDE_PROJECT_DIR;
    else process.env.CLAUDE_PROJECT_DIR = saved.project;
    if (saved.store === undefined) delete process.env.SNOW_STORE;
    else process.env.SNOW_STORE = saved.store;
  }
  return ctx._server;
}

/** `live` when the recorded mode says so — design-only is the default, and its skips are expected. */
const isLive = (ctx) => ctx.mode === 'live';

/** `MCP_TIMEOUT` from the committed settings — never a literal (`01` §13, and S-06 measured it). */
export function mcpTimeout(root, { read = readFileSync } = {}) {
  try {
    const value = Number(JSON.parse(read(join(root, '.claude', 'settings.json'), 'utf8'))
      ?.env?.MCP_TIMEOUT);
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

/** More than 60 % of the budget spent on a cold start is the S-06 warning, on an `ok` result. */
export const HEADROOM = 0.6;

export function headroomNote(initializeMs, timeoutMs) {
  if (!initializeMs || !timeoutMs) return null;
  return initializeMs > timeoutMs * HEADROOM
    ? `cold start ${initializeMs} ms is over ${Math.round(HEADROOM * 100)} % of MCP_TIMEOUT `
      + `(${timeoutMs} ms) — see docs/TROUBLESHOOTING.md "MCP_TIMEOUT"`
    : null;
}

/**
 * ARC-11-C6 step 5 — the server checks that call a tool. SV-06 compares the capabilities a `tools/call` returns, and
 * the server refuses every tool with no licence in force, so its own reason would point at SV-05, which passes. SV-05
 * lists the tools and calls none.
 */
export const CALLS_A_TOOL = Object.freeze(['SV-06']);

/** Is a licence in force for this doctor run? The run's own reading, else this root's. */
const licenceRefused = (ctx) => REFUSED.includes((ctx.licence ?? licenceStatus(ctx.root)).state);

/** One id's result, adopted from the server's report or explained by its absence. */
export async function adopt(ctx, id) {
  const answer = await serverReport(ctx);
  const title = TITLES[id];
  if (answer.report) {
    const result = answer.report.checks.find((c) => c.id === id);
    if (!result) {
      // The module answered without this id: a version skew between a committed `dist/` and this
      // engine. Reported as what it is rather than as a passing check nobody ran.
      return skip(`${id} was not in the server's report (version skew)`, { adopted: false });
    }
    // With no licence in force a check that calls a tool cannot tell anything, and E-31 names the cause.
    if (CALLS_A_TOOL.includes(id) && licenceRefused(ctx)) return skip(NO_LICENCE_IN_FORCE, { adopted: false });
    const { id: _id, title: _title, status, detail, ...rest } = result;
    const adopted = { status, detail, ...rest,
      data: { adopted: true, title, ...(result.data ?? {}) } };
    // The one thing the server module cannot judge: whether its cold start fits the budget
    // `.claude/settings.json` sets. That file is the engine's, so the comparison is the engine's.
    if (id === 'SV-05' && adopted.status === 'ok') {
      const note = headroomNote(result.data?.initializeMs, ctx.mcpTimeout ?? mcpTimeout(ctx.root));
      if (note) {
        return { ...adopted, status: 'warn', detail: `${adopted.detail} — ${note}`,
          remedy: 'raise MCP_TIMEOUT in .claude/settings.json, or find out why start-up is slow' };
      }
    }
    return adopted;
  }
  if (answer.state === 'no-dist') {
    return id === 'SV-01'
      // `fixable: false` on the RESULT: `--fix` installs dependencies, it does not restore a
      // committed artefact — that is one `git checkout` a human runs after looking at their diff.
      ? fail(`${DIST_MISSING} — ${join(answer.packageDir, ...DOCTOR_ENTRY)} is not there`, {
        remedy: `git checkout -- packages/snowarch/dist, or ${cliOf(ctx)} upgrade`,
        command: 'git checkout -- packages/snowarch/dist',
        fixable: false,
        data: { state: answer.state },
      })
      : skip(DIST_MISSING, { state: answer.state });
  }
  // Dependencies absent. In design-only that is the DESIGN — `npm ci` never runs there — so every
  // check skips and nothing fails. In live mode the server cannot start, which is SV-01's to say.
  if (id === 'SV-01' && isLive(ctx)) {
    return fail(`${DEPS_MISSING}${answer.error ? ` (${answer.error})` : ''}`, {
      remedy: `${cliOf(ctx)} doctor --fix`,
      command: `${cliOf(ctx)} doctor --fix`,
      data: { state: 'no-deps', fix: { kind: 'deps-missing' } },
    });
  }
  return skip(DEPS_MISSING, { state: 'no-deps' });
}

/** The header the text report prints for the section when nothing could run by design. */
export const DESIGN_ONLY_HEADER = 'server (skipped — design-only)';

export function serverChecks() {
  return SERVER_CHECK_IDS.map((id) => defineCheck({
    id,
    section: 'server',
    title: TITLES[id],
    // The server's own severities decide the STATUS; this is the severity a failure carries in the
    // engine's registry, and only SV-04 is allowed to be less than a failure — a probe that could
    // not run says so, and a machine offline is not a broken install.
    severity: id === 'SV-04' ? 'warn' : 'fail',
    // ARC-09-C8 — NONE of them is quick, and the reason is a shared cost rather than a per-check
    // one. `serverReport` runs the server package's own doctor once and caches it on the ctx, so
    // the FIRST SV check in a run pays for all of them: 222 ms locally, ~500 on a Windows cell,
    // against a contract of 50. Marking only SV-00 `quick: false` would have moved that number
    // onto SV-01 — the same shift that moving E-12 out put onto E-13, measured both times.
    //
    // What this costs a user: `--quick` no longer reports the server section. What it buys is the
    // SessionStart banner, whose re-run path is a quick doctor and is paid before anyone's first
    // word. The full `./snowarch doctor` is unchanged and is what writes the cache the banner
    // reads first.
    quick: false,
    network: id === 'SV-04',
    spawns: ['SV-05', 'SV-06'].includes(id),
    // `fixable` comes from the ADOPTED result — the server marks SV-01/SV-02/SV-03 fixable when
    // they are. A registry flag cannot: whether an entry can be repaired depends on the entry.
    fixable: ['SV-01', 'SV-02', 'SV-03'].includes(id),
    run: async (ctx) => adopt(ctx, id),
  }));
}
