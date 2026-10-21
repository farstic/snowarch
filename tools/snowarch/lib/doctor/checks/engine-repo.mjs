// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-08-S02 — E-05…E-11: the checkout itself. Is this the tree we shipped, and is it wired up?
//
// Everything here answers a question about FILES THIS REPOSITORY COMMITS, which is what makes the
// remedies so blunt: `git checkout -- <file>`. A user's `.mcp.json` differing from HEAD is not a
// configuration choice the doctor should preserve — the registration, the server key and the
// placeholder defaults are the product, and ARC-06 gives every legitimate local variation its own
// home in `.claude/settings.local.json` and `.local/`. So E-07 and E-08 are never `fixable`: the
// command is printed for a human to run after they have looked at their own diff, and S06 refuses
// to run it for them.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { bootstrapOf, cliOf } from '../spell.mjs';
import { join } from 'node:path';
import { localDir } from '../../local-paths.mjs';

import { makeExec, samePath } from '../../steps/B00.mjs';
import { loadStateOrReason, STATE_VERSION } from '../../state.mjs';
import { plannedSteps } from '../../steps/index.mjs';
import { version as engineVersionOf } from '../../config.mjs';
import { spellings } from '../../text.mjs';
import { defineCheck } from '../registry.mjs';
import { isOurSessionStartHook, projectEntryEnabled } from '../../settings-local.mjs';
import { RUNNING_STEP_ENV } from '../../spawn-env.mjs';
import { which } from '../../which.mjs';

import { credentialKeys, credentialLines, CREDENTIAL_EXT } from './credential-shape.mjs';
import { fail, ok, skip, warn } from './result.mjs';
import { spellFor } from '../spell.mjs';

/** The four files that make a directory this checkout rather than any directory. */
export const ROOT_MARKERS = Object.freeze(
  ['engine.config.json', 'CLAUDE.md', '.mcp.json', 'packages/snowarch/package.json'],
);

const SETTINGS = join('.claude', 'settings.json');
const SETTINGS_LOCAL = join('.claude', 'settings.local.json');
const MCP_JSON = '.mcp.json';

/** `git`, run in the checkout. `ok` is exit 0; the doctor never reads git's stderr into a report. */
const gitIn = (ctx) => {
  const exec = ctx.exec ?? makeExec({ env: ctx.env, plat: ctx.platform });
  return (args) => exec('git', ['-C', ctx.root, ...args]);
};

const readJson = (root, rel) => JSON.parse(readFileSync(join(root, rel), 'utf8'));

/** Committed-and-unmodified, as git sees it. `null` when git could not answer at all. */
export function isUnmodified(git, rel) {
  const r = git(['diff', '--quiet', 'HEAD', '--', rel]);
  if (!r.found) return null;
  return r.ok;
}

/**
 * Every `${…}` in a `.mcp.json` value, and whether it carries a `:-` default.
 *
 * A placeholder without one expands to the empty string with no way to tell that from a value the
 * user meant to be empty. `01` §5 makes the default mandatory; this reports the ones that lost it.
 */
export function placeholdersWithoutDefault(value, found = []) {
  if (typeof value === 'string') {
    for (const m of value.matchAll(/\$\{([^}]*)\}/g)) {
      if (!m[1].includes(':-')) found.push(`\${${m[1]}}`);
    }
    return found;
  }
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) placeholdersWithoutDefault(child, found);
  }
  return found;
}

/**
 * The structural claims `tests/engine-config.test.mjs` makes, minus Ajv.
 *
 * The test compiles `engine.config.schema.json` with Ajv, which is a dependency; the doctor has to
 * answer on a checkout where `npm ci` has never run, so the same claims are made by hand. They are
 * the claims, not the schema: a key that exists and is empty is the failure mode this catches, and
 * the two patterns are the two fields whose SHAPE has broken before (a space in the server key, a
 * short pin).
 */
export function configProblems(config, root) {
  const problems = [];
  const required = {
    product: config?.product,
    cli: config?.cli,
    'mcp.serverKey': config?.mcp?.serverKey,
    'mcp.package': config?.mcp?.package,
    'mcp.packageDir': config?.mcp?.packageDir,
    'floors.node': config?.floors?.node,
    'floors.git': config?.floors?.git,
    'floors.claudeCode': config?.floors?.claudeCode,
    'docs.family': config?.docs?.family,
    'docs.pin': config?.docs?.pin,
    'roster.skills': config?.roster?.skills,
    'roster.agents': config?.roster?.agents,
  };
  for (const [name, value] of Object.entries(required)) {
    if (value === undefined || value === null || value === '') problems.push(`\`${name}\` is missing`);
  }
  if (config?.mcp?.serverKey && /\s/.test(config.mcp.serverKey)) {
    problems.push('`mcp.serverKey` contains whitespace');
  }
  if (config?.docs?.pin && !/^[0-9a-f]{40}$/.test(config.docs.pin)) {
    problems.push('`docs.pin` is not a 40-character sha');
  }
  const dir = config?.mcp?.packageDir;
  if (dir && !existsSync(join(root, dir))) {
    problems.push(`\`mcp.packageDir\` "${dir}" does not exist`);
  } else if (dir) {
    // The package NAME is compared against the package itself rather than against a literal here:
    // `@farstic/snowarch` written in this file would be a second declaration of it, and the one in
    // `packages/snowarch/package.json` is the one npm publishes.
    let name = null;
    try { name = readJson(root, join(dir, 'package.json')).name; } catch { /* reported below */ }
    if (name === null) problems.push(`${dir}/package.json is unreadable`);
    else if (name !== config.mcp.package) {
      problems.push(`\`mcp.package\` "${config.mcp.package}" ≠ ${dir}/package.json name "${name}"`);
    }
  }
  return problems;
}

/**
 * The SessionStart hook — read from `.claude/settings.local.json`, which is where it lives.
 *
 * S02's table put it in the committed `.claude/settings.json`. ARC-06-S05 moved it, and the reason
 * is in `settings-local.mjs` beside the writer: "the whole reason the committed settings.json is
 * hook-free" is that a SessionStart hook running `node` on a machine without Node prints an error
 * at every session start, so the hook is written locally and only when Node is present (S-05
 * variant B). A check that looked for it in the committed file would fail every correct install.
 *
 * The shape is that writer's: ONE `command` string, `${CLAUDE_PROJECT_DIR}`-relative, `timeout: 10`.
 *
 * ARC-11-C10 — what is wrong is told apart from where the cure is: `entry` holds the problems the entry itself has,
 * which B07's writer rewrites (`doctor --fix`); `scriptMissing` is the tracked file gone, which no rewrite brings
 * back. `problems` is both, as E-08 reports them.
 * @returns {{problems: string[], entry: string[], scriptMissing: boolean, present: boolean}}
 */
export function sessionStartProblems(local, root) {
  const entry = [];
  let scriptMissing = false;
  const entries = local?.hooks?.SessionStart;
  const hooks = (Array.isArray(entries) ? entries : []).flatMap((e) => e.hooks ?? []);
  // ARC-09-C193 — the writer's own definition of our hook, so the two cannot disagree about which entry is ours.
  const hook = hooks.find(isOurSessionStartHook);
  if (!hook) return { problems: [], entry, scriptMissing, present: false };
  const command = String(hook.command ?? '');
  if (!/^node\s/.test(command)) entry.push(`SessionStart does not run node (${command})`);
  // B07 writes the path ${CLAUDE_PROJECT_DIR}-relative, so the entry follows the checkout wherever it moves; an
  // absolute path to another checkout's script, or a script elsewhere in this one, is a hook at a wrong path.
  if (!/\$\{CLAUDE_PROJECT_DIR\}\/tools\/snowarch\/hooks\/session-start\.mjs$/.test(command)) {
    entry.push(`SessionStart does not run \${CLAUDE_PROJECT_DIR}/tools/snowarch/hooks/session-start.mjs (${command})`);
  } else if (!existsSync(join(root, 'tools', 'snowarch', 'hooks', 'session-start.mjs'))) {
    scriptMissing = true;
  }
  if (!(Number(hook.timeout) <= 10)) {
    entry.push(`SessionStart timeout is ${hook.timeout}, which is more than 10 s`);
  }
  const problems = [...entry, ...(scriptMissing ? ['tools/snowarch/hooks/session-start.mjs is not on disk'] : [])];
  return { problems, entry, scriptMissing, present: true };
}

/**
 * The toggle matrix: what `.claude/settings.local.json` must say for the mode that was recorded.
 *
 * BOTH lists naming the server, or NEITHER, is the case worth the most words. Claude Code resolves
 * that combination itself, and whichever way it resolves it, the file no longer says what the user
 * asked for — so it is a FAIL with a fix rather than a warning, and S06's rewrite is the fix.
 */
export function toggleProblems({ mode, settings, serverKey, registration = 'project' }) {
  const enabled = (settings?.enabledMcpjsonServers ?? []).includes(serverKey);
  const disabled = (settings?.disabledMcpjsonServers ?? []).includes(serverKey);
  // THE WRITER'S RULE, IMPORTED. `mode === 'live'` is not the question — the question is whether
  // the PROJECT entry is the one that should load, and a `local` or `user` registration carries
  // the server itself, so the project entry stays disabled however live the checkout is.
  const wantEnabled = projectEntryEnabled({ mode, registration });
  const problems = [];
  if (enabled && disabled) {
    problems.push(`${serverKey} is in BOTH enabledMcpjsonServers and disabledMcpjsonServers`);
  } else if (!enabled && !disabled) {
    problems.push(`${serverKey} is in NEITHER enabledMcpjsonServers nor disabledMcpjsonServers`);
  } else if (wantEnabled && !enabled) {
    problems.push(`mode is live but ${serverKey} is disabled`);
  } else if (mode && !wantEnabled && !disabled) {
    // Two reasons the project entry must be off, and they need different sentences: design-only,
    // and a live checkout whose server arrives through a local or user registration.
    problems.push(mode === 'live'
      ? `mode is live with a ${registration} registration, but ${serverKey} is enabled in `
        + '.mcp.json — the local entry and the project entry would both load'
      : `mode is ${mode} but ${serverKey} is enabled`);
  }
  return { problems, enabled, disabled, wantEnabled };
}

/** `[{id, why}]` → `[[why, [ids]]]`, preserving the order the reasons first appeared. */
function groupByReason(problems) {
  const byReason = new Map();
  for (const { id, why } of problems) {
    if (!byReason.has(why)) byReason.set(why, []);
    byReason.get(why).push(id);
  }
  return [...byReason];
}

/**
 * `['B07','B08','B09']` → `B07–B09`; `['B04','B09']` → `B04, B09`.
 *
 * A reader scanning a failure wants the shape of the gap, and three consecutive ids spelled out is
 * a list they have to reassemble. Only genuinely consecutive runs collapse — `B04, B09` stays two
 * items, because a gap between them is information.
 */
function ranges(ids) {
  const sorted = [...ids].sort();
  const out = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    const num = (id) => Number(String(id).slice(1));
    while (j + 1 < sorted.length && num(sorted[j + 1]) === num(sorted[j]) + 1) j += 1;
    out.push(j - i >= 2 ? `${sorted[i]}\u2013${sorted[j]}` : sorted.slice(i, j + 1).join(', '));
    i = j + 1;
  }
  return out.join(', ');
}

export function engineRepoChecks() {
  return [
    defineCheck({
      id: 'E-05',
      section: 'repo',
      title: 'repository root',
      severity: 'fail',
      quick: true,
      network: false,
      spawns: false,
      fixable: false,
      // The command already exited 3 if the cwd were not the root — this check exists so a report
      // read on its own says WHICH root, and so that git's opinion of the top level is on the
      // record beside the four markers.
      run: async (ctx) => {
        const missing = ROOT_MARKERS.filter((m) => !existsSync(join(ctx.root, m)));
        if (missing.length > 0) {
          return fail(`${ctx.root} is missing ${missing.join(', ')}`, {
            remedy: 'this is not a complete checkout — clone it again',
            data: { root: ctx.root, missing },
          });
        }
        const top = gitIn(ctx)(['rev-parse', '--show-toplevel']);
        if (!top.found || !top.ok) {
          // git's own absence is E-01's finding. Saying it twice would have the operator fix one
          // problem and read two lines about it.
          return warn(`${ctx.root} (git could not confirm the repository root)`,
            { data: { root: ctx.root } });
        }
        const agrees = samePath(top.stdout.trim(), ctx.root, ctx.platform);
        return agrees
          ? ok(ctx.root, { root: ctx.root, toplevel: top.stdout.trim() })
          : fail(`git reports the top level as ${top.stdout.trim()}, not ${ctx.root}`, {
            remedy: `cd ${top.stdout.trim()}`,
            data: { root: ctx.root, toplevel: top.stdout.trim() },
          });
      },
    }),

    defineCheck({
      id: 'E-06',
      section: 'repo',
      title: 'engine.config.json',
      severity: 'fail',
      quick: true,
      network: false,
      spawns: false,
      fixable: false,
      run: async (ctx) => {
        const problems = configProblems(ctx.config, ctx.root);
        return problems.length === 0
          ? ok(`${ctx.config.product} ${ctx.config.mcp.serverKey} · docs ${ctx.config.docs.family}`,
            { serverKey: ctx.config.mcp.serverKey, family: ctx.config.docs.family })
          : fail(problems.join('; '), {
            remedy: 'restore with `git checkout -- engine.config.json`',
            command: 'git checkout -- engine.config.json',
            data: { problems },
          });
      },
    }),

    defineCheck({
      id: 'E-07',
      section: 'repo',
      title: '.mcp.json committed and secret-free',
      severity: 'fail',
      quick: true,
      network: false,
      spawns: false,
      // Never fixable. See the file header: the command is printed, and a human runs it.
      fixable: false,
      run: async (ctx) => {
        const problems = [];
        const unmodified = isUnmodified(gitIn(ctx), MCP_JSON);
        // Always compared against HEAD, on every platform: the S-03 fallback never edits this file
        // (it adds a local-scope entry through `claude mcp add-json … -s local` plus
        // `env.SNOWARCH_ROOT` in settings.local.json), so a modified `.mcp.json` is never the
        // fallback's doing — E-23/E-27 report that registration separately.
        if (unmodified === false) problems.push('differs from HEAD');
        let mcp = null;
        try { mcp = readJson(ctx.root, MCP_JSON); } catch (e) {
          return fail(`.mcp.json is unreadable — ${e.message}`, {
            remedy: 'git checkout -- .mcp.json',
            command: 'git checkout -- .mcp.json',
            data: { unmodified },
          });
        }
        const keys = Object.keys(mcp.mcpServers ?? {});
        const expected = ctx.config.mcp.serverKey;
        if (keys.length !== 1) problems.push(`expected exactly one mcpServers key, found ${keys.length}`);
        else if (keys[0] !== expected) problems.push(`mcpServers key "${keys[0]}" ≠ "${expected}"`);
        const server = mcp.mcpServers?.[keys[0]] ?? {};
        if (server.command !== 'node') problems.push(`command is "${server.command}", not "node"`);
        const bare = placeholdersWithoutDefault(mcp);
        for (const p of bare) problems.push(`placeholder ${p} has no ":-" default`);
        return problems.length === 0
          ? ok(`one server "${expected}", command node, placeholders defaulted`,
            { serverKey: expected, unmodified: true })
          : fail(problems.join('; '), {
            remedy: 'git checkout -- .mcp.json',
            command: 'git checkout -- .mcp.json',
            data: { problems, unmodified, placeholders: bare },
          });
      },
    }),

    defineCheck({
      id: 'E-08',
      section: 'repo',
      title: '.claude/settings.json committed',
      severity: 'fail',
      quick: true,
      network: false,
      spawns: false,
      fixable: false,
      run: async (ctx) => {
        const problems = [];
        const unmodified = isUnmodified(gitIn(ctx), SETTINGS);
        if (unmodified === false) problems.push('differs from HEAD');
        let settings = null;
        try { settings = readJson(ctx.root, SETTINGS); } catch (e) {
          return fail(`.claude/settings.json is unreadable — ${e.message}`, {
            remedy: 'git checkout -- .claude/settings.json',
            command: 'git checkout -- .claude/settings.json',
            data: { unmodified },
          });
        }
        if (!settings?.env?.MCP_TIMEOUT) problems.push('env.MCP_TIMEOUT is absent');
        // The hook's own file. Its ABSENCE is E-10's finding (ARC-11-C10: E-10 FAILs it when node is on PATH) —
        // but a hook that is there and wrong is this one's reading too.
        let local = null;
        try { local = readJson(ctx.root, SETTINGS_LOCAL); } catch { local = null; }
        const hook = sessionStartProblems(local, ctx.root);
        const settingsWrong = problems.length > 0;
        problems.push(...hook.problems);
        if (problems.length === 0) {
          return ok(`MCP_TIMEOUT ${settings.env.MCP_TIMEOUT} · SessionStart hook `
            + `${hook.present ? 'present' : 'not installed'}`,
            { unmodified: true, mcpTimeout: settings.env.MCP_TIMEOUT, hook: hook.present });
        }
        // ARC-11-C10 — each cure for its own file. settings.json is checked out; the hook entry lives in
        // settings.local.json and is rewritten by E-10's fix; the hook script is a tracked file, checked out
        // like any other, and on a release tree E-32 names it as missing too.
        const SCRIPT = 'tools/snowarch/hooks/session-start.mjs';
        const cures = [
          ...(settingsWrong ? ['git checkout -- .claude/settings.json'] : []),
          ...(hook.scriptMissing ? [`git checkout -- ${SCRIPT} (on a release tree E-32 names it as missing too)`] : []),
          ...(hook.entry.length > 0 ? [`${cliOf(ctx)} doctor --fix`] : []),
        ];
        const command = settingsWrong ? 'git checkout -- .claude/settings.json'
          : hook.scriptMissing ? `git checkout -- ${SCRIPT}` : `${cliOf(ctx)} doctor --fix`;
        return fail(problems.join('; '), {
          remedy: cures.join('; then '),
          command,
          data: { problems, unmodified },
        });
      },
    }),

    defineCheck({
      id: 'E-09',
      section: 'repo',
      title: 'no credential-shaped keys',
      severity: 'fail',
      // ARC-09-C8 — `quick` is a COST contract: no process, no tree walk, no network, under
      // 50 ms on the slowest Windows cell. This one walks the whole tree looking for credential-shaped keys — 249 ms locally, ~320 on Windows,
      // and the banner's re-run path pays it before a user's first word. It still runs on
      // every `./snowarch doctor`, and the cache the banner reads first is written by one.
      quick: false,
      network: false,
      spawns: false,
      fixable: false,
      // Two legs, one pattern (`credential-shape.mjs`, shared with `tests/never-commit.test.mjs`):
      // a KEY that names a credential in one of the three settings files, and a tracked file
      // carrying a credential-shaped LITERAL. Only `file:line` is ever reported — printing the
      // match would put the credential in the report.
      run: async (ctx) => {
        const problems = [];
        for (const rel of [MCP_JSON, SETTINGS, SETTINGS_LOCAL]) {
          if (!existsSync(join(ctx.root, rel))) continue;
          let parsed;
          try { parsed = readJson(ctx.root, rel); } catch { continue; }
          for (const key of credentialKeys(parsed)) problems.push(`${rel}: key ${key}`);
        }
        const tracked = gitIn(ctx)(['ls-files']);
        const hits = [];
        if (tracked.found && tracked.ok) {
          for (const file of tracked.stdout.split('\n').filter((f) => f && CREDENTIAL_EXT.test(f))) {
            let text;
            try { text = readFileSync(join(ctx.root, file), 'utf8'); } catch { continue; }
            for (const line of credentialLines(text)) hits.push(`${file}:${line}`);
          }
        }
        for (const hit of hits.slice(0, 10)) problems.push(hit);
        return problems.length === 0
          ? ok('no credential-shaped key or literal', { scanned: tracked.ok ? 'tracked files' : 'settings only' })
          : fail(problems.join('; '), {
            remedy: 'remove the key; credentials live only in .local/instances.json '
              + `(\`${cliOf(ctx)} instance set-credentials <label>\`)`,
            data: { problems },
          });
      },
    }),

    defineCheck({
      id: 'E-10',
      section: 'repo',
      title: 'settings.local toggles match the recorded mode',
      severity: 'fail',
      quick: true,
      network: false,
      spawns: false,
      fixable: true,
      run: async (ctx) => {
        const { state, reason: stateUnreadable } = loadStateOrReason(ctx.root, spellFor(ctx));
        // ARC-07-C37 — THIS CHECK COMPARES THE TOGGLES TO THE RECORDED MODE, so an unreadable state
        // leaves it with nothing to compare against. It used to swallow the read error and carry on
        // with `state?.mode ?? 'design'`, and measured on a tree whose state file is not JSON it
        // reported `ok — design · disabled`: a checkout certified healthy on a mode nobody could read,
        // in the SAME section as the check that fails on that exact file. So the silence was never
        // about which section ran — it was this `catch`.
        //
        // A SKIP, not a fail: the toggles may be perfectly correct, and E-11 already owns the file's
        // sentence and its remedy. This follows the convention E-13…E-16 use for a corpus they cannot
        // read — say what is missing, name the check that explains it, and do not repeat its remedy.
        if (stateUnreadable) {
          // `skip` takes its data DIRECTLY, not wrapped in `{ data }` — the wrapped form type-checks,
          // passes every status assertion, and quietly buries the reason one level down where `--json`
          // readers will not find it. Caught by asserting the field rather than only the sentence.
          return skip('the recorded mode could not be read, so the toggles cannot be compared to it '
            + '(see E-11)', { mode: null, stateUnreadable, fix: null });
        }
        if (!existsSync(join(ctx.root, SETTINGS_LOCAL))) {
          return fail('.claude/settings.local.json is absent — the mode toggle is unset', {
            remedy: `${cliOf(ctx)} mode design (or ${cliOf(ctx)} mode live)`,
            command: `${cliOf(ctx)} mode design`,
            data: { mode: state?.mode ?? null,
              fix: { kind: 'toggles-mismatch', mode: state?.mode ?? 'design' } },
          });
        }
        let settings;
        try { settings = readJson(ctx.root, SETTINGS_LOCAL); } catch (e) {
          // ARC-11-C10 — the fix is planned so that `--fix` SAYS why it touches nothing: F6's writer refuses a file
          // that does not parse, with its own reason, and the file is left as it is.
          return fail(`.claude/settings.local.json is not valid JSON — ${e.message}`, {
            remedy: `fix the JSON, then ${cliOf(ctx)} mode design or ${cliOf(ctx)} mode live`,
            data: { mode: state?.mode ?? null, fix: { kind: 'toggles-mismatch', mode: state?.mode ?? 'design' } },
          });
        }
        const serverKey = ctx.config.mcp.serverKey;
        const mode = state?.mode ?? null;
        // ARC-08-C15 — the registration is half the question. Without it this check read
        // "live means enabled" and failed a live checkout registered `local`, whose project entry
        // is disabled BY DESIGN because the local entry carries the same server.
        const registration = state?.registration ?? 'project';
        const { problems, enabled, disabled, wantEnabled } =
          toggleProblems({ mode, settings, serverKey, registration });
        const data = { mode, registration, enabled, disabled,
          fix: { kind: 'toggles-mismatch', mode: mode ?? 'design' } };
        if (problems.length > 0) {
          return fail(problems.join('; '), {
            remedy: mode === 'live' ? `${cliOf(ctx)} mode live` : `${cliOf(ctx)} mode design`,
            command: mode === 'live' ? `${cliOf(ctx)} mode live` : `${cliOf(ctx)} mode design`,
            data,
          });
        }
        // `disableAllHooks` has two meanings and they get different sentences. The bootstrap sets
        // it when Node was absent; that reason expires the moment Node appears, so it is a WARN
        // with a fix. A user who set it themselves is exercising a supported choice, and telling
        // them off for it would be the doctor overruling its operator.
        // ARC-11-C10 — "Node present" is what the hook needs: `node` on PATH, as bootstrap.sh decides it
        // (`command -v node`). The doctor itself always runs under some Node, so the process is no answer.
        const nodeOnPath = which('node', { env: ctx.env, platform: ctx.platform }) !== null;
        if (settings.disableAllHooks === true) {
          if (state?.hooksDisabledByBootstrap === true) {
            return warn('hooks were disabled when Node was absent; Node is present now', {
              remedy: 'remove "disableAllHooks" from .claude/settings.local.json',
              data: { ...data, fix: { kind: 'hooks-disabled-by-bootstrap' } },
            });
          }
          // The user's own key, and no fixer takes it. With node on PATH it costs the session its Licence: line,
          // which is the same gap as no hook at all; without node it is the supported hook-free state (ARC-06-S05).
          return nodeOnPath
            ? fail('disableAllHooks is set, so the SessionStart hook cannot print the Licence: line', {
              remedy: 'remove "disableAllHooks" from .claude/settings.local.json',
              data: { ...data, fix: null },
            })
            : ok(`${mode ?? 'design'} · hooks disabled by choice (disableAllHooks)`, data);
        }
        // ARC-11-C10 — the hook prints the Licence: line CLAUDE.md's licence rule reads. With node on PATH, no hook
        // is a FAIL and a wrong one too, each rewritten by B07's writer under `doctor --fix`; a missing hook SCRIPT is
        // E-08's, because no rewrite of the entry brings a tracked file back.
        if (nodeOnPath) {
          const hook = sessionStartProblems(settings, ctx.root);
          if (!hook.present) {
            return fail('.claude/settings.local.json has no SessionStart hook, so a session starts without its '
              + 'Licence: line', {
              remedy: `${cliOf(ctx)} doctor --fix (or re-run the bootstrap)`,
              data: { ...data, fix: { kind: 'hook-absent' } },
            });
          }
          if (hook.entry.length > 0) {
            return fail(hook.entry.join('; '), {
              remedy: `${cliOf(ctx)} doctor --fix (or re-run the bootstrap)`,
              data: { ...data, fix: { kind: 'hook-wrong' } },
            });
          }
        }
        // The ok line SAYS WHY when "live" and "disabled" appear together, because that pair reads
        // as a contradiction to anybody who has just been told the mode is live.
        if (mode === 'live' && !wantEnabled) {
          return ok(`live · disabled (${registration} registration carries the server)`, data);
        }
        return ok(`${mode ?? 'design'} · ${enabled ? 'enabled' : 'disabled'}`, data);
      },
    }),

    defineCheck({
      id: 'E-11',
      section: 'repo',
      title: '.local/ state',
      severity: 'fail',
      quick: true,
      network: false,
      spawns: false,
      fixable: true,
      run: async (ctx) => {
        const local = localDir(ctx.root);
        if (!existsSync(local)) {
          // `fixable: false` on the RESULT: the check can be fixable (a wrong mode is one command),
          // but an absent `.local/` is an install that never ran, and `--fix` does not install.
          return fail('.local/ is absent — not bootstrapped', {
            // ARC-07-W17 — SIX BRANCHES THAT ALREADY KNEW THE PLATFORM AND STILL GOT IT WRONG. Each read
            // `ctx.platform === 'win32' ? 'bootstrap.cmd' : './bootstrap.sh'`: somebody wrote the win32 arm
            // and put in it the ONE spelling PowerShell refuses, because it does not resolve a command from
            // the current directory and nothing here is on PATH. ARC-07-C1's finding, reproduced in code that
            // branches on platform — and three of these are doctor remedies a Windows user is told to paste
            // when `.local` permissions or the workspace are wrong, so they fire on the unhappy path where a
            // reader can least afford to guess. `ctx.env` is threaded, not omitted: `isWindowsShell` reads
            // SHELL and MSYSTEM so Git Bash on Windows keeps the POSIX spelling.
            remedy: spellings({ platform: ctx.platform, env: ctx.env }).bootstrap,
            command: spellings({ platform: ctx.platform, env: ctx.env }).bootstrap,
            fixable: false,
            data: { fix: null },
          });
        }
        const notes = [];
        const problems = [];
        // Windows has no mode bits worth asserting: the directory inherits the parent's ACL, and
        // `chmod` there sets a read-only flag that means something else entirely. The check says
        // so rather than reporting a mode it did not apply — and it NEVER runs chmod.
        let mode = null;
        if (ctx.platform === 'win32') {
          notes.push('file modes: ACL-inherited');
        } else {
          mode = statSync(local).mode & 0o777;
          if (mode !== 0o700) {
            problems.push(`.local/ is mode ${mode.toString(8).padStart(3, '0')}, not 700`);
          }
        }
        // ARC-07-C37 — E-11 OWNS THIS SENTENCE, and that does not change; what changes is that the
        // read no longer catches EVERY error. A `catch (e)` here reported a `TypeError` from a
        // programming mistake as a finding about the user's checkout, complete with a
        // `bootstrap --reset` remedy that would not have fixed it — the same hiding place C31 found in
        // `recordedMode`, in the one check whose job is to report this file.
        const { state, reason } = loadStateOrReason(ctx.root, spellFor(ctx));
        if (reason) {
          return fail(reason, {
            remedy: `${cliOf(ctx)} bootstrap --reset`,
            command: `${cliOf(ctx)} bootstrap --reset`,
            fixable: false,
            data: { mode, fix: null },
          });
        }
        if (!state) problems.push('.local/bootstrap-state.json is absent — not bootstrapped');
        else if (state.version !== STATE_VERSION) {
          notes.push(`state schema ${state.version} (current ${STATE_VERSION})`);
        }
        const logs = join(local, 'logs');
        if (!existsSync(logs)) problems.push('.local/logs/ is absent');
        const data = {
          mode: mode === null ? 'acl-inherited' : mode.toString(8).padStart(3, '0'),
          schema: state?.version ?? null,
          recordedMode: state?.mode ?? null,
          fix: mode !== null && mode !== 0o700 ? { kind: 'store-mode', path: '.local', to: '700' } : null,
        };
        if (problems.length > 0) {
          const fixable = data.fix !== null;
          return fail(problems.join('; '), {
            fixable,
            remedy: fixable ? 'chmod 700 .local' : (spellings({ platform: ctx.platform, env: ctx.env }).bootstrap),
            command: fixable ? 'chmod 700 .local' : (spellings({ platform: ctx.platform, env: ctx.env }).bootstrap),
            data,
          });
        }
        const detail = [`mode ${state?.mode ?? 'unset'}`, ...notes].join(' · ');
        return ok(detail, data);
      },
    }),
    /**
     * ARC-08-C30 — DID THE INSTALL FINISH? Nothing asked, and the state knew.
     *
     * The owner Ctrl+C'd an upgrade at B06's prompt (sitting, 2026-09-23). The runner recorded it
     * — `status: 'failed', reason: 'interrupted'` — and printed `interrupted during B06`. Then
     * `./snowarch doctor` reported `37 ok, 1 warn, 0 fail` and E-11 said `.local/ state: mode
     * live`, because **no check read `state.steps` at all**: `git grep 'state.steps'` over the
     * doctor returned nothing. B07, B08 and B09 never ran, U7 never ran, and no surface said so.
     *
     * E-11 asks whether the state file is WELL-FORMED. This asks whether the install it describes
     * FINISHED — the same distinction this arc keeps finding, one file over.
     *
     * The comparison is against `plannedSteps()`, the runner's own list, so a step that was never
     * going to run in the recorded mode is not reported as missing; and against the checkout's
     * CURRENT version rather than `state.engineVersion`, which `emptyState` writes once at install
     * and nothing updates — it names the version a checkout was first installed at, not the one it
     * is on.
     */
    defineCheck({
      id: 'E-29',
      section: 'repo',
      title: 'the bootstrap finished',
      severity: 'fail',
      quick: true,
      network: false,
      spawns: false,
      fixable: false,
      run: async (ctx) => {
        // ARC-07-C37 — this read had NO `catch` at all, which was not tolerance but an omission: the
        // runner turns a throw into `check crashed: <message>`, so an unreadable state file — a
        // legitimate thing to find in a checkout — was reported to the operator as a crash in OUR
        // code. Measured on the same fixture that produced E-10's false `ok`.
        const { state, reason: stateUnreadable } = loadStateOrReason(ctx.root, spellFor(ctx));
        if (stateUnreadable) {
          return skip('the recorded state could not be read, so whether the bootstrap finished is '
            + 'unknown (see E-11)', { stateUnreadable });
        }
        // No state is E-11's finding, not this one. A check that repeated it would put two
        // failures on one cause and send a reader to two remedies.
        if (!state?.mode) return ok('no recorded install to check');

        // NOTHING STARTED IS NOT SOMETHING UNFINISHED, and this cost a correction: the first
        // version reported a state with a mode and no steps as `B01–B09 never ran`, which is
        // technically true and is also the shape of a run that has only just written its state
        // file — `.local/` and the record exist before B01 finishes. Every fixture tree carries
        // it, so the capture came back `14 ok, 0 warn, 1 fail` and the release-assets check
        // refused the report.
        //
        // This check is about an install that STARTED and did not finish. "Nothing started" is a
        // different sentence and E-11 already owns the tree that has no install at all.
        if (Object.keys(state.steps ?? {}).length === 0) {
          return ok('no steps recorded yet');
        }

        const current = engineVersionOf(ctx.root);
        const expected = plannedSteps({
          mode: state.mode,
          docs: state.docs?.mode ?? null,
          node: state.node ?? { present: false },
          env: {},
          root: ctx.root,
          // ARC-11-C6 (ruling R1) — B06 and B08 are planned only with a licence in force; with none here, the root's.
          licence: ctx.licence,
        });

        // THE STEP RUNNING THIS CHECK IS NOT A STEP THAT NEVER RAN.
        //
        // B09's job includes spawning `doctor --quick --json` for the summary it prints, and the
        // runner records a step only AFTER its `run()` returns. So on every first design-only
        // bootstrap this check ran from inside B09, found B09 absent, and printed
        // `bootstrap incomplete since <version>: B09 never ran` — the first FAIL a new user ever
        // sees, under the very step that was running it, with a remedy that would re-run an install
        // that had just finished. The install was fine; the sentence was false.
        //
        // The running step names ITSELF in the child environment (`RUNNING_STEP_ENV`), so this is
        // "the step that is running me", never "B09": a future step that asks the doctor for a
        // summary is covered without this check learning its name. It is deliberately not a marker
        // in the state file — that would survive a `SIGKILL` and make a genuinely unfinished install
        // read as in progress for ever, which is this check's own defect facing the other way.
        const runningStep = (ctx.env ?? {})[RUNNING_STEP_ENV] || null;
        const problems = [];
        const stale = [];
        let inProgress = null;
        for (const step of expected) {
          const recorded = state.steps?.[step.id];
          if (!recorded) {
            if (step.id === runningStep) { inProgress = step.id; continue; }
            problems.push({ id: step.id, why: 'never ran' });
            continue;
          }
          if (recorded.status === 'failed' || recorded.status === 'fail') {
            problems.push({ id: step.id, why: recorded.reason === 'interrupted' ? 'interrupted' : 'failed' });
            continue;
          }
          if (recorded.status !== 'ok' && recorded.status !== 'warn' && recorded.status !== 'skipped') {
            problems.push({ id: step.id, why: recorded.status });
            continue;
          }
          // ABSENT IS NOT A MISMATCH. States written before ARC-08-C30 carry no per-step version,
          // and reporting that as "recorded under another version" would turn every older install
          // into a finding — the defect this check exists to catch, facing the other way.
          // ...AND NEITHER IS THE STEP RUNNING THIS CHECK (ARC-08-C36). ARC-08-C32 excluded it from
          // `never ran`, but only in the branch above, where it has no recorded entry at all. On a
          // checkout that has been bootstrapped before, the running step DOES have one — from the
          // earlier install, under the earlier version — so it fell through to here and the step
          // asking the question was named in the answer. B09 appeared in the e2e's own stale list
          // for exactly this reason, and B09 is not even cacheable: it runs every time, and its
          // entry is rewritten the moment it finishes, which is after this check.
          if (step.id === runningStep) { inProgress = step.id; continue; }
          if (recorded.engineVersion && current && recorded.engineVersion !== current) {
            stale.push({ id: step.id, was: recorded.engineVersion });
          }
        }

        if (problems.length === 0 && stale.length === 0) {
          // The count is of what IS recorded, and the sentence says why one is not — a reader who
          // sees a number one short of the plan should not have to wonder which.
          return inProgress
            ? ok(`${expected.length - 1} steps recorded, all current; ${inProgress} is running this check`)
            : ok(`${expected.length} steps recorded, all current`);
        }

        const parts = [];
        for (const [why, ids] of groupByReason(problems)) parts.push(`${ranges(ids)} ${why}`);
        for (const { id, was } of stale) parts.push(`${id} recorded under ${was}`);
        // ARC-08-C36 — AND THE SAME COURTESY ON THE FAIL PATH. `inProgress` was rendered only in the
        // two `ok` returns, so a reader whose install has a real problem saw a tally one short of the
        // plan with no word about the step that is running — the very thing the `ok` sentence exists
        // to prevent. It is the same principle and the same reader.
        if (inProgress) parts.push(`${inProgress} is running this check`);
        return fail(`bootstrap incomplete since ${current ?? 'this version'}: ${parts.join(', ')}`, {
          remedy: spellings({ platform: ctx.platform, env: ctx.env }).bootstrap,
          command: spellings({ platform: ctx.platform, env: ctx.env }).bootstrap,
          data: { expected: expected.map((s) => s.id), problems, stale, engineVersion: current },
        });
      },
    }),
  ];
}
