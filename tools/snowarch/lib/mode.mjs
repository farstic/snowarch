// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-06-S12 — `snowarch mode`: what this checkout is, and how to change it.
//
// Three forms, and the shape of the command is the point:
//
//   mode              report — the S09 Mode line and the registration kind, nothing written
//   mode live         B00, then the runner; B01–B03 stand on their cached results
//   mode design       B07 and B09 only; the credential store is not touched
//
// `mode live` is deliberately NOT a second bootstrap. It reuses the same registry, the same
// runner, the same state file and the same closing block, and the only thing it decides is which
// steps are in the list — because an installation that can be reached two ways is an installation
// with two behaviours, and the second one is always the less tested.
//
// The `--register` fallback is the other half of the story: on a machine whose policy rejects
// project-scope MCP servers, the same secret-free entry is registered per-checkout (`local`) or,
// as a last resort, per-machine (`user`). Everything to do with `~/.claude.json` goes through
// `registration-claude.mjs`, which calls the CLI that owns that file.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { EXIT_FAIL, EXIT_OK, EXIT_PREREQ, EXIT_USAGE } from './exit.mjs';
import { loadConfig, root as defaultRoot, version } from './config.mjs';
import { storePath as storePathOf } from './local-paths.mjs';
import { checkLocation, checkMode } from './instance-file.mjs';
import { LIVE_YES_WITHOUT_FILE, liveYesNeedsInstanceFile } from './bootstrap.mjs';
import { CREATED_BY_US, SCOPES, resolveClaude, register as registerServer, serverEntry, unregister }
  from './registration-claude.mjs';
import { LAST, STEPS, interrupt, runSteps } from './steps/index.mjs';
import { readDefaultLabel } from '../../../packages/snowarch/dist/store/label.js';
import { StateError, loadState, recordedInstance, saveState } from './state.mjs';
import { MODE_DESIGN_NOTE, instanceKeptNote, modeLine, needSpell, registrationLine, restartSentence,
  spellings } from './text.mjs';

/**
 * ARC-07-C31 — A FUNCTION OF THE READER'S SHELL, the shape `doctor/index.mjs` already uses.
 *
 * `cli.mjs` resolves a `usage` that is a function and threads the one `where` it built, so this
 * renders the shell in front of the person who typed `--help`. It takes the shell as an ARGUMENT so a
 * case can drive the Windows rendering without forcing `process.platform` — measured as unusable
 * locally: 550 of 1271 root cases fail under it, because faking the platform breaks path handling,
 * executable resolution and fixture creation.
 */
export const USAGE = (where) => [
  `usage: ${spellings(where).cli} mode [live|design] [options]`,
  '',
  '  (no argument)             print the Mode line and the registration kind',
  '  live                      switch this checkout to live: B04–B09, B01–B03 cached',
  `  design                    ${MODE_DESIGN_NOTE}`,
  '',
  '  --register project|local|user   where the MCP server is registered (default: unchanged)',
  '  --ack-user-scope          required by --register user; it affects every project',
  '  --instance-file <path>    read live-mode connection details from a file, once',
  '  --yes                     do not prompt (live needs --instance-file with it)',
  '  --json                    print the result object on stdout',
].join('\n');

/** The refusal, verbatim from the story: user scope is a firewall decision, not a convenience. */
export const USER_SCOPE_REFUSAL =
  'user scope attaches the "servicenow" server to every project on this machine, against the '
  + 'engagement firewall — prefer --register local. Re-run with --ack-user-scope to proceed.';

/** The same sentence with the configured key, for a checkout that renamed the server. */
export const userScopeRefusal = (serverKey) =>
  USER_SCOPE_REFUSAL.replace('"servicenow"', `"${serverKey}"`);

/**
 * ARC-07-C31 — the spelling is REQUIRED, and the argument is the point rather than the check.
 *
 * This was a `const` passed straight to `refuse()`. Turning it into a function with a default would
 * leave `refuse(NOT_BOOTSTRAPPED, …)` compiling and printing the function's SOURCE — the defect this
 * programme shipped once already, in the SessionStart hook's `Mode:` line. A required argument makes
 * every call site say what shell it means, and `needSpell` turns the miss into a named TypeError
 * instead of `undefined` in a sentence whose whole job is to tell someone what to type.
 */
export const NOT_BOOTSTRAPPED = (spell) =>
  'this checkout has not been bootstrapped — run '
  + `${needSpell(spell, 'NOT_BOOTSTRAPPED').bootstrap} first (mode switches an existing `
  + 'installation; it does not create one)';

// ARC-07-C43 head 2 — `local-paths.mjs` owns it; re-exported for this module's importers.
export const storePath = storePathOf;

/** The label only. Never the store's contents: this file names an instance, it does not open it. */
export function defaultLabel(root, read = readDefaultLabel) {
  const p = storePath(root);
  if (!existsSync(p)) return null;
  return read(p)?.label ?? null;
}

/**
 * The steps each form runs.
 *
 * `live` is the whole registry: B00 is a preflight that always runs, and B01–B03 report
 * `ok (cached)` because their recorded inputs have not changed — which is the runner's own
 * behaviour, not a list maintained here. `design` is two steps and no network: the toggle, and the
 * summary that tells the user what just happened.
 */
export const DESIGN_STEPS = Object.freeze(['B07', 'B09']);

/**
 * The list, from the registry — the one thing this command actually decides.
 *
 * `registry` is a parameter so a test can drive the run with stub steps and still assert THIS
 * function against the real `STEPS`. The alternative — an end-to-end `mode live` in a unit test —
 * would run `npm ci`, a wizard and a handshake to prove a list, and S14's integration suite is
 * where those belong.
 */
export function stepsFor(target, registry = STEPS) {
  return target === 'live'
    ? registry.slice(1)                                   // B00 has already run as the preflight
    : registry.filter((s) => DESIGN_STEPS.includes(s.id));
}

export async function modeCommand({ flags = {}, positional = [], log, root = defaultRoot,
  // ARC-07-C31 — `platform` beside the `env` that was already here, because `isWindowsShell` needs
  // both: `env` alone would read this machine's SHELL and render POSIX on a Windows cell.
  env = process.env, platform = process.platform,
  out = process.stdout, err = process.stderr, cwd = process.cwd(),
  probe = undefined, exec = undefined, execClaude = undefined, claudePath = undefined,
  // `hash` travels WITH `registry`, and only with it: the runner hashes a step from ARC-09-S05's
  // table by step id, so a test that injects stub steps must also say how those are hashed. The
  // product passes neither and gets the real registry and the real table.
  readLabel = readDefaultLabel, registry = STEPS, hash = undefined } = {}) {
  const config = loadConfig(root);
  const serverKey = config.mcp.serverKey;
  const refuse = (message, code = EXIT_USAGE) => { log.fail(message); return code; };

  const target = positional[0];
  if (target !== undefined && target !== 'live' && target !== 'design') {
    return refuse(`mode takes live or design, not "${target}"`);
  }
  if (flags.register !== undefined && !SCOPES.includes(flags.register)) {
    return refuse(`--register must be ${SCOPES.join(', ')}, not "${flags.register}"`);
  }
  // Checked before anything is read or written, like S03's equivalent: a refusal must leave the
  // checkout as it found it.
  if (flags.register === 'user' && !flags['ack-user-scope']) {
    return refuse(userScopeRefusal(serverKey));
  }

  let state;
  try { state = loadState(root, spellings({ platform, env })); } catch (e) {
    if (!(e instanceof StateError)) throw e;
    return refuse(e.message, e.code);
  }
  if (!state) return refuse(NOT_BOOTSTRAPPED(spellings({ platform, env })), EXIT_PREREQ);

  if (target === undefined) return report({ state, root, flags, log, readLabel });

  const wantsLive = target === 'live';
  const hasStore = existsSync(storePath(root));
  // Criterion 7. The same sentence S03 prints, imported rather than repeated: there is one reason
  // this combination cannot work and it should not have two phrasings.
  if (liveYesNeedsInstanceFile({ mode: wantsLive ? 'live' : 'design', yes: flags.yes,
    instanceFile: flags['instance-file'], hasStore })) {
    return refuse(LIVE_YES_WITHOUT_FILE);
  }
  if (flags['instance-file']) {
    const path = flags['instance-file'];
    if (!existsSync(path)) return refuse(`${path} does not exist`);
    const mode = checkMode(path);
    if (!mode.ok) return refuse(mode.reason, EXIT_FAIL);
    const location = checkLocation(path, root);
    if (!location.ok) return refuse(location.reason, EXIT_FAIL);
  }

  // The registration is settled BEFORE the steps run, because B07 writes the toggles from
  // `state.registration`: a local registration made after B07 would leave the project entry
  // enabled and both would load.
  // ARC-06-C14 — what to put back if the switch this registration was FOR does not happen.
  //
  // Captured before the change and not after it, because `changeRegistration` overwrites both
  // fields and the previous scope is then unrecoverable from the state.
  let undoRegistration = null;
  if (flags.register !== undefined) {
    const before = { registration: state.registration ?? 'project',
      registrationReason: state.registrationReason ?? 'default' };
    const changed = await changeRegistration({
      root, serverKey, scope: flags.register, state, log,
      exec: execClaude, env, claudePath, config,
    });
    if (!changed.ok) return refuse(changed.reason, changed.code ?? EXIT_FAIL);
    // Saved HERE, not with the rest of the run.
    //
    // `~/.claude.json` has already changed. If B00 then fails — no network, Node gone — a state
    // file that still said `project` would disown an entry this tool had just created, and the
    // undo (`--register project`) refuses to remove what it does not own. The orphan would
    // outlive the failure, and only `claude mcp get` would ever mention it.
    saveState(root, state);
    // Only a change that CREATED an entry can be rolled back. `--register project` removes one and
    // creates nothing, and `already local — nothing to change` touched neither file.
    if (changed.changed && state.registration !== 'project') undoRegistration = before;
  }

  // ARC-06 (Sitting A) — DESIGN-ONLY MUST BE TRUE OF THE MACHINE, not just of our own toggles.
  //
  // `disabledMcpjsonServers` governs `.mcp.json` entries and nothing else. A user- or local-scope
  // entry lives in `~/.claude.json`, outside that toggle, so `mode design` used to print
  // "Mode: design-only" while `/mcp` still showed `servicenow ✔ connected · 5 tools` under User
  // MCPs — in every project on the machine. The line asserted a state it had not checked.
  if (!wantsLive && flags.register === undefined
      && state.registration && state.registration !== 'project') {
    const settled = await releaseScopedRegistration({
      root, serverKey, state, log, exec: execClaude, env, claudePath,
    });
    if (!settled.ok) return refuse(settled.reason, settled.code ?? EXIT_FAIL);
    if (settled.changed) saveState(root, state);
  }

  const node = { present: true, version: process.versions.node,
    major: Number(process.versions.node.split('.')[0]) };
  const mode = wantsLive ? 'live' : 'design-only';
  const ctx = {
    root, config, env, node,
    // The docs decision is the one already recorded. `mode live` is not a docs command, and
    // passing anything else here would make B02 re-sync a corpus nobody asked about.
    docs: state.docs?.mode ?? 'skip',
    areaCount: 0,
    instanceFile: flags['instance-file'] ?? null,
    skipClaudeCheck: Boolean(flags['skip-claude-check']),
    mode,
    state,
    ...(readLabel === readDefaultLabel ? {} : { readLabel }),
  };
  // ARC-06-C7 — the REQUESTED mode is not recorded here. It used to be set before a single step
  // ran and then persisted by the `saveState` below whatever the outcome, so a live switch that
  // failed at B06 left `mode: live` recorded while B07 had never written the toggles: `./snowarch
  // mode` said live, `settings.local.json` still disabled the server, and the doctor reported
  // `E-10 FAIL … mode is live but servicenow is disabled`. The mode is now written by B07, the step
  // that makes it true, so an interrupted switch leaves the previous mode and E-10 stays green.
  // The steps are unaffected: they select on `ctx.mode` (the request), never on `state.mode`.
  state.node = node;
  state.engineVersion = version(root);

  const lines = [];
  const onLine = (line) => { lines.push(line); log.step(line); };
  const live = { child: null, step: null };

  // ARC-06-C14. One definition for the two ways a switch can fail after the entry was written —
  // the preflight's early return and a stopped run — because the second was added to this function
  // long after the first, and a rollback that covered only one exit would be the half-fix that
  // reads as done. A no-op when nothing was registered, so both call sites are unconditional.
  const undo = () => (undoRegistration
    ? rollbackRegistration({ root, serverKey, state, log, exec: execClaude, env, claudePath,
      before: undoRegistration })
    : Promise.resolve({ ok: true, changed: false }));

  if (wantsLive) {
    // B00 first and alone, exactly as `bootstrap` runs it: a machine that cannot reach github.com
    // or has lost Node must not be told it is now live.
    const preflight = await runSteps({
      root, ctx: { ...ctx, cwd, probe, exec }, state, steps: [registry[0]], last: LAST, onLine,
      save: () => {}, ...(hash ? { hash } : {}),
    });
    if (preflight.code !== EXIT_OK) {
      // ARC-06-C14. The earliest of the two ways out after the entry exists, and the one the
      // `saveState` comment above names by hand: "if B00 then fails — no network, Node gone".
      await undo();
      saveState(root, state);
      return preflight.code;
    }
  }

  const onSigint = () => {
    const r = interrupt({ root, state, live, onLine });
    process.exit(r.code);
  };
  process.on('SIGINT', onSigint);
  let outcome;
  try {
    outcome = await runSteps({
      root, ctx: { ...ctx, cwd, probe, exec }, state, live, last: LAST, onLine,
      steps: stepsFor(target, registry), ...(hash ? { hash } : {}),
    });
  } finally {
    process.off('SIGINT', onSigint);
  }
  // ARC-06-C14 — BEFORE the state is saved and before the closing block is built, so the record
  // and the sentence both describe the machine as it is being left. `stoppedAt` is the switch not
  // happening: B07 writes the mode, so a run that stopped short never became live.
  if (outcome.code !== EXIT_OK) await undo();
  saveState(root, state);

  const closing = closingBlock({ outcome, state, root, serverKey, wantsLive, env, readLabel });
  if (flags.json) {
    log.json({
      mode: state.mode,
      registration: state.registration,
      steps: state.steps,
      summary: { ok: outcome.summary.ok, warn: outcome.summary.warn,
        fail: outcome.summary.fail, skipped: outcome.summary.skipped },
      next: closing,
    });
  } else {
    for (const line of closing.split('\n')) log.step(line);
  }
  return outcome.code === EXIT_OK ? EXIT_OK : EXIT_FAIL;
}

/**
 * What the run ends with: B09's block, plus the one sentence that is specific to a mode SWITCH.
 *
 * A fresh install ends with "run `claude` in this folder: <root>"; a switch ends with "restart the one you have
 * open", because the session that is already running has read its MCP configuration and nothing
 * this command did reached it.
 */
export function closingBlock({ outcome, state, root, serverKey, wantsLive, env,
  readLabel = readDefaultLabel }) {
  const parts = [];
  if (outcome.stoppedAt) {
    return `stopped at ${outcome.stoppedAt} — fix the cause above and re-run`;
  }
  if (outcome.next) parts.push(outcome.next);
  if (!wantsLive) parts.push(instanceKeptNote({ label: defaultLabel(root, readLabel), env }));
  parts.push(restartSentence(serverKey, wantsLive ? 'live' : 'design-only'));
  return parts.join('\n');
}

/** `mode` with no argument: two lines, or the object. Reads the state; writes nothing. */
function report({ state, root, flags, log, readLabel }) {
  const label = defaultLabel(root, readLabel);
  // ARC-06-C15 — one resolver, shared with B09. This used to fall back to the string `unknown`
  // for environment and preset, and those fallbacks fired on EVERY live checkout because nothing
  // in the tree wrote the two places it read. `mode` still does not open the store: it reports
  // what the install recorded.
  const recorded = recordedInstance(state);
  const instance = state.mode === 'live' && (recorded || label)
    ? { label: recorded?.label ?? label,
      environment: recorded?.environment ?? 'unknown',
      preset: recorded?.preset ?? 'unknown' }
    : null;
  const line = modeLine({ mode: state.mode, instance });
  if (flags.json) {
    log.json({
      mode: state.mode,
      modeLine: line,
      registration: state.registration,
      registrationLine: registrationLine(state.registration),
      defaultInstance: label,
    });
    return EXIT_OK;
  }
  log.step(line);
  log.step(registrationLine(state.registration));
  return EXIT_OK;
}


/**
 * Switching to design-only: let go of a user- or local-scope entry, or say plainly that we cannot.
 *
 * Sitting A's sequence: `mode live --register user --ack-user-scope`, then `mode design`. The mode
 * line said design-only and `/mcp` still listed the server, connected, under User MCPs — because
 * the toggles B07 writes only reach `.mcp.json`.
 *
 * The rule from `changeRegistration` is kept: a tool that deletes configuration it did not create
 * is a tool nobody runs twice. So an entry WE made is removed, and one we did not is reported in
 * full with the command — and in that case the recorded registration is LEFT ALONE, because
 * calling it `project` while a user entry is still loading the server would be the same false
 * claim one layer down.
 */
export async function releaseScopedRegistration({ root, serverKey, state, log, exec, env,
  claudePath = undefined }) {
  const scope = state.registration;
  const ownedByUs = state.registrationReason === CREATED_BY_US;
  const path = claudePath === undefined ? resolveClaude({ env }) : claudePath;
  const removed = unregister({ root, claudePath: path, env, ...(exec ? { exec } : {}),
    serverKey, scope, ownedByUs });

  if (!removed.ok && !removed.skipped) return { ok: false, reason: removed.reason };

  if (removed.skipped) {
    log.warn(`a ${scope}-scope ${serverKey} entry keeps the server loaded${scope === 'user' ? ' in every project' : ''}`
      + ` — design-only is NOT in force; remove it with: claude mcp remove ${serverKey} -s ${scope}`);
    return { ok: true, changed: false };
  }

  state.registration = 'project';
  state.registrationReason = 'default';
  log.step(`registration: removed the ${scope}-scope entry — design-only does not reach `
    + `${scope === 'user' ? '~/.claude.json' : 'local scope'} through the toggles`);
  return { ok: true, changed: true };
}

/**
 * Put the registration back when the switch it was made for did not happen.
 *
 * ARC-06-C14. The owner ran `./snowarch mode live --register local` on rc.4; B06 stopped with
 * "needs a label", the mode stayed design-only — and the local-scope entry, written before the
 * steps by design, stayed too. The next `./snowarch doctor` said `E-27 FAIL … design-only is not
 * in force: a local-scope entry keeps the server loaded`. The doctor was right, and the entry was
 * correctly recorded as ours; what was missing is that a command which did not do the thing it
 * announced left a machine-level change behind for the user to undo by hand.
 *
 * NOT a reordering. `mode.mjs` settles the registration before the steps on purpose — B07 writes
 * the toggles from `state.registration`, and an entry made after B07 leaves the project entry
 * enabled so both load. That constraint stands; this is the other half of it, which the comment
 * above `saveState` had already reasoned towards: the state is saved so the entry is OWNED, and
 * ownership is what makes this removal possible at all.
 *
 * Its own sentence, sharing `unregister` with the two callers above rather than their wording: a
 * rollback is not a switch to design-only, and `releaseScopedRegistration`'s line — "design-only
 * does not reach ~/.claude.json through the toggles" — would be a true sentence about the wrong
 * event.
 */
export async function rollbackRegistration({ root, serverKey, state, log, exec, env,
  claudePath = undefined, before }) {
  const scope = state.registration;
  if (!before || !scope || scope === 'project') return { ok: true, changed: false };

  const path = claudePath === undefined ? resolveClaude({ env }) : claudePath;
  const removed = unregister({ root, claudePath: path, env, ...(exec ? { exec } : {}),
    serverKey, scope, ownedByUs: state.registrationReason === CREATED_BY_US });

  // A rollback that cannot complete must SAY so and leave the record accurate. Rewriting the state
  // to `before` while the entry is still on the machine would be the disowning this file already
  // refuses elsewhere — and the next doctor would have nothing left to find it by.
  if (!removed.ok) {
    log.warn(`the ${scope}-scope "${serverKey}" entry could not be removed after the switch failed`
      + ` — it still loads the server; remove it with: claude mcp remove ${serverKey} -s ${scope}`);
    return { ok: false, changed: false };
  }

  state.registration = before.registration;
  state.registrationReason = before.registrationReason;
  log.step(`registration: rolled back to ${before.registration} — the ${scope}-scope entry was `
    + 'removed because the mode switch it was made for did not complete');
  return { ok: true, changed: true };
}

/**
 * Add or remove the `~/.claude.json` entry, and record what happened in the state.
 *
 * `--register project` is the undo, and it removes ONLY an entry this tool created — the state's
 * `registrationReason` is the proof. An entry from an older install, or one the user made by
 * hand, is left alone with the command printed: ARC-08-S03 is where leftovers are reported, and a
 * tool that deletes configuration it did not create is a tool nobody runs twice.
 */
export async function changeRegistration({ root, serverKey, scope, state, log, exec, env,
  claudePath = undefined, config }) {
  const previous = state.registration ?? 'project';
  const ownedByUs = state.registrationReason === CREATED_BY_US;
  const path = claudePath === undefined ? resolveClaude({ env }) : claudePath;
  const opts = { root, claudePath: path, env, ...(exec ? { exec } : {}) };

  if (scope === previous && scope !== 'project') {
    log.step(`registration: already ${scope} — nothing to change`);
    return { ok: true, changed: false };
  }

  if (scope === 'project') {
    if (previous === 'project') {
      log.step('registration: already project (.mcp.json) — nothing to change');
      return { ok: true, changed: false };
    }
    const removed = unregister({ ...opts, serverKey, scope: previous, ownedByUs });
    if (!removed.ok && !removed.skipped) return { ok: false, reason: removed.reason };
    // A skipped removal is not a failure: the user asked to go back to the project entry, and the
    // toggles below do exactly that. The entry we refused to touch is named in the note.
    if (removed.skipped) log.warn(removed.reason);
    state.registration = 'project';
    state.registrationReason = 'default';
    log.step(`registration: project (.mcp.json)${removed.skipped ? '' : ` — removed the ${previous}-scope entry`}`);
    return { ok: true, changed: true };
  }

  let entry;
  try { entry = serverEntry(root, serverKey); } catch (e) { return { ok: false, reason: e.message }; }
  const result = registerServer({ ...opts, serverKey, scope, entry });
  if (!result.ok) return { ok: false, reason: result.reason };
  state.registration = scope;
  state.registrationReason = CREATED_BY_US;
  log.step(`registration: ${scope} — "${serverKey}" registered with claude mcp add-json -s ${scope}`);
  return { ok: true, changed: true, entry: result.entry };
}
