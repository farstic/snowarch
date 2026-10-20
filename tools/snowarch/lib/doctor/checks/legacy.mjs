// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-08-S03 — E-23, E-24: what the OLD install left behind, found and never touched.
//
// READ-ONLY BY CONSTRUCTION. `~/.claude.json` belongs to Claude Code and the legacy store belongs
// to a product that is not this one; the doctor's job is to say what is there and print the exact
// command, and the user's job is to run it. This module changes nothing on disk — not under
// `--fix`, not ever — and `tests/doctor/legacy.test.mjs` greps it for the mutating verbs rather
// than trusting the sentence. The grep is the story's literal one, so this comment states the rule
// without spelling those verbs: a file whose prose names them fails its own check.
// `readFileSync`, `existsSync`, `statSync`, `readdirSync`: the whole filesystem vocabulary here.
//
// Why it matters more here than anywhere else in the doctor: `00` P-34 counted SIX copies of one
// credential across the old layout, and the `.bak-*` files Claude Code writes keep every secret the
// original had. A user who deletes the registration and stops there still has the password on disk.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { bootstrapOf, cliOf } from '../spell.mjs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineCheck } from '../registry.mjs';

import { CREDENTIAL_KEY } from './credential-shape.mjs';
import { ok, warn } from './result.mjs';

const here = dirname(fileURLToPath(import.meta.url));

/**
 * The names the old installers wrote — DATA, not literals in this file.
 *
 * A check body that spelled them would be a finding in the repository's own retired-name ratchet
 * (L03), which is the correct behaviour of that ratchet: the words are dead everywhere except in
 * the detector that hunts them. So they live in JSON, and that one path is listed in the lint's
 * `POLICY_FILES`.
 */
export const STALE = JSON.parse(readFileSync(join(here, 'stale-registrations.json'), 'utf8'));

export const CLAUDE_JSON = '.claude.json';
export const LEGACY_STORE = ['.config', 'servicenow-mcp', 'instances.json'];

/** `~/…` for anything under the home directory. The report never prints a real home path. */
export const tildify = (p, home) => {
  const s = String(p);
  return home && s.startsWith(home) ? `~${s.slice(home.length)}` : s;
};

/**
 * Is this `mcpServers` entry a leftover of the old install?
 *
 * Two signals, because the old scripts wrote two shapes. The NAME is the reliable one. The
 * `snow-mcp` path segment catches a registration whose name was chosen by hand but whose `args`
 * still point at the old checkout. What is deliberately NOT here is a SUBSTRING match: the old
 * the OLD engine's `doctor.sh` matched a case-insensitive alternation of the two dead names and a
 * bare `snow`, and that last alternative flags the CURRENT registration key — which would tell
 * every correctly installed user to delete their working server. (The dead names are not written
 * out here for the same reason they are not written out anywhere else in the tree: they live in
 * `stale-registrations.json`, which the retired-name ratchet exempts because being that list is
 * what the file is for.)
 */
export function isStaleEntry(name, entry) {
  if (STALE.names.includes(String(name))) return true;
  const args = Array.isArray(entry?.args) ? entry.args : [];
  const segment = STALE.pathSegment;
  return args.some((a) => {
    const parts = String(a).split(/[\\/]/);
    return parts.at(-1) === 'server.js' && parts.includes(segment);
  });
}

/** `set (len n)` for the first credential-shaped env key — the LENGTH, never the value. */
export function envSummary(entry) {
  const env = entry?.env && typeof entry.env === 'object' ? entry.env : {};
  const keys = Object.keys(env);
  const credential = keys.filter((k) => CREDENTIAL_KEY.test(k));
  const first = credential[0];
  const length = first === undefined ? null : String(env[first] ?? '').length;
  return { keys: keys.length, credential: credential.length, length };
}

/** Every `~/.claude.json.bak-*` / `.backup*`: how many and when the newest was written. */
export function backupFiles(home) {
  if (!home || !existsSync(home)) return { count: 0, newest: null };
  let count = 0;
  let newest = null;
  for (const name of readdirSync(home)) {
    if (!/^\.claude\.json\.(bak|backup)/.test(name)) continue;
    count += 1;
    try {
      const mtime = statSync(join(home, name)).mtime;
      if (newest === null || mtime > newest) newest = mtime;
    } catch { /* a file that vanished between the listing and the stat */ }
  }
  return { count, newest: newest ? newest.toISOString().slice(0, 10) : null };
}

/** The two container shapes the legacy wizard ever wrote (ARC-07-S08 accepted both). */
export function countLegacyInstances(text) {
  let parsed;
  try { parsed = JSON.parse(text); } catch { return null; }
  if (Array.isArray(parsed)) return parsed.length;
  if (Array.isArray(parsed?.instances)) return parsed.instances.length;
  if (parsed?.instances && typeof parsed.instances === 'object') {
    return Object.keys(parsed.instances).length;
  }
  if (parsed && typeof parsed === 'object') {
    // The oldest shape: the object IS the map of labels. `defaultInstance` and friends are
    // metadata rather than entries, so an object value is what counts.
    return Object.values(parsed).filter((v) => v && typeof v === 'object').length;
  }
  return null;
}

/** The two lines E-23 prints for one stale entry under this folder. Quoted by ARC-10's migration. */
export const removalCommand = (name) => `claude mcp remove ${name} -s local`;
export const BACKUP_REMINDER = 'then review and delete ~/.claude.json.bak-* files — they retain '
  + 'the same secrets (ls -la ~/.claude.json.bak-* )';

export function legacyChecks() {
  return [
    defineCheck({
      id: 'E-23',
      section: 'legacy',
      title: 'stale MCP registrations in ~/.claude.json',
      severity: 'warn',
      quick: true,
      network: false,
      spawns: false,
      // Never. The file is Claude Code's, the command is the user's to run, and S06 refuses it.
      fixable: false,
      run: async (ctx) => {
        const home = ctx.home ?? '';
        const path = home ? join(home, CLAUDE_JSON) : CLAUDE_JSON;
        if (!home || !existsSync(path)) {
          return ok(`no ~/${CLAUDE_JSON} — nothing to clean`, { entries: [], present: false });
        }
        let parsed;
        try {
          parsed = JSON.parse(readFileSync(path, 'utf8'));
        } catch (e) {
          // A WARN and never a FAIL: the doctor does not own this file, and a user whose Claude
          // Code configuration is broken has a problem the doctor can only describe.
          return warn(`~/${CLAUDE_JSON} is not valid JSON — Claude Code cannot read its own `
            + `configuration (${e.message})`, {
            remedy: `check it with: node -e 'JSON.parse(require("fs").readFileSync(process.env.HOME`
              + ` + "/${CLAUDE_JSON}", "utf8"))'`,
            data: { present: true, parsed: false, entries: [] },
          });
        }

        const projects = parsed?.projects && typeof parsed.projects === 'object' ? parsed.projects : {};
        const entries = [];
        let registration = null;
        for (const [project, config] of Object.entries(projects)) {
          const servers = config?.mcpServers && typeof config.mcpServers === 'object'
            ? config.mcpServers : {};
          const isThisFolder = project === ctx.root;
          for (const [name, entry] of Object.entries(servers)) {
            if (isThisFolder && name === ctx.config?.mcp?.serverKey) {
              // Not stale: this is the `mode live --register local` entry or the S-03 fallback
              // (both ARC-06-S12). The recorded state says which, and neither is a leftover.
              registration = name;
              continue;
            }
            if (!isStaleEntry(name, entry)) continue;
            entries.push({
              scope: isThisFolder ? 'this-folder' : 'other',
              project: tildify(project, home),
              name,
              command: removalCommand(name),
              ...envSummary(entry),
            });
          }
        }

        const backups = backupFiles(home);
        // The file's own mode is only worth reporting while something in it is worth removing.
        let insecure = false;
        if (entries.length > 0 && ctx.platform !== 'win32') {
          try { insecure = (statSync(path).mode & 0o077) !== 0; } catch { insecure = false; }
        }
        // ARC-08 / ARC-10-S10 (Sitting A D1) — `--json` IS THE FORM THAT TRAVELS, and the
        // Install-problem issue template asks a stranger to paste it into a public tracker. On the
        // owner's machine that JSON carried the names of his OTHER project folders — client and
        // engagement folders on a consultant's laptop — nine times. The boundary in
        // `json-boundary.mjs` masks the HOME PREFIX, which is right for this checkout's own path
        // (depth, spaces, drive letter are what a maintainer uses) and useless here: what survives
        // is `~/Documents/work/<client>`, and the client name is the whole of the secret.
        //
        // So the folder never enters the JSON at all. `project` is dropped from the travelling
        // entries and kept only for the terminal, which is where the user acts on it.
        const data = {
          present: true,
          parsed: true,
          entries: entries.map(({ project, ...rest }) => rest),
          otherProjectCount: new Set(entries.filter((e) => e.scope === 'other')
            .map((e) => e.project)).size,
          backups,
          registration,
          mode: insecure ? 'group/world-readable' : null,
        };

        if (entries.length === 0) {
          const detail = registration
            ? `no stale registration; "${registration}" under this folder is this product's own`
            : 'no stale registration';
          return ok(detail, data);
        }

        const here = entries.filter((e) => e.scope === 'this-folder');
        const elsewhere = entries.filter((e) => e.scope === 'other');
        const counts = (e) => (e.credential > 0
          ? `holds ${e.keys} env keys, ${e.credential} credential-shaped — set (len ${e.length})`
          : `holds ${e.keys} env keys`);
        // Two details, deliberately. `textLines` is for the terminal, where the folder is the thing
        // the user needs in order to go and run the command. `lines` is what travels.
        const textLines = [];
        const lines = [];
        // The first line says WHERE, because the command differs: a registration under this folder
        // is removed by running the command here, and one under another project is removed by
        // running it there. Saying "for this folder" about somebody else's project would send a
        // user to run a command that reports nothing and leaves the entry in place.
        if (here.length > 0) {
          textLines.push(`stale MCP registration "${here[0].name}" in ~/${CLAUDE_JSON} for this folder `
            + `(${counts(here[0])})`);
          if (here.length > 1) textLines.push(`and ${here.length - 1} more under this folder`);
        } else {
          textLines.push(`no stale registration for this folder; ${elsewhere.length} under other `
            + 'project(s)');
        }
        for (const other of elsewhere) {
          textLines.push(`also registered under: ${other.project} (${other.name}) — run the same `
            + 'command from that folder');
        }
        // The travelling summary: how many, under how many OTHER folders, and which servers — the
        // three facts a maintainer reading a pasted report actually uses. No folder, ever.
        const byName = new Map();
        for (const e of entries) byName.set(e.name, (byName.get(e.name) ?? 0) + 1);
        const named = [...byName].map(([name, n]) => (n > 1 ? `${name} ×${n}` : name)).join(', ');
        lines.push(`${entries.length} stale registration(s) under ${data.otherProjectCount} other `
          + `project folder(s): ${named}`);
        // The credential SHAPE travels too, in the repository's own `set (len n)` form: a maintainer
        // reading a pasted report needs to know secrets are sitting in that file, and the form says
        // so without disclosing one. Dropping it with the folder names would have thrown away the
        // half of this finding that makes it urgent.
        const totalKeys = entries.reduce((n, e) => n + e.keys, 0);
        const totalCred = entries.reduce((n, e) => n + e.credential, 0);
        const firstLen = entries.find((e) => e.credential > 0)?.length;
        lines.push(totalCred > 0
          ? `holds ${totalKeys} env keys, ${totalCred} credential-shaped — set (len ${firstLen})`
          : `holds ${totalKeys} env keys`);

        if (backups.count > 0) {
          const backupLine = `${backups.count} ~/${CLAUDE_JSON}.bak-* file(s) present`
            + `${backups.newest ? `, newest ${backups.newest}` : ''}`;
          textLines.push(backupLine);
          lines.push(backupLine);
        }
        if (insecure) {
          const insecureLine = `and it is group/world-readable — chmod 600 ~/${CLAUDE_JSON}`;
          textLines.push(insecureLine);
          lines.push(insecureLine);
        }

        // ARC-08 (Sitting A D1) — ONE REMOVAL PER DISTINCT SERVER NAME, and the reminder last.
        //
        // The remedy printed a SINGLE `claude mcp remove <server> -s local` while the findings named
        // two different server names, so following it cleared part of the mess and left the rest.
        // (The names are not spelled here: one of them is a retired name, and engine-lint L03
        // refuses it in source — including in a comment quoting it as the defect.)
        // And with nothing registered under THIS folder the remedy was only the backup reminder,
        // while the removal arrived on the renderer's `command` line below it — so "then review and
        // delete …" printed BEFORE the step it refers to.
        // ONE PER DISTINCT SERVER NAME. Deduping the rendered LINE was not enough: the same server
        // under this folder and under another produces two different "run from …" suffixes, so the
        // same removal was offered twice. The name is what the command acts on, so the name is the key.
        const removals = [];
        const offered = new Set();
        for (const e of [...here, ...elsewhere]) {
          if (offered.has(e.name)) continue;
          offered.add(e.name);
          const where = e.scope === 'this-folder' ? '(run from this folder)' : '(run from that folder)';
          removals.push(`${e.command}        ${where}`);
        }
        const remedyLines = [...removals, ...(backups.count > 0 ? [BACKUP_REMINDER] : [])];

        return warn(lines.join(' · '), {
          // ARC-08 (Sitting A D1) — the TEXT detail keeps the folders; the JSON one does not.
          // `checkToJson` copies an explicit list of fields, so a field it does not name cannot
          // reach a pasted report by accident — which is why this is a separate key rather than a
          // flag threaded through the renderer.
          textDetail: textLines.join(' · '),
          remedy: remedyLines.join('\n             → '),
          // `command` stays: the `--fix` report renders it as its own "run:" line, and dropping it
          // silently removed that. What changes is that the TEXT renderer no longer prints it a
          // second time below the remedy — which is what put the reminder above the step.
          command: here[0]?.command ?? elsewhere[0]?.command,
          data,
        });
      },
    }),

    defineCheck({
      id: 'E-24',
      section: 'legacy',
      title: 'legacy wizard store',
      severity: 'warn',
      quick: true,
      network: false,
      spawns: false,
      fixable: false,
      run: async (ctx) => {
        const home = ctx.home ?? '';
        // The HOME directory's `.config` on every OS, Windows included — the legacy store never
        // used the platform's own application-data directory (ARC-07-S08's finding, from the old
        // `config-store.ts`). Looking in the platform-correct place would look right and find
        // nothing. The home itself arrives in `ctx`; nothing under `lib/` reads it.
        const path = home ? join(home, ...LEGACY_STORE) : join(...LEGACY_STORE);
        const shown = tildify(path, home).split('\\').join('/');
        if (!home || !existsSync(path)) {
          return ok('no legacy wizard store', { path: shown, present: false, instances: null });
        }
        let instances = null;
        try { instances = countLegacyInstances(readFileSync(path, 'utf8')); } catch { instances = null; }
        const count = instances === null ? 'unreadable' : `${instances} instance(s)`;
        // The command is `docs/snippets/import-from-legacy.md`'s, and `tests/doctor/legacy.test.mjs`
        // asserts it appears there verbatim — the L07 idiom: several declarations that must agree,
        // enforced by a check, rather than a runtime read of a document that may not be beside the
        // code on a user's machine.
        return warn(`legacy wizard store ${shown} present (${count}; never read by this product)`, {
          remedy: `${cliOf(ctx)} instance import --from-legacy      `
            + '(migrates entries, then advises deleting the directory)',
          command: `${cliOf(ctx)} instance import --from-legacy`,
          data: { path: shown, present: true, instances },
        });
      },
    }),
    defineCheck({
      id: 'E-30',
      section: 'legacy',
      title: 'MCP registrations under folders that no longer exist',
      severity: 'warn',
      // NOT QUICK, and that is the whole reason this is a separate check rather than a branch
      // inside E-23 (ARC-08-C34). E-23 is `quick: true`, so it runs on the session-start path; this
      // one stats EVERY project folder in `~/.claude.json` — forty of them on the owner's machine —
      // and a `stat` against a client folder on a network mount that is not up blocks for the
      // mount's timeout. A session start is the worst place to inherit that.
      //
      // Nothing in this product branches on `ctx.quick` inside a check body: quick-ness is a
      // DECLARATION the planner acts on, so a check that behaved differently under `--quick` would
      // be a second definition of what quick means. The honest way off that path is to declare it.
      quick: false,
      network: false,
      spawns: false,
      // Never. Same rule as E-23: the file is Claude Code's, and the command is the user's to run.
      fixable: false,
      run: async (ctx) => {
        const home = ctx.home ?? null;
        const path = home ? join(home, CLAUDE_JSON) : null;
        if (!home || !existsSync(path)) return ok('no ~/.claude.json to read', { entries: [] });

        let parsed = null;
        try { parsed = JSON.parse(readFileSync(path, 'utf8')); } catch { parsed = null; }
        // A malformed file is E-23's finding to report, not this one's — two checks naming the same
        // parse error would tell a user to fix one thing twice.
        if (parsed === null) return ok('~/.claude.json is not readable as JSON; E-23 reports that',
          { entries: [] });

        const projects = parsed?.projects && typeof parsed.projects === 'object'
          ? parsed.projects : {};
        const entries = [];
        for (const [project, config] of Object.entries(projects)) {
          const servers = config?.mcpServers && typeof config.mcpServers === 'object'
            ? config.mcpServers : {};
          const names = Object.keys(servers);
          if (names.length === 0) continue;
          // THE ONLY QUESTION THIS CHECK ASKS. Not "is this key stale?" — E-23 owns that, and it
          // cannot reach an entry under this product's own key, because such an entry is a
          // registration this product made. Under an EXISTING folder that is another checkout and
          // removing it would delete a working install; under a MISSING folder nothing can start
          // there and `claude` keeps trying. So: does the folder exist, for ANY key.
          if (existsSync(project)) continue;
          for (const name of names) {
            entries.push({ name, project: tildify(project, home) });
          }
        }

        if (entries.length === 0) {
          return ok('no registration points at a folder that is gone', { entries: [] });
        }

        const folders = new Set(entries.map((e) => e.project));
        const byName = new Map();
        for (const e of entries) byName.set(e.name, (byName.get(e.name) ?? 0) + 1);
        const named = [...byName].map(([n, c]) => (c > 1 ? `${n} \u00d7${c}` : n)).join(', ');

        // TWO DETAILS, E-23's split reused unchanged (ARC-08 / ARC-10-S10 Sitting A D1). The folder
        // is what the user needs in order to act, and it is exactly what must never travel: on a
        // consultant's laptop these are client and engagement folder names, and the name is the
        // whole of the secret. So the terminal gets the path and `--json` gets counts and keys.
        //
        // THE REMOVE COMMAND IS PRINTED; THE FOLDER STEP IS CITED. `claude mcp remove` is keyed on
        // the absolute folder path, so the folder has to exist for the length of that one command —
        // and the page (`docs/MIGRATION.md` § 6) carries that recipe for both shells already. It is
        // not repeated here for two reasons: a second copy of a sentence is the thing this
        // repository keeps removing, and the sibling test "neither detector file can write, rename
        // or delete anything" forbids the write vocabulary in these two files by scanning their
        // source. That guard cannot tell a string a user will type from a call this code makes, and
        // weakening it so it could would cost more than citing a page section. `removalCommand` is
        // E-23's, so both checks print one spelling of the same command.
        const textLines = entries.map(({ name, project }) =>
          `"${name}" is registered under ${project}, which does not exist`);
        textLines.push('the folder must exist for the length of one command — re-create it, run the '
          + 'removal from inside it, then delete it again (docs/MIGRATION.md \u00a7 6, both shells):');
        for (const { name, project } of entries) {
          textLines.push(`  (from ${project}, re-created) ${removalCommand(name)}`);
        }

        return warn(`${entries.length} registration(s) under ${folders.size} folder(s) that no `
          + `longer exist: ${named}`, {
          // `command` travels, `project` does not — E-23's split exactly. The command names only
          // the key, so it carries nothing private; the folder is the secret and stays in the
          // terminal copy. `tests/migration-doc.test.mjs` reads `command` from here to prove the
          // page carries every command the legacy checks print.
          data: {
            entries: entries.map(({ name }) => ({ name, command: removalCommand(name) })),
            folders: folders.size,
          },
          textDetail: textLines.join('\n'),
          remedy: 'see docs/MIGRATION.md \u00a7 6 — the folder is re-created for one command, '
            + 'then removed',
        });
      },
    }),
  ];
}
