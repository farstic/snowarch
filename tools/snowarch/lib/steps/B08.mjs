// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// B08 verify — the first moment the installed product is actually exercised.
//
// It matters that the server is SPAWNED rather than imported: the failures worth catching are the
// child's — a cold start slower than `MCP_TIMEOUT`, a `dist/` that does not match the contract, an
// `SNOW_STORE` in the operator's shell pointing somewhere else — and none of them reproduce
// in-process.
//
// ARC-08-S05 changed WHO spawns it. This step used to speak MCP itself, compare the tool list and
// the capabilities, and write the doctor cache — all of which the doctor's `server` section now
// does, with the same child and the same comparisons. So B08 asks the doctor and reports its
// answer: one handshake in the product, one cache writer, and an install whose verdict cannot
// disagree with the first `./snowarch doctor` the user runs.
import { spawnSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { storePath } from '../local-paths.mjs';
import { contractSha } from '../config.mjs';
import { runDoctor } from '../doctor/index.mjs';
import { productEnv } from '../spawn-env.mjs';
import { TEXT } from './inputs.mjs';
import { INPUTS } from '../inputs.mjs';

export const id = 'B08';
export const title = 'verify';
export const needsNode = true;
const applies = (ctx) => ctx.mode === 'live';
/**
 * ARC-11-C6 (ruling R1) — and a licence in force. The probes are the package CLI's `instance --help`, `list` and
 * `test`, which that CLI refuses without one, by the gate ./snowarch uses. Asked here, so the runner records the
 * step skipped, and the first bootstrap after a licence is installed runs it.
 */
const unlicensed = (ctx) => applies(ctx) && packageCliRefused(ctx);
export const runsWhen = (ctx) => applies(ctx) && !unlicensed(ctx);
import { ADD_INSTANCE } from '../text.mjs';
import { packageCliRefused, REMEDY } from '../licence/state.mjs';
import { NO_LICENCE_IN_FORCE } from '../doctor/checks/licence.mjs';

export const skipReason = (ctx) => (unlicensed(ctx) ? NO_LICENCE_IN_FORCE : 'design-only');
export const skipNote = (spell, ctx) => (unlicensed(ctx) ? REMEDY(spell.cli) : null);

// ARC-08-C7 — the SAME state as the doctor's Mode line and the bootstrap's Next block, so the same
// remedy. This was a third wording of "there is no instance yet", inside the same runner.
export const NO_INSTANCE = `no instance configured — run ${ADD_INSTANCE()}`;
export const PROBES_UNAVAILABLE = 'probes: not available in this build';

export function storeMtime(root) {
  const p = storePath(root);
  return existsSync(p) ? String(statSync(p).mtimeMs) : 'none';
}

// ARC-09-S05: the declaration lives in `lib/inputs.mjs`. Ten steps answering "what are my
// inputs" in ten files is ten places to get the resume rule wrong, and no way to show a user the
// set — the table is one answer, and `docs/ARCHITECTURE.md` renders from it.
export const inputs = INPUTS.B08.resolve;



/** `instance list --json`, then `instance test <label> --json` — or the graceful absence. */
export function runProbes(root, { run = spawnSync } = {}) {
  const cli = join(root, 'packages', 'snowarch', 'dist', 'cli', 'index.js');
  if (!existsSync(cli)) return { status: 'unavailable', probes: null };

  // Every child is TOLD which checkout it serves: the server CLI resolves its store from
  // `CLAUDE_PROJECT_DIR`, so an inherited value would have it read another repository's store.
  const options = { encoding: 'utf8', stdio: 'pipe', cwd: root, env: productEnv(root) };
  const help = run(process.execPath, [cli, 'instance', '--help'], options);
  // ARC-07-S06 adds `instance test`. Until it does, the cache records "unavailable" and the step
  // warns: a probe that does not exist yet is not a failed probe, and calling it a FAIL would stop
  // installations for a feature nobody has promised yet.
  if (!/\btest\b/.test(`${help.stdout ?? ''}${help.stderr ?? ''}`)) {
    return { status: 'unavailable', probes: null };
  }

  const list = run(process.execPath, [cli, 'instance', 'list', '--json'], options);
  let labels = [];
  try { labels = (JSON.parse(list.stdout ?? '[]').instances ?? []).map((i) => i.label); } catch { /* none */ }

  const probes = {};
  for (const label of labels) {
    const out = run(process.execPath, [cli, 'instance', 'test', label, '--json'], options);
    try { probes[label] = JSON.parse(out.stdout ?? '{}'); } catch { probes[label] = { error: 'unparsable' }; }
  }
  return { status: 'ok', probes };
}

/** The SV ids this step reports on, in the order a reader of the install summary wants them. */
export const SERVER_IDS = Object.freeze(['SV-01', 'SV-05', 'SV-06', 'SV-04']);

export const run = async (ctx) => {
  const root = ctx.root;

  // The doctor's server section, with the cache written: `--section` runs normally leave the cache
  // alone (a partial report must not look like a full one to the banner), and this is the one
  // caller whose partial report IS what the banner should hold immediately after an install.
  const { report } = await (ctx.runDoctor ?? runDoctor)({
    root,
    config: ctx.config,
    sections: ['server'],
    writeCache: true,
    env: ctx.env,
    home: ctx.home ?? '',
  });

  const byId = new Map(report.checks.map((c) => [c.id, c]));
  const of = (id) => byId.get(id) ?? { status: 'skip', detail: 'not reported' };
  const configured = (report.server?.instances ?? []).some((i) => i.status === 'loaded');
  const failed = SERVER_IDS.map(of).find((c) => c.status === 'fail');
  if (failed) return { status: 'fail', detail: failed.detail, remedy: failed.remedy ?? null };

  const handshake = of('SV-05');
  const toolCount = handshake.data?.toolCount ?? null;
  const initializeMs = handshake.data?.initializeMs ?? null;

  const probes = runProbes(root, ctx.runCli ? { run: ctx.runCli } : {});
  const summary = `${toolCount ?? 0} tools, contract match`
    + (configured ? ', capabilities = store' : '')
    + (probes.status === 'ok' ? ', probes ran' : '');

  if (!configured) {
    ctx.line?.(`WARN B08: ${NO_INSTANCE}`);
    return { status: 'warn', detail: summary,
      data: { toolCount, initializeMs, configured: false } };
  }
  if (probes.status !== 'ok') ctx.line?.(`WARN B08: ${PROBES_UNAVAILABLE}`);
  return { status: probes.status === 'ok' ? 'ok' : 'warn', detail: summary,
    data: { toolCount, initializeMs, configured: true } };
};


/** The unconfigured core set, from the server build that decides it. */
async function coreToolNames(root) {
  try {
    const mod = await import(pathToFileURL(join(root, 'packages/snowarch/dist/tools/status.js')).href);
    return mod.CORE_TOOLS_UNCONFIGURED;
  } catch { return null; }
}
