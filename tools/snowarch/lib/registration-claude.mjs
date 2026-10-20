// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-06-S12 — the only place this project runs `claude mcp`.
//
// `~/.claude.json` is Claude Code's file. This project never opens it: every read and every write
// goes through the CLI that owns it, so an upgrade that changes the file's shape is not our
// problem, and a bug of ours cannot corrupt someone's whole Claude installation. A test asserts
// that no module under `lib/` mentions that path.
//
// Three commands, verified on the CLI this was written against (2.1.258, 2026-09-09):
//
//   claude mcp add-json [-s local|user|project] <name> <json>   -s defaults to local
//   claude mcp get <name>                                        no scope flag; searches all
//   claude mcp remove [-s local|user|project] <name>             WITHOUT -s it removes from
//                                                                whichever scope it finds — which
//                                                                is why every call here passes it
//
// That last one is the reason this module exists rather than three `spawnSync` calls spread
// through `mode.mjs`: a `remove` that forgot `-s local` would happily delete the PROJECT entry,
// which is committed and belongs to everyone who cloned the repository.
import { spawnSync } from 'node:child_process';
import { batchCommand } from './spawn-batch.mjs';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { childEnv } from './spawn-env.mjs';
import { which } from './which.mjs';

export const SCOPES = Object.freeze(['project', 'local', 'user']);

/** The state's record of who created the registration. Only an entry we made may be removed. */
export const CREATED_BY_US = 'created-by-snowarch';

export const CLAUDE_ABSENT =
  'claude is not on PATH — --register needs the Claude Code CLI to write its own configuration '
  + '(install it from https://code.claude.com/docs/en/setup, then re-run)';

/** R-13: the flags could be renamed upstream. This is what that failure should read like. */
export const flagsChanged = (command, version) =>
  `claude mcp ${command} did not recognise its flags on Claude Code ${version ?? 'unknown'} — `
  + 'the CLI\'s flag spelling has changed; see docs/TROUBLESHOOTING.md "registration: local/user"';

/**
 * A `.cmd`/`.bat` shim's real entry point, read out of the shim.
 *
 * `claude` installed from npm on Windows IS `claude.cmd`, and since the CVE-2024-27980 fix
 * (Node 20.12 / 21.7) `child_process` refuses to spawn a `.cmd` without a shell — so every
 * `claude mcp` call on such a machine failed with EINVAL: the S-03 fallback registration,
 * `mode live`, and the doctor's E-27. A shell is what this module does not use, and here it would
 * be actively wrong: `add-json` passes a JSON document as ONE argument, and `shell: true` on
 * Windows joins arguments with spaces without quoting them, so the payload would arrive shredded.
 *
 * The repository's rule for this is B04's, and it is applied rather than re-invented: resolve the
 * shim's own entry point and run it with `process.execPath`. npm's generated shim names that entry
 * as a `%~dp0`-relative `.js` path, so it is read out of the shim rather than guessed from a
 * package name — a package name written here would be a second declaration of what `claude` is.
 */
export function shimTarget(file, { read = readFileSync, exists = existsSync } = {}) {
  let text;
  try { text = String(read(file, 'utf8')); } catch { return null; }
  const dir = dirname(file);
  // `%~dp0` is the shim's own directory; both slash styles appear in the wild, and the path may be
  // quoted or bare. Anything that does not resolve to a file beside the shim is not a target.
  for (const m of text.matchAll(/%~dp0[\\/]?([^"'\s%]+\.[cm]?js)/gi)) {
    const candidate = resolve(dir, m[1].split('\\').join('/'));
    if (exists(candidate)) return candidate;
  }
  // A shim that names an absolute path instead (some installers write one).
  for (const m of text.matchAll(/"([A-Za-z]:[^"]+\.[cm]?js)"/g)) {
    if (isAbsolute(m[1]) && exists(m[1])) return m[1];
  }
  return null;
}

export const isShim = (file) => /\.(cmd|bat)$/i.test(String(file));

/**
 * `spawnSync`, not `execFile`: no shell either way, but this one hands back an exit code instead
 * of throwing, and every call site here has to distinguish "the CLI said no" from "the CLI is not
 * there". `exec` is a seam so the tests can drive a recorded argv rather than a real installation.
 *
 * A `.cmd` shim is redirected to its own entry point under THIS Node (see `shimTarget`); a shim
 * whose target cannot be found is refused with a sentence rather than spawned, because the spawn
 * would fail with an errno nobody can act on.
 */
export const spawnClaude = (file, args, options,
  { spawn = spawnSync, target = shimTarget } = {}) => {
  if (!isShim(file)) return spawn(file, args, { encoding: 'utf8', ...options });

  /*
   * A SHIM IS READ FIRST AND RUN SECOND — ARC-09-C72, and the order is the whole of the fix.
   *
   * READ FIRST, because resolving the shim's own `.js` entry and running it under THIS Node passes every
   * argument through untouched. `add-json` hands over a JSON document as ONE argument, and no command
   * processor is involved in that path, so nothing can reshape it.
   *
   * RUN SECOND, which is new. The refusal used to be unconditional: a shim whose entry point could not be
   * parsed was never spawned at all, and E-27 reported
   *
   *     could not read registration status: …\claude.CMD is a command shim whose entry point could not
   *     be read — run claude once by hand, or reinstall Claude Code
   *
   * on a machine where B00 had just run `claude --version` successfully and Claude Code was connected
   * with 397 tools. Claude Code 2.1.282's shim simply does not carry the `%~dp0…js` shape the reader
   * looks for. "I could not parse your launcher" is a fact about our reader; "reinstall Claude Code" is
   * advice to a user whose installation is fine. So the fallback is what B00 already does for `npm.cmd`:
   * hand the command processor one quoted line, and let Windows resolve the shim the way it knows how.
   *
   * THE REFUSAL SURVIVES for the case it was written for — a shim that can be neither parsed nor run —
   * because "we cannot start this" is still worth saying plainly rather than as an errno.
   */
  const entry = target(file);
  if (entry) return spawn(process.execPath, [entry, ...args], { encoding: 'utf8', ...options });

  let call;
  try {
    call = batchCommand(file, args, { env: options?.env ?? process.env });
  } catch (e) {
    // `batchCommand` refuses an argument cmd would rewrite — a `%`, which it expands even inside
    // quotes. Naming that is better than sending a corrupted command and reporting what came back.
    return { status: null, stdout: '', stderr: `${SHIM_UNRESOLVED(file)} (and ${e.message})`,
      error: e };
  }
  const r = spawn(call.file, call.args, { encoding: 'utf8', ...options, ...call.options });
  // Only a spawn that did not happen falls back to the sentence. A shim that RAN and said no has its
  // own words, and `run()` above prefers those to anything we could write.
  if (r?.error) {
    return { status: null, stdout: '', stderr: SHIM_UNRESOLVED(file), error: r.error };
  }
  return r;
};

/** What a `.cmd` shim with no readable entry point reads like. Never a raw EINVAL. */
export const SHIM_UNRESOLVED = (file) =>
  `${file} is a command shim whose entry point could not be read — run claude once by hand, or `
  + 'reinstall Claude Code (a .cmd cannot be started directly since Node 20.12)';

/** The absolute path of the `claude` executable, or null. Never a bare name — S04's rule. */
export const resolveClaude = ({ env = process.env, platform = process.platform } = {}) =>
  which('claude', { env, platform });

/** The CLI's version, for the flags-changed message. Best effort: an unknown version still reports. */
export function claudeVersion({ claudePath, exec = spawnClaude } = {}) {
  if (!claudePath) return null;
  const r = exec(claudePath, ['--version'], {});
  const m = /(\d+\.\d+\.\d+)/.exec(String(r?.stdout ?? ''));
  return m ? m[1] : null;
}

/**
 * The `.mcp.json` entry for the server, VERBATIM — placeholders and all.
 *
 * `${CLAUDE_PROJECT_DIR:-.}` must reach `~/.claude.json` unexpanded: a local entry resolved to an
 * absolute path at registration time would break the moment the checkout moved, and the whole
 * point of the local scope is that it is a per-machine fallback for the same server, not a
 * different one. Criterion 4 reads the value back out of `claude mcp get` and checks exactly this.
 */
export function serverEntry(root, serverKey) {
  const mcp = JSON.parse(readFileSync(join(root, '.mcp.json'), 'utf8'));
  const entry = mcp?.mcpServers?.[serverKey];
  if (!entry) throw new Error(`.mcp.json has no "${serverKey}" server to register`);
  return entry;
}

/**
 * `claude mcp get` output, as data. Exported for ARC-08-S03's leftover detectors: it needs to
 * recognise entries this tool did not create, and a second parser would disagree with this one.
 *
 * Shape as of 2.1.258:
 *
 *   servicenow:
 *     Scope: Project config (shared via .mcp.json)
 *     Status: ⏸ Pending approval (run `claude` to approve)
 *     Type: stdio
 *     Command: node
 *     Args: ${CLAUDE_PROJECT_DIR:-.}/packages/snowarch/dist/server.js
 *     Environment:
 *       SNOW_STORE=${SNOW_STORE:-}
 *     Timeout: 600000ms
 *
 *   To remove this server, run: claude mcp remove servicenow -s project
 *
 * The scope is read from that last line first and the `Scope:` prose second. The prose is written
 * for a human ("Project config (shared via .mcp.json)") and could be reworded in any release; the
 * remove hint has to keep working as a command, so it is the more durable of the two.
 */
export function parseGet(text) {
  const raw = String(text ?? '');
  const out = { found: false, name: null, scope: null, status: null, type: null,
    command: null, args: null, env: {}, raw };
  if (raw.trim() === '' || /^No MCP server named/m.test(raw)) return out;

  const lines = raw.split('\n');
  const nameLine = lines.find((l) => /^\S[^\s:]*:\s*$/.test(l));
  if (!nameLine) return out;
  out.found = true;
  out.name = nameLine.trim().replace(/:$/, '');

  let inEnv = false;
  for (const line of lines) {
    const env = /^ {4}([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
    if (inEnv && env) { out.env[env[1]] = env[2]; continue; }
    const field = /^ {2}([A-Za-z]+):\s*(.*)$/.exec(line);
    if (!field) continue;
    const [, key, value] = field;
    inEnv = key === 'Environment';
    if (key === 'Scope') out.scope = scopeWord(value);
    else if (key === 'Status') out.status = value.trim();
    else if (key === 'Type') out.type = value.trim();
    else if (key === 'Command') out.command = value.trim();
    else if (key === 'Args') out.args = value.trim();
  }

  const hint = /claude mcp remove\s+\S+\s+-s\s+(local|user|project)/.exec(raw);
  if (hint) out.scope = hint[1];
  return out;
}

/** `Project config (shared via .mcp.json)` → `project`. Null for wording nobody has seen yet. */
function scopeWord(value) {
  const first = String(value).trim().toLowerCase().split(/\s+/)[0];
  return SCOPES.includes(first) ? first : null;
}

/**
 * One `claude mcp …` call.
 *
 * `cwd = root` is not decoration: LOCAL scope is keyed on the working directory, so the same
 * command run from elsewhere registers the server for a different project. `childEnv` is the S08
 * rule — our spawn, so `CLAUDE_PROJECT_DIR` is SET rather than inherited from whatever session
 * happens to be running this.
 */
export function run(args, { root, claudePath, exec = spawnClaude, env = process.env } = {}) {
  if (!claudePath) return { ok: false, status: null, reason: CLAUDE_ABSENT, stdout: '', stderr: '' };
  const r = exec(claudePath, ['mcp', ...args], { cwd: root, env: childEnv(root, {}, env) });
  const stdout = String(r?.stdout ?? '');
  const stderr = String(r?.stderr ?? '');
  const status = r?.status ?? null;
  if (status === 0) return { ok: true, status, stdout, stderr, args };
  // A shim we refused to spawn already carries its own sentence; wrapping it in "exited null"
  // would bury the one line that says what to do.
  if (stderr === SHIM_UNRESOLVED(claudePath)) {
    return { ok: false, status, stdout, stderr, args, reason: stderr };
  }
  const unknownFlag = /unknown (option|command)|error: unknown/i.test(`${stdout}${stderr}`);
  return {
    ok: false,
    status,
    stdout,
    stderr,
    args,
    reason: unknownFlag
      ? flagsChanged(args[0], claudeVersion({ claudePath, exec }))
      // The CLI's own words, trimmed to one line. It knows why it refused and we do not.
      : `claude mcp ${args[0]} exited ${status}: ${firstLine(stderr) || firstLine(stdout) || 'no output'}`,
  };
}

const firstLine = (s) => String(s).split('\n').map((l) => l.trim()).find(Boolean) ?? '';

/** `claude mcp get <name>`, parsed. A missing entry is `found: false`, never an error. */
export function get(serverKey, opts) {
  const r = run(['get', serverKey], opts);
  // A non-zero status here means "no such server" as often as it means a real failure, and the
  // parser already distinguishes them by content.
  return { ...parseGet(r.stdout || r.stderr), ok: r.ok, reason: r.reason ?? null };
}

/**
 * Register, then CHECK — `add-json` reporting success is not the same as the entry being there.
 *
 * The JSON is one argv element. It contains no credential by construction (ARC-06-S01's rules,
 * enforced at run time by B01), which is what makes passing it on a command line acceptable at
 * all; a test asserts the negative rather than trusting the sentence.
 */
export function register({ root, serverKey, scope, entry, ...opts }) {
  if (!SCOPES.includes(scope)) throw new Error(`unknown scope "${scope}"`);
  const json = JSON.stringify(entry);
  const added = run(['add-json', serverKey, json, '-s', scope], { root, ...opts });
  if (!added.ok) return { ok: false, reason: added.reason, step: 'add-json' };

  const shown = get(serverKey, { root, ...opts });
  if (!shown.found) {
    return { ok: false, step: 'get',
      reason: `claude mcp add-json reported success but claude mcp get ${serverKey} shows nothing `
        + '— the registration did not take effect' };
  }
  if (shown.scope && shown.scope !== scope) {
    // Not a failure of ours, but the user asked for one scope and another is in force; saying so
    // is better than writing `registration: local` into the state and being wrong about it.
    return { ok: false, step: 'scope',
      reason: `registered at ${scope} scope but claude mcp get ${serverKey} reports `
        + `${shown.scope} — a higher-precedence entry already exists` };
  }
  return { ok: true, entry: shown, stdout: added.stdout };
}

/**
 * Remove the entry THIS TOOL created, and only that one.
 *
 * The caller proves ownership from the state (`registrationReason === CREATED_BY_US`); this
 * function refuses to guess. A legacy entry from an older install belongs to ARC-08-S03, which
 * prints the command for the user to run rather than running it for them — removing something a
 * tool did not create is how a user loses a configuration they still needed.
 */
export function unregister({ root, serverKey, scope, ownedByUs, ...opts }) {
  if (!SCOPES.includes(scope) || scope === 'project') {
    throw new Error(`unregister expects local or user, not "${scope}"`);
  }
  if (!ownedByUs) {
    return { ok: false, skipped: true,
      reason: `the ${scope}-scope "${serverKey}" entry was not created by this tool — leaving it `
        + `alone; remove it yourself with: claude mcp remove ${serverKey} -s ${scope}` };
  }
  const removed = run(['remove', serverKey, '-s', scope], { root, ...opts });
  if (!removed.ok) return { ok: false, reason: removed.reason, step: 'remove' };
  return { ok: true, entry: get(serverKey, { root, ...opts }) };
}
