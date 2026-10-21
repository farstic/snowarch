// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-06-S05 — the two toggles, merged into the operator's own file and never over it.
//
// `.claude/settings.local.json` belongs to the user. It carries their permission grants, their
// personal overrides, whatever Claude Code has written there on their behalf — and the bootstrap's
// business with it is exactly two array members and one hook entry. So this reads, computes a
// target, and writes back the SAME OBJECT with those changes applied: other keys untouched, other
// array members preserved, existing key order kept, new keys appended.
//
// Exported because ARC-08's `--fix` and ARC-06-S12's `mode` both need to write the same file the
// same way. A second writer would be a second opinion about what "the toggles" are.
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const SETTINGS_LOCAL = join('.claude', 'settings.local.json');

export const INVALID_JSON =
  '.claude/settings.local.json is not valid JSON — fix or move the file, then re-run '
  + '(nothing was changed)';
export const NOT_IGNORED =
  '.claude/settings.local.json is not gitignored — add it to .gitignore (it must stay untracked '
  + 'so Claude Code applies its approvals)';

/** The SessionStart hook, S-05 variant B: it lives in the LOCAL file, and only when Node can run it. */
export const hookEntry = () => ({
  SessionStart: [{
    matcher: 'startup|resume',
    hooks: [{
      type: 'command',
      command: 'node ${CLAUDE_PROJECT_DIR}/tools/snowarch/hooks/session-start.mjs',
      timeout: 10,
    }],
  }],
});

/**
 * ARC-09-C193 — which SessionStart hook is ours: one whose script is a `session-start.mjs` inside a `tools/snowarch/`
 * folder, any folder before it, either separator. ONE definition with two readers: this writer, and the doctor's
 * E-08 (`sessionStartProblems`). A copy carried from another install's folder (ARC-09-C192), or a script elsewhere
 * in our tree (ARC-11-C10), is ours to replace, and E-08 reports it as a hook at a wrong path; any other hook is the
 * user's and stays, a script of theirs that is also called `session-start.mjs` included.
 */
const OUR_SESSION_START = /(?:^|[\s"'/\\])tools[/\\]snowarch[/\\](?:[^\s"']*[/\\])?session-start\.mjs(?:$|[\s"'])/;
export const isOurSessionStartHook = (hook) => OUR_SESSION_START.test(String(hook?.command ?? ''));

/** The SessionStart groups with our hook taken out of each; a group that held only ours is dropped. */
function withoutOurSessionStart(groups) {
  return (Array.isArray(groups) ? groups : [])
    .map((g) => (Array.isArray(g?.hooks) ? { ...g, hooks: g.hooks.filter((h) => !isOurSessionStartHook(h)) } : g))
    .filter((g) => !Array.isArray(g?.hooks) || g.hooks.length > 0);
}

/**
 * S-05 variant B, stated as a sentence because a step has to print it.
 *
 * No bootstrap and no `mode` run ever writes `disableAllHooks` — the state's
 * `hooksDisabledByBootstrap` is therefore always false, and a key that IS there was put there by
 * the user or by Claude Code. It stays. What changes is that the user is told, because from their
 * side "the banner never appears" and "the toggle I set two months ago" are the same event.
 */
export const HOOKS_LEFT_ALONE =
  'note: disableAllHooks is set in .claude/settings.local.json — the SessionStart banner will not '
  + 'run; this installation did not set it and has left it alone';

const without = (list, value) => (Array.isArray(list) ? list.filter((v) => v !== value) : []);
const withValue = (list, value) => (Array.isArray(list) && list.includes(value)
  ? list
  : [...(Array.isArray(list) ? list : []), value]);

/**
 * The target object, computed from the current one.
 *
 * Pure, and exported for the tests: every merge case is a question about this function, and
 * answering it through the filesystem would make the tests slower and the failures vaguer.
 */
/**
 * Is the `.mcp.json` PROJECT entry the one that should be loading?
 *
 * ONE definition with two readers — this writer, and the doctor's E-10 check. They were separate
 * before: the writer knew that a `local` or `user` registration carries the server itself and so
 * the project entry must stay disabled, and the check knew only `mode === 'live'`. On a live
 * checkout registered `local` the writer wrote DISABLED, correctly, and the check then called that
 * a failure — ARC-08-C15. A rule stated twice is a rule that gets to disagree with itself.
 */
export const projectEntryCarries = (registration) => registration === 'project';

export const projectEntryEnabled = ({ mode, registration }) =>
  mode === 'live' && projectEntryCarries(registration);

export function computeSettings(current, { mode, nodePresent, registration, serverKey,
  removeDisableAllHooks = false }) {
  const next = { ...current };
  const live = projectEntryEnabled({ mode, registration });

  // `disabledMcpjsonServers` wins over `enabledMcpjsonServers` in Claude Code, so design-only is
  // expressed by the disable list and live by its absence. A registration that is not `project`
  // rejects the project entry regardless of mode: the local or user entry carries the same key,
  // and S12 verifies that coexistence.
  if (live) {
    next.enabledMcpjsonServers = withValue(current.enabledMcpjsonServers, serverKey);
    const disabled = without(current.disabledMcpjsonServers, serverKey);
    if (disabled.length > 0) next.disabledMcpjsonServers = disabled;
    else delete next.disabledMcpjsonServers;
  } else {
    next.disabledMcpjsonServers = withValue(current.disabledMcpjsonServers, serverKey);
    const enabled = without(current.enabledMcpjsonServers, serverKey);
    if (enabled.length > 0) next.enabledMcpjsonServers = enabled;
    else if ('enabledMcpjsonServers' in current) delete next.enabledMcpjsonServers;
  }

  // Variant B, and the whole reason the committed `settings.json` is hook-free: a SessionStart hook
  // that runs `node` on a machine without Node prints an error on every session start. Present iff
  // Node is, and REMOVED when it is not — an installation that loses Node must not keep a hook that
  // now fails.
  // ARC-08-S06's F6: the ONLY case in which this writer removes `disableAllHooks` is when the
  // caller has read `bootstrap-state.hooksDisabledByBootstrap === true` — i.e. WE set it, on a
  // machine that then had no Node. Variant B never sets it, so this arm is unreachable through
  // our own writes and exists for a state file written by an older build. A key the user set is
  // theirs, and is left alone.
  if (removeDisableAllHooks) delete next.disableAllHooks;

  // ARC-09-C193 — OURS REPLACED, THE USER'S KEPT. `Object.assign(hooks, hookEntry())` replaced the whole key, so a
  // user's own SessionStart hook was lost at every bootstrap and upgrade, and with Node absent every SessionStart hook
  // was deleted. Our hook is taken out of each group, a group it leaves empty is dropped, and ours is written once.
  const hooks = { ...(current.hooks ?? {}) };
  const theirs = withoutOurSessionStart(hooks.SessionStart);
  const sessionStart = nodePresent ? [...theirs, ...hookEntry().SessionStart] : theirs;
  if (sessionStart.length > 0) hooks.SessionStart = sessionStart;
  else delete hooks.SessionStart;
  if (Object.keys(hooks).length > 0) next.hooks = hooks;
  else if ('hooks' in current) delete next.hooks;

  return next;
}

/** `git check-ignore -q` — the file must be untracked, or Claude Code will not apply its approvals. */
export function isIgnored(root, relative = SETTINGS_LOCAL, env = process.env) {
  try {
    // The user's GLOBAL excludes count, deliberately: if their `~/.gitignore` covers this path then
    // the file really is untracked and the guard has nothing to complain about. `env` is a seam so
    // a test can neutralise that global file — otherwise the fixture's precondition depends on
    // whose machine it runs on, which is not a precondition at all.
    execFileSync('git', ['check-ignore', '-q', '--', relative],
      { cwd: root, stdio: 'ignore', env });
    return true;
  } catch { return false; }
}

/**
 * 2-space JSON with a trailing newline, written through a temp file so a crash cannot truncate it.
 *
 * `mode` is applied to the TEMP file, before the rename: setting it afterwards would leave a
 * window in which the finished file is world-readable, which for `.local/doctor-last.json` is the
 * whole point of asking for 0600.
 */
export function writeJsonAtomic(path, value, { mode = null } = {}) {
  const tmp = `${path}.tmp-${process.pid}`;
  try {
    writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, mode === null ? undefined : { mode });
    if (mode !== null && process.platform !== 'win32') chmodSync(tmp, mode);
    renameSync(tmp, path);
  } catch (e) {
    rmSync(tmp, { force: true });
    throw e;
  }
}

/**
 * Read, merge, write. Idempotent: the second run produces the same bytes as the first.
 *
 * Returns what happened rather than printing it — B07 owns the console, ARC-08's `--fix` owns its
 * own report, and a function that printed would have to be silenced by one of them.
 */
export function applyToggles({ root, mode, nodePresent, registration = 'project', serverKey,
  removeDisableAllHooks = false, check = isIgnored }) {
  const path = join(root, SETTINGS_LOCAL);
  const before = existsSync(path) ? readFileSync(path, 'utf8') : null;

  let current = {};
  if (before !== null) {
    try { current = JSON.parse(before); } catch {
      // The bytes are not touched. This is the only failure mode, and the file is never
      // overwritten wholesale — someone's permission grants are not collateral for a stray comma.
      return { ok: false, reason: INVALID_JSON, changed: false };
    }
    if (current === null || typeof current !== 'object' || Array.isArray(current)) {
      return { ok: false, reason: INVALID_JSON, changed: false };
    }
  }

  if (!check(root)) return { ok: false, reason: NOT_IGNORED, changed: false };

  const next = computeSettings(current, { mode, nodePresent, registration, serverKey,
    removeDisableAllHooks });
  // Reported, never acted on. The caller prints the note; deciding here would make this function
  // both a writer and a narrator, and B07 already owns the console.
  const userDisabledHooks = current.disableAllHooks === true;
  const text = `${JSON.stringify(next, null, 2)}\n`;
  if (before === text) return { ok: true, changed: false, settings: next, userDisabledHooks };
  writeJsonAtomic(path, next);
  return { ok: true, changed: true, settings: next, userDisabledHooks };
}
