// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-06-S02 — the CLI frame: parse, dispatch, and refuse clearly.
//
// Long flags only. Short flags invite `-p` meaning preset in one command and password in another,
// and this CLI will grow sub-commands written months apart by different people. Everything a user
// can get wrong — an unknown command, an unknown flag, a missing value — ends in EXIT_USAGE with
// the usage block for what they were actually trying to do, never a stack trace.
import { EXIT_OK, EXIT_PREREQ, EXIT_USAGE } from './exit.mjs';
import { spellings } from './text.mjs';
import { cwdNote, loadConfig, root } from './config.mjs';
import { renderVersion, versionInfo } from './version-info.mjs';
import { createLogger } from './log.mjs';
import { USAGE as BOOTSTRAP_USAGE } from './bootstrap.mjs';
import { USAGE as MODE_USAGE } from './mode.mjs';
import { USAGE as INSTANCE_USAGE } from './instance.mjs';
import { USAGE as STORE_USAGE } from './store.mjs';
import { USAGE as UPGRADE_USAGE } from './commands/upgrade.mjs';
import { USAGE as STATUS_USAGE } from './commands/status.mjs';
import { USAGE as LICENCE_USAGE } from './commands/licence.mjs';
import { licenceStatus, REFUSED, refusalLines, refusesCommand } from './licence/state.mjs';
import { ensureIntegrity } from '../../../packages/snowarch/dist/licence/integrity.js';
import { localDir } from './local-paths.mjs';
import { productDir } from './spawn-env.mjs';
import { PRODUCT_KEYS } from './licence/keys.mjs';
import { USAGE as DOCTOR_USAGE, doctorCommand } from './doctor/index.mjs';

/** Flags every sub-command understands, so no sub-command has to remember them. */
const UNIVERSAL = ['json', 'quiet', 'verbose', 'help'];

/**
 * `--flag value`, `--flag=value`, and bare booleans — with repeats kept as an array.
 *
 * A repeated VALUE flag is not an error and not last-wins: `--area a --area b` means both, and a
 * parser that silently dropped one would make a wrong command look like a working one.
 *
 * ARC-07-C42 — A REPEATED DECLARED BOOLEAN IS THE ONE EXCEPTION, and it was a defect rather than a
 * choice. `--no-cache --no-cache` produced `[true, true]`, and `doctorCommand` asks
 * `flags['no-cache'] === true`; an array is not `true`, so **the doctor WROTE the cache it had twice
 * been told not to**. Measured, not reasoned: one flag leaves nothing in `.local/`, two leave
 * `doctor-last.json` and `doctor-last.inputs.json`. Five `=== true` reads in `doctor/index.mjs`
 * shared that cause, and the flag whose whole job is "do not write" is the worst place for a
 * silently inverted answer — a shell alias, a script that appends a flag, or typing it twice while
 * debugging is enough.
 *
 * The collapse is here rather than at the five reads because a boolean is only KNOWN to be one here,
 * in `bool`: `--area a --area b` still means both, and a repeated boolean now means what it says. The
 * reasoning above does not transfer to it — `--no-cache --no-cache` is not a command whose meaning
 * was dropped, it is a redundant one, and there is nothing for an array to carry. Nothing counts
 * repeats either: `cli.mjs`'s own dispatch already reads `Boolean(flags.quiet)`.
 */
export function parseArgs(argv, { booleans = [] } = {}) {
  const flags = Object.create(null);
  const positional = [];
  const bool = new Set([...UNIVERSAL, ...booleans]);
  const errors = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) { positional.push(arg); continue; }
    if (arg === '--') { positional.push(...argv.slice(i + 1)); break; }

    const eq = arg.indexOf('=');
    const name = (eq === -1 ? arg.slice(2) : arg.slice(2, eq));
    if (!/^[a-z][a-z0-9-]*$/.test(name)) { errors.push(`malformed flag "${arg}"`); continue; }

    let value;
    if (eq !== -1) value = arg.slice(eq + 1);
    else if (bool.has(name)) value = true;
    else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) { value = argv[i + 1]; i += 1; }
    else { errors.push(`--${name} needs a value`); continue; }

    // A declared boolean repeated stays a boolean; anything else accumulates. `bool.has(name)` alone
    // is not the test — `--json=false` is a declared boolean carrying a STRING, and collapsing repeats
    // of that to `value` would keep the string, which is what the `=== true` readers already see
    // today. That `--json=false` enables `--json` is a separate defect and not this row's; this branch
    // deliberately does not pretend to fix it.
    if (name in flags) flags[name] = bool.has(name) && value === true ? true : [].concat(flags[name], value);
    else flags[name] = value;
  }
  return { flags, positional, errors };
}

const PLACEHOLDER = (name, story) => ({
  summary: `${name} — not available in this build`,
  // ARC-07-C31 — A FUNCTION OF `where`, like every usage in this table now. NOTE FOR A REVIEWER:
  // nothing constructs `PLACEHOLDER` today; it is swept with the rest because a dead branch that
  // spells the launcher by hand is the one a future caller would copy.
  usage: (where) => `usage: ${spellings(where).cli} ${name} …\n\n`
    + `  Not available in this build; ${story} adds it.`,
  run: ({ log }) => {
    log.fail(`"${name}" is not available in this build — ${story} adds it`);
    return EXIT_USAGE;
  },
});

/**
 * `version`, and everything in it read from a file.
 *
 * Not one literal: the version comes from `package.json`, the floors and the docs pin from
 * `engine.config.json`, the sha from the built contract. A hard-coded floor here would be a second
 * declaration of a number the bootstrap enforces, and the two would part company.
 */
function versionCommand({ flags, log }) {
  // ARC-09-S04: the facts come from `versionInfo()`, which the DOCTOR also calls. Two readers of
  // "what is this checkout" would eventually disagree, and the moment they did, `/snowarch status`
  // would quote one of them while the tag said the other.
  const info = versionInfo(root);
  if (flags.json) { log.json(info); return EXIT_OK; }
  for (const line of renderVersion(info)) log.step(line);
  return EXIT_OK;
}

/**
 * `docs`, mounted on ARC-03's library rather than reimplemented.
 *
 * `scripts/docs.mjs` was the interim entry point and is now a shim over this same function, so the
 * npm scripts, CI and the two workflows keep working byte-for-byte and there is one implementation
 * of every sub-command. A test asserts the two entry points agree.
 */
async function bootstrapCommand(args) {
  const { bootstrapCommand: run } = await import('./bootstrap.mjs');
  return run(args);
}

async function docsCommand({ argv }) {
  const { runDocs } = await import('./docs/cli.mjs');
  return runDocs(argv);
}

async function modeCommand(args) {
  const { modeCommand: run } = await import('./mode.mjs');
  return run(args);
}

async function instanceCommand(args) {
  const { instanceCommand: run } = await import('./instance.mjs');
  return run(args);
}

async function storeCommand(args) {
  const { storeCommand: run } = await import('./store.mjs');
  return run(args);
}

// Lazy, like `upgrade`: `status` pulls the whole doctor in, and `./snowarch version` must not.
async function statusCommand(args) {
  const { statusCommand: run } = await import('./commands/status.mjs');
  return run(args);
}

async function upgradeCommand(args) {
  const { upgradeCommand: run } = await import('./commands/upgrade.mjs');
  return run(args);
}

async function licenceCommand(args) {
  const { licenceCommand: run } = await import('./commands/licence.mjs');
  return run(args);
}

export const COMMANDS = {
  // `readOnly`: it reads three files and prints. ARC-07-C33 — it used to leave `.local/logs/version-*.log`.
  version: { summary: 'print the version, the release tag, the commit, the contract sha and the floors',
    run: versionCommand, readOnly: true,
    usage: (where) => `usage: ${spellings(where).cli} version [--json]` },
  docs: { summary: 'sync, verify, describe or re-family the documentation corpus', run: docsCommand,
    usage: (where) => `usage: ${spellings(where).cli} docs (sync | verify | status | family) …\n\n`
      + `  Run \`${spellings(where).cli} docs\` with no sub-command for the full flag list.` },
  bootstrap: { summary: 'install this checkout: plan, then the numbered steps, resumable',
    run: bootstrapCommand, usage: BOOTSTRAP_USAGE, booleans: ['yes', 'reset', 'skip-claude-check'],
    defersLog: true },
  mode: { summary: 'switch this checkout between design-only and live, or report which it is',
    run: modeCommand, usage: MODE_USAGE,
    // BARE `mode` REPORTS; `mode live` and `mode design` rewrite the toggles and must keep their log.
    readOnly: ({ positional }) => positional.length === 0,
    booleans: ['yes', 'ack-user-scope', 'skip-claude-check'] },
  // ARC-08-S01: the framework ships with an EMPTY registry — the runner, the schema, the renderer
  // and the exit codes are the product here, and S02-S04 add checks to it. An empty run that says
  // "0 ok, 0 warn, 0 fail" and exits 0 is the first thing a check harness has to get right.
  doctor: { summary: 'check this checkout and report what to do about it', run: doctorCommand,
    usage: DOCTOR_USAGE, booleans: ['quick', 'no-network', 'fix', 'yes', 'no-cache', 'write-cache'] },
  // `raw`: everything after `instance` is the server CLI's, unparsed and unanswered — including
  // `--help` once a sub-command is named. Only a bare `./snowarch instance --help` is this
  // frame's, and the forwarder itself answers that one.
  instance: { summary: 'add and manage the ServiceNow instances this checkout can reach',
    run: instanceCommand, usage: INSTANCE_USAGE, defersLog: false, raw: true },
  // `raw` for the same reason `instance` is: `store restore <file> --yes` is the server CLI's
  // sentence, and a frame that parsed it would answer `--yes needs a value`.
  store: { summary: 'migrate, back up and restore the instance store',
    run: storeCommand, usage: STORE_USAGE, defersLog: false, raw: true },
  // NOT raw: every flag here is this frame's, and the command spawns `bootstrap` and `doctor`
  // with arguments it composes itself rather than passing a user's through.
  // ARC-08-C18 — the panel, as a command a person can type. It renders the quick doctor
  // IN-PROCESS: a session's first line is on a budget ARC-09-C8 measured in milliseconds, and
  // spawning `doctor --quick --json` to read its stdout spends a Node start-up before the first
  // check runs. `--json` prints that report unchanged rather than a shape of its own.
  status: { summary: 'the one-screen panel: mode, engine, docs, roster, instances and the quick doctor',
    run: statusCommand, usage: STATUS_USAGE },
  upgrade: { summary: 'move this checkout to a release, re-run only what changed, and check it',
    run: upgradeCommand, usage: UPGRADE_USAGE,
    booleans: ['check', 'yes', 'pre', 'force-floor'] },
  // ARC-11-C1 — `readOnly`: no log file for any sub-command. The owner's four name licensees and key paths,
  // and a per-run log under `.local/logs/` is a copy of both that nobody asked to keep.
  licence: { summary: 'show, verify and check this checkout\'s licence; the owner issues and revokes them',
    run: licenceCommand, usage: LICENCE_USAGE, booleans: ['refresh', 'perpetual'], readOnly: true },
};

/**
 * ARC-07-C31 — `where` is a PARAMETER with the process as its default, not a read inside the body.
 *
 * The default keeps every existing caller — `main`, `bin/snowarch.mjs`, `cli.test.mjs` — writing
 * `helpText()` and getting the shell in front of them, which is what a terminal should show. The
 * parameter is what lets a case drive the Windows rendering by argument: ARC-07 measured forcing
 * `process.platform` as unusable locally, because `win32.resolve` on POSIX paths fails everything.
 */
export function helpText(where) {
  const width = Math.max(...Object.keys(COMMANDS).map((k) => k.length));
  const lines = [`usage: ${spellings(where).cli} <command> [options]`, '', 'commands:'];
  for (const [name, c] of Object.entries(COMMANDS)) {
    lines.push(`  ${name.padEnd(width)}  ${c.summary}`);
  }
  lines.push('', 'every command understands: --json --quiet --verbose --help');
  lines.push('exit: 0 ok · 1 failed · 2 usage · 3 prerequisite missing · 130 interrupted');
  return lines.join('\n');
}

/**
 * ARC-11-C141 — BEFORE ANY COMMAND, the Architect's own files are put back if they were changed (the owner's ruling,
 * 2026-10-14): the command then runs on the signed tree, and the one line saying so goes to stderr. A checkout whose
 * files cannot be put back is returned `refused`, and `main` refuses outside the repair set as a refused licence does.
 * The stat key keeps the common case at a walk and a `stat` per covered file. Exported for its cases; `main` is its
 * one caller.
 */
export function integrityGate({ root: at, err, cli, keys = PRODUCT_KEYS }) {
  const integrity = ensureIntegrity(at, { local: localDir(at), cli, projectDir: productDir(at), keys });
  if (integrity.state === 'restored') err.write(`${integrity.line}\n`);
  return integrity;
}

/** What a refused command prints: the licence's refusal when it is refused, which is asked first (Q6), else the tree's. */
export function refusalFor(name, licence, integrity, cli) {
  if (REFUSED.includes(licence.state)) return refusalLines(name, licence, cli);
  return [`snowarch ${name}: this command does not run while the AI Architect's own files cannot be restored`, integrity.line];
}

export async function main(argv, { out = process.stdout, err = process.stderr, home = '',
  platform = process.platform, env = process.env } = {}) {
  // ARC-07-C31 — ONE `where`, built once and threaded, so the help, the usage and the
  // unknown-command line cannot render three different shells in one run. Defaulted to the
  // process: this is a terminal, and the reader's own shell is the right answer here.
  const where = { platform, env };
  const [name, ...rest] = argv;

  if (name === undefined || name === 'help' || name === '--help') {
    out.write(`${helpText(where)}\n`);
    return EXIT_OK;
  }
  const command = COMMANDS[name];
  if (!command) {
    err.write(`snowarch: unknown command "${name}" — run ${spellings(where).cli} help\n`);
    return EXIT_USAGE;
  }

  // A RAW command's arguments belong to another program, so this frame must not read them at all.
  // Parsing them was the bug: `instance add … --yes` ended in "--yes needs a value" — `--yes` is
  // not in THIS table's booleans, so the last flag on the line looked like one awaiting a value —
  // and `instance add --help` was answered with the forwarder's one-line usage instead of the
  // server's. Both are the same mistake, that a pass-through may still be inspected on the way
  // through. `docs` was the half-measure: it parses, then its errors are ignored below.
  const { flags, positional, errors } = command.raw
    ? { flags: Object.create(null), positional: [], errors: [] }
    : parseArgs(rest, { booleans: command.booleans ?? [] });
  // ARC-07-W17 — A USAGE MAY BE A FUNCTION. The doctor's has to be: deriving its launcher through
  // `spellings()` at module load throws inside the `panel -> text -> report-text -> panel` cycle, so
  // it is evaluated when it is printed. Resolved in one place, so every command may do the same.
  const usageOf = (c) => (typeof c.usage === 'function' ? c.usage(where) : c.usage);
  if (flags.help) { out.write(`${usageOf(command)}\n`); return EXIT_OK; }
  if (errors.length > 0 && name !== 'docs') {
    // `docs` parses its own arguments — it has sub-commands of its own — so the frame does not
    // second-guess a flag it has no table for.
    for (const e of errors) err.write(`snowarch ${name}: ${e}\n`);
    err.write(`${usageOf(command)}\n`);
    return EXIT_USAGE;
  }

  /*
   * ARC-11-C1 and C6 — NO VALID LICENCE, NO COMMAND (ruling R1), on every build — except the ones that see,
   * repair, install and uninstall: licence, doctor, status, version, upgrade, bootstrap and `mode design`. Here,
   * after the help and the usage errors and before the logger, so a refused command has written nothing — not
   * even a log — when it says so. One decision, refusesCommand: reading the licence for an allowed command costs
   * two small files, which the session hook reads at every start anyway.
   */
  const licence = licenceStatus(root);
  const integrity = integrityGate({ root, err, cli: spellings(where).cli });
  if (refusesCommand(name, licence, positional, integrity)) {
    for (const line of refusalFor(name, licence, integrity, spellings(where).cli)) err.write(`${line}\n`);
    return EXIT_PREREQ;
  }

  /*
   * ARC-07-C33's residual — A RUN THAT WRITES NOTHING LEAVES NO LOG.
   *
   * `readOnly` is a FUNCTION where the answer depends on the arguments, which it does for `mode`: bare it
   * reports, and `mode live` rewrites the toggles. A static flag would have had to pick one of those and be
   * wrong about the other.
   */
  const readOnly = typeof command.readOnly === 'function'
    ? command.readOnly({ positional, flags }) : Boolean(command.readOnly);
  const log = createLogger({
    command: name, quiet: Boolean(flags.quiet), verbose: Boolean(flags.verbose),
    json: Boolean(flags.json), defer: Boolean(command.defersLog), noFile: readOnly, out, err,
  });
  const note = cwdNote();
  if (note) log.note(note);

  // `positional` is passed as well as `flags`: `mode live` is an argument, not a flag, and a
  // sub-command that had to re-parse `argv` to find it would be a second parser with a second
  // opinion about `--`.
  // `home` comes from the ENTRY POINT: nothing under `lib/` reads the home directory itself
  // (the repo-wide rule), and the doctor needs it only to shorten a path to `~` in a report.
  // `env` since ARC-11-C1: the licence command reports enforcement from the environment `main` was given.
  const code = await command.run({ flags, positional, argv: rest, log, root, out, err, home, env });
  log.commit();          // a deferred logger that was never committed still gets its lines on disk
  return code;
}
