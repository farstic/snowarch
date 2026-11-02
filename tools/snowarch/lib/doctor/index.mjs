// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-08-S01 — the `doctor` command: decide whether it can run at all, then run it.
//
// THE THREE THINGS THAT STOP IT are checked before any check is registered, because each of them
// makes every check meaningless and a report full of failures caused by one of them is a report
// that hides its own cause:
//
//   not at the repository root  →  exit 3, and the remedy is `cd`
//   `engine.config.json` unparsable  →  exit 3, naming the file
//   Node below the floor  →  exit 3, with the per-OS install command
//
// Everything else is a check result. Exit 1 means at least one FAIL; exit 0 means none, warnings
// included; exit 2 is a usage error, which is a fact about the command line rather than the
// checkout.
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { bootstrapOf, cliOf, spellFor } from './spell.mjs';
import { spellings } from '../text.mjs';
import { loadStateOrReason } from '../state.mjs';
import { dirname, join, resolve } from 'node:path';
import { statePath, storePath } from '../local-paths.mjs';

import { loadContract } from '../../../../packages/contract/lib/contract.mjs';
import { EXIT_OK, EXIT_USAGE, EXIT_PREREQ } from '../exit.mjs';
import { meetsFloor } from '../versions.mjs';
import { childEnv } from '../spawn-env.mjs';

import { SECTIONS } from './registry.mjs';
import { askOnce } from '../ask.mjs';
import { versionInfo } from '../version-info.mjs';
import { engineBlock, engineRegistry, serverBlock, staleBlock,
  summariseMerged } from './checks/index.mjs';
import { deriveMode, modeLine, modeLineDetailed } from './mode.mjs';
import { applyPlan, buildPlan, fixesBlock, logFix, renderPlan } from './fix.mjs';
import { cacheStale, writeReportCache } from '../doctor-cache.mjs';
import { contractSha, root as configRoot, version as engineVersion } from '../config.mjs';
import { collectPrereqs } from './prereqs.mjs';
import { buildReport } from './report-json.mjs';
import { configuredDocs } from '../docs/status.mjs';
import { effectiveDocsMode } from '../docs/sync.mjs';
import { renderText, useColour } from './report-text.mjs';
import { exitCodeFor, runChecks, selectSections } from './runner.mjs';
import { maskForJson, storeMaskValues } from './json-boundary.mjs';
import { readStoreSummaries } from '../../../../packages/snowarch/dist/store/label.js';

/**
 * ARC-07-W17 — A FUNCTION, and the reason is a cycle rather than a preference.
 *
 * This was `export const USAGE = [...].join('\n')` with the launcher spelled `./snowarch`. Deriving it
 * needs `spellings()`, and calling that at MODULE LOAD from here throws: `panel.mjs` imports
 * `text.mjs`, `text.mjs` imports `doctor/report-text.mjs`, `report-text.mjs` imports `panel.mjs`, and
 * this module sits in that graph — so `isWindowsShell` is not initialised yet and the whole doctor
 * fails to import. Forty cases went red on exactly that before this was lazy.
 *
 * `cli.mjs` resolves a `usage` that is a function, so every command may spell its launcher lazily.
 *
 * IT TAKES AN OPTIONAL SHELL so a case can assert the Windows rendering without forcing
 * `process.platform`, which ARC-07 already measured as unusable locally — `win32.resolve` on POSIX
 * paths makes everything fail. `cli.mjs` calls it with nothing, which is the running process.
 */
export const USAGE = (where) => [
  `usage: ${spellings(where).cli} doctor [--json] [--quick] [--no-network] [--fix] [--section <a,b>] [--no-cache]`,
  '',
  `  --section <a,b>   only these sections: ${SECTIONS.join(', ')} (server = every SV- check)`,
  '  --quick           the fast subset; implies --no-network and skips anything that spawns',
  '  --no-network      skip every check that would contact the network',
  '  --fix             repair what is marked fixable (ARC-08-S06)',
  '  --json            the machine-readable report (schema 1). This is the form that travels:',
  '                    instance labels and hosts are masked; machine consumers use the report object.',
  '  --no-cache        do not write .local/doctor-last.json',
  '',
  'exit codes:',
  '  0  no FAIL (warnings allowed)',
  '  1  at least one FAIL',
  '  2  usage — an unknown flag or section',
  '  3  the doctor could not run at all',
].join('\n');

/** The message a run from a sub-directory gets. One sentence, and the command that fixes it. */
/**
 * `who` names the command that printed it. ARC-08-C18 — `./snowarch status` shares this preamble
 * with the doctor, and a `DOCTOR:` prefix on the output of a command nobody ran would send a reader
 * looking for a doctor run that never happened. Default unchanged, so every existing caller and the
 * line `framework.test.mjs` pins are exactly as they were.
 */
export const notAtRoot = (root, who = 'DOCTOR') => `${who}: not at the repository root — run: cd ${root}`;

/**
 * Walk up for `engine.config.json`, and stop at the git top level.
 *
 * `lib/config.mjs` resolves the root from the MODULE's own location, which is right for a launcher
 * that is always inside the checkout. The doctor answers a different question — "is the user's
 * current directory inside a checkout, and which one" — so it walks from the cwd, and the answer
 * `no` is exit 3 rather than a guess.
 */
/** `realpathSync.native` where it works, the path itself where it does not (a path not yet there). */
function realpathOrSelf(p) {
  try { return realpathSync.native(p); } catch { return p; }
}

/**
 * The engine's version, or `null`.
 *
 * A checkout with no `package.json` is not one anybody should be running from — E-05 says so — but
 * the doctor is the tool people run BECAUSE something is wrong, and dying while assembling a
 * report about a broken checkout is the one failure mode it cannot have.
 */
function readVersion(root) {
  try {
    return engineVersion(root);
  } catch {
    return null;
  }
}

/**
 * Is the server enabled for this checkout? The toggle file decides, and only the toggle file.
 *
 * `disabledMcpjsonServers` wins over `enabledMcpjsonServers` in Claude Code, so the question is
 * "is the key on the disabled list", not "is it on the enabled one". An absent file means nothing
 * has disabled it.
 */
export function serverEnabled(root, config) {
  try {
    const settings = JSON.parse(
      readFileSync(join(root, '.claude', 'settings.local.json'), 'utf8'));
    const disabled = Array.isArray(settings.disabledMcpjsonServers)
      ? settings.disabledMcpjsonServers : [];
    return !disabled.includes(config?.mcp?.serverKey);
  } catch {
    return true;
  }
}

/** The recorded mode, or `null`. An unreadable state file is E-11's finding, not this one's. */
export function readMode(root) {
  try {
    return JSON.parse(readFileSync(statePath(root), 'utf8'))?.mode ?? null;
  } catch {
    return null;
  }
}

export function findRoot(from) {
  let current = resolve(from);
  for (;;) {
    if (existsSync(join(current, 'engine.config.json'))) return current;
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

/**
 * The whole command.
 *
 * `registry` is injected so a test can register exactly the checks its case needs — the default is
 * the engine's twenty-three (ARC-08-S02), and a test that wants one check does not get the other
 * twenty-two's answers in its assertions.
 */
/**
 * THE RUN, without a terminal: every caller that wants the REPORT rather than an exit code.
 *
 * ARC-06's B08 is the second caller (it verifies the server after an install), and before this it
 * had its own handshake, its own comparisons and its own cache write — three implementations of
 * what the doctor already does, kept in step by nothing. A step that wants "is the server right?"
 * asks the thing whose job that is.
 *
 * `writeCache: true` overrides the section rule for exactly that caller: B08 runs `--section
 * server` and its answer IS what the banner should hold after an install.
 */

/**
 * The store's instances, named, for a run that did not spawn the server — ARC-08-C17.
 *
 * `SNOW_STORE` first, because that is the precedence the server itself uses and a doctor that
 * disagreed with the server about WHICH store it is reading would answer a different question
 * from the one asked.
 */
function storeSummaries(root, config) {
  const path = process.env.SNOW_STORE || storePath(root);
  try {
    return readStoreSummaries(path).map((i) => ({ ...i, status: 'configured' }));
  } catch {
    return [];
  }
}

export async function runDoctor({ root, config, registry = engineRegistry(), sections = null,
  quick = false, noNetwork = false, fix = false, section = null, writeCache = 'auto', exclude = [],
  env = process.env, home = '', now = () => Date.now(), started = null,
  // ARC-07-W17 — the PLATFORM, so the Mode line's spelling is the one this run was TOLD about rather
  // than the machine's. A fixture capture pins it (`make-status-fixtures.mjs` passes `linux`), which is
  // what stops a committed fixture depending on the shell that captured it.
  platform = process.platform } = {}) {
  const startedAt = started ?? now();
  const options = { quick, noNetwork: noNetwork || quick, fix, section, sections, exclude };

  let contract = null;
  try {
    contract = loadContract({ root, verifyPin: false });
  } catch { contract = null; }

  const ctx = {
    root,
    config,
    contract,
    // The recorded mode, read once: an absent server dependency is the DESIGN in design-only and a
    // broken install in live, and the checks that say so must not each re-read the state file.
    mode: readMode(root),
    flags: options,
    platform: process.platform,
    env: childEnv(root),
    // ARC-11-C1, completing ARC-07-W17 for the CHECKS: the shell this run was TOLD about, as spelled
    // launchers. `platform` and `env` above stay the machine's, because what a check MEASURES (file
    // modes, paths, a binary on PATH) is the machine's; what a check TELLS the reader to type is the
    // told shell's, exactly as the Mode line already is. E-31 was the first quick check whose committed
    // fixture names a launcher, and the Windows cells rendered `.\snowarch.cmd` into a POSIX fixture.
    // In production the told shell IS the machine's, so nothing a user sees changes.
    spell: spellFor({ platform, env }),
    // Supplied by the entry point. Nothing under `lib/` reads the home directory itself — the
    // repo-wide rule — and the doctor needs it only to shorten a path to `~` in a report.
    home,
    /**
     * THE CLOCK CONTRACT: `ctx.now()` returns EPOCH MILLISECONDS, never a `Date` (ARC-09-C31).
     *
     * It is a number because that is what the runner does arithmetic on — `now() - started` for
     * every check's `durationMs` — and because `Date.now()` is what a caller reaches for. Every
     * consumer that needs a `Date` writes `new Date(ctx.now())`, as this file already does in
     * three places.
     *
     * E-28 did not, and took the doctor's release-currency check down with
     * `now(...).toISOString is not a function` the first time a release tag existed to compare
     * against. `tests/doctor/clock-contract.test.mjs` now refuses a `ctx.now` in any check that is
     * not wrapped, in both directions.
     */
    now,
  };

  const checks = registry.all();
  const { results } = await runChecks(checks, ctx, { ...options, home });
  // The merged summary, not the runner's: one condition that two checks report from different
  // angles (E-25's checkout and SV-02's store, both cloud-synced) is one thing to fix.
  const summary = summariseMerged(results, checks);

  // `null` when no server check ran, which since ARC-09-C8 includes every `--quick` run: the
  // section left that subset because entering it costs one in-process run of the server's own
  // doctor. Schema v1 already says what null means here — "no check filled it" — and every
  // consumer reads it that way, so this needs no third state and gets none.
  const server = ctx._server === undefined ? null : serverBlock(ctx._server);
  const instances = server?.instances ?? [];
  // The mode: derived here, from the toggle file and the store, and from nothing else. Not from
  // `~/.claude.json`, which belongs to Claude Code and describes a registration rather than a
  // configuration (`00` P-05/P-21).
  // ARC-08-C17 — when the server was not spawned, the STORE answers. `instances` above is the
  // server's report, and a quick run has none, so an empty list used to mean "design-only" when it
  // meant "nobody asked". This read is SV-03's cheap half: no probe, no network, no spawn.
  const probed = ctx._server !== undefined;
  const fromStore = probed ? [] : storeSummaries(root, config);
  const derived = deriveMode({
    toggles: { enabled: serverEnabled(root, config) },
    instances: probed ? instances : fromStore,
    probed,
    bootstrapped: existsSync(statePath(root)),
    // ARC-08-C16 — which entry carries the server. Our own record, read from
    // `bootstrap-state.json`; NOT `~/.claude.json`, which this module promises never to read.
    // ARC-07-C37 — `'project'` is the DERIVATION's default and stays one, but the read no longer
    // swallows every error to get there: a `TypeError` from a bad call reached this `catch` and became
    // a confident `'project'`, which then fed the Mode line. What an unreadable file means for the
    // report is E-11's to say, and it does; what this needed was to stop hiding a defect in our code.
    registration: loadStateOrReason(root, spellings({ platform, env })).state?.registration ?? 'project',
    // ARC-07-W17 — the doctor renders for the shell it was TOLD about, so a fixture capture can pin it
    // and a committed fixture stops depending on the capturing machine.
    spell: spellFor({ platform, env }),
  });
  const data = (id) => results.find((r) => r.id === id)?.data ?? null;
  const toolCount = data('SV-05')?.toolCount ?? null;

  // ARC-08-C19 — the instances REACH THE REPORT. `fromStore` above is computed on every unprobed
  // run and was handed to `deriveMode` and then dropped, so a quick run knew the labels and threw
  // them away — the third time this shape has turned up (ARC-07-C5, ARC-09-C46). The source rides
  // with them because the two are different facts: the store knows what is configured, the server
  // knows whether it works.
  //
  // ONE SHAPE, WHATEVER THE SOURCE — and narrowed on purpose. The server's own entries carry a
  // `username`; copying them wholesale put a masked account name into a NEW key, and the doctor
  // cache's redaction test caught it within the hour (`an address-shaped string survived in the
  // cache`). The panel renders a label, an environment and a preset, so that is what the key
  // holds: a report that travels — into the cache, into an issue template — must not carry a field
  // nothing reads. The server's richer view stays under `server`, where the redactor already
  // knows about it.
  const summarise = (list) => list.map((i) => ({
    label: i.label,
    environment: i.environment ?? null,
    preset: i.preset ?? null,
    ...(i.default === true || i.isDefault === true ? { default: true } : {}),
  }));
  const instanceBlock = probed
    ? (instances.length > 0 ? { source: 'server', entries: summarise(instances) } : null)
    : (fromStore.length > 0 ? { source: 'store', entries: summarise(fromStore) } : null);

  const report = buildReport({
    results,
    checks,
    summary,
    options,
    root,
    durationMs: now() - startedAt,
    mode: derived.mode,
    modeLine: modeLine(derived, { summary, at: new Date(now()) }),
    modeLineDetailed: modeLineDetailed(derived, {
      contract,
      instances,
      // ARC-08-C21 — the SERVER's effective flags when it answered, the STORE's when it did not.
      //
      // `instances` is the server's list and is empty on every `--quick` run since ARC-09-C8, so
      // this resolved to `null` and the line printed six `off`s about an instance whose store says
      // otherwise. `fromStore` already carries `effectiveFlags`, computed by the server's own
      // `expandPreset` + `applyDependencyRule` rather than a second encoding of the rule — so the
      // quick path states what the server would gate on, and says nothing when the store could not
      // be read at all.
      flags: (probed ? instances : fromStore)
        .find((i) => i.label === derived.instance?.label)?.effectiveFlags ?? null,
      toolCount: toolCount === null
        ? (contract ? { count: contract.tools.length, source: 'contract' } : null)
        : { count: toolCount, source: 'server' },
    }),
    // ONE source for the header (ARC-09-S04). It read the version and the sha for itself until
    // then, which is two programs answering "what is this checkout" from two readers — and the day
    // they disagreed, `/snowarch status` would quote one while the tag said the other.
    // `full: false` — the header takes `version`, `tag.name` and `contractSha`. The tag's message,
    // the shallow hint and the commit state are for the human lines and cost three more `git`
    // spawns, on the path the SessionStart banner runs before a session's first word.
    engine: engineBlock(results, versionInfo(root, { full: false, config }),
      // ARC-08-C19 — when E-12 did not run, `engine.docs` came back null and the panel's `Docs:`
      // line vanished on the one run SKILL.md mandates. The fallback is the CONFIGURED corpus plus
      // one bounded `rev-parse`; every field it cannot know stays null, which schema v1 already
      // reads as "no check filled it". Computed only when the checks did not fill it, so a full
      // run's measured answer is never replaced by a cheaper one.
      { docsFallback: () => configuredDocs({ root }) }),
    instances: instanceBlock,
    // ARC-08-C24 — E-04's packs live under `engine.capabilities` and NOWHERE ELSE.
    //
    // They were written twice, from the same expression, at two sites a hundred lines apart:
    // `engineBlock` filled `engine.capabilities` and this block filled `prereqs.capabilities`. The
    // two agreed only because both read `data('E-04')?.packs` — so the day either site changed,
    // the panel (which reads `engine`) and the doctor's own text report (which read `prereqs`)
    // would have disagreed about the same check's answer, with nothing to notice. One check, one
    // key: `prereqs` carries what `collectPrereqs` measures and the capability packs are not
    // among them.
    prereqs: collectPrereqs({ root, config, env }),
    // Filled by ARC-08-S03's detectors, from their own results — `null` until one of them ran, so
    // a `--section contract` run does not claim there are no leftovers.
    stale: results.some((r) => ['E-23', 'E-24'].includes(r.id) && r.status !== 'skip')
      ? staleBlock(results)
      : null,
    // Filled by ARC-08-S04 from the server module's own report — `null` when no SV check ran, so a
    // `--section docs` run does not claim to know anything about the server.
    server,
  });

  // The cache is what the banner reads when it has 300 ms and no Node. A PARTIAL report must never
  // land there: `--section docs` would tell the banner that thirty checks it never ran had passed.
  // `--no-cache` is the same decision, made by the user.
  const auto = writeCache === 'auto' ? sections === null : writeCache === true;
  let cacheError = null;
  if (auto) {
    try {
      writeReportCache(root, report, { now: new Date(now()) });
    } catch (e) {
      cacheError = e.message;
    }
  }
  // `results` is the runner's own, still carrying terminal-only fields (`textDetail`) that
  // `checkToJson` strips from `report` because they must never travel (ARC-08-C34). The text
  // renderer needs them; `--json` and the cache are built from `report` and do not see them.
  return { report, checks, summary, derived, cacheError, ctx, results };
}

/**
 * `--fix`: run, propose, apply, run again.
 *
 * The second run is not a formality — it is the answer. A repair that reported `applied` and left
 * a check failing is exactly the outcome a user cannot see from a plan, so the exit code and the
 * report they read are the RE-RUN's, and the fixes are listed above it.
 */
export async function fixCommand({ root, config, registry, options, env, home, now, write, ask,
  // ARC-07-W17 — threaded through the fix path too: both its `runDoctor` passes render a Mode line, and
  // a fix run on Windows must spell the launcher the way that shell does.
  platform = process.platform,
  yes = false, deps = {} }) {
  // `write` here is the NARRATION channel, not stdout. Under `--json` the caller hands us stderr:
  // a plan printed above the object made `JSON.parse(stdout)` fail on the first character, which
  // is the whole contract `--json` has with a script.
  const first = await runDoctor({ root, config, registry, ...options, env, home, now, platform,
    // The first pass never writes the cache: it describes a checkout that is about to change.
    writeCache: false });

  // ARC-07-C37 — the fix planner tolerates an unreadable state (there is nothing to plan from) and no
  // longer tolerates a programming error that looks like one.
  const { state } = loadStateOrReason(root, spellings({ platform, env }));
  const plan = buildPlan(first.report, {
    stale: options.sections === null ? cacheStale(root) : null,
  });
  write(renderPlan(plan));

  if (plan.actions.length === 0) {
    return { applied: [], report: first.report, checks: first.checks, skipped: true };
  }
  if (!yes) {
    const answer = ask ? await ask() : null;
    // Enter applies (principle 10: propose → review → apply); anything else, including a closed
    // stdin, is a no. A non-interactive caller that means yes says `--yes`.
    const said = String(answer ?? '').trim().toLowerCase();
    if (answer === null || !(said === '' || said === 'y' || said === 'yes')) {
      write('nothing applied.');
      return { applied: [], report: first.report, checks: first.checks, declined: true };
    }
  }

  const fixCtx = {
    root,
    config,
    env,
    platform: process.platform,
    mode: state?.mode ?? null,
    docsMode: effectiveDocsMode(state?.docs),   // ARC-09-C244
    registration: state?.registration ?? 'project',
    storePath: storePath(root),
  };
  const applied = await applyPlan(plan, fixCtx, deps);
  for (const entry of applied) {
    write(`  ${entry.id}  ${entry.result}${entry.detail ? ` — ${entry.detail}` : ''}`);
  }
  logFix(root, applied);

  // The same options, so the second report is comparable with the first — and this one caches.
  const second = await runDoctor({ root, config, registry: registry ?? engineRegistry(), ...options,
    platform,
    env, home, now });
  return { applied, report: second.report, checks: second.checks, cacheError: second.cacheError,
    results: second.results };
}

/**
 * One line from stdin, or `null` at end of input.
 *
 * The comment here used to say "the same reader the plan screen uses", which was a claim about two
 * copies rather than a shared one. ARC-09-S01 made it true: `lib/ask.mjs`.
 */
const defaultAsk = (input) => askOnce(input);

/**
 * The four things that must be true before any check can run — resolved once, for two commands.
 *
 * ARC-08-C18 extracted this from `doctorCommand`, where it was inline, because `./snowarch status`
 * needs the identical four and a second copy is a second answer to "where am I and can I run".
 * Each returns a `problem` rather than writing or throwing, so the caller owns its own stream and
 * its own exit — and `who` puts the caller's name on the sentence, since a reader who typed
 * `status` should not be told what the doctor thinks.
 *
 * The order is the dependency order, not a preference: there is no config to read until the root is
 * known, and no floor to compare until the config is read.
 */
export function resolveCheckout({ cwd = process.cwd(), who = 'DOCTOR', node = process.versions.node,
  install = configRoot } = {}) {
  const fail = (message, exit = EXIT_PREREQ) => ({ problem: { message, exit } });

  const root = findRoot(cwd);
  // Nothing above this directory is a checkout. ARC-09-C157 — the launcher that ran this is in one, though: it is the
  // install the reader meant, so the sentence names it (the Windows colleague, 2026-10-15, one folder above it). Only a
  // launcher outside any checkout leaves nothing to name, and then the sentence says what it does not know.
  if (!root) {
    const known = install && existsSync(join(install, 'engine.config.json'));
    return fail(notAtRoot(known ? install : '<the checkout>', who));
  }

  // INSIDE the checkout is not AT it. Every path in a report — the store, the corpus, the
  // settings — is resolved relative to the root, and a run from `clients/acme/` that quietly used
  // the root anyway would print a report about a directory the reader is not in. Compared through
  // `realpath`, because `/var` is a symlink to `/private/var` on macOS and a temp checkout is
  // reached through both names.
  if (realpathOrSelf(cwd) !== realpathOrSelf(root)) return fail(notAtRoot(root, who));

  let config;
  try {
    config = JSON.parse(readFileSync(join(root, 'engine.config.json'), 'utf8'));
  } catch (e) {
    return fail(`${who}: engine.config.json is unreadable — ${e.message}`);
  }

  const floor = config?.floors?.node;
  if (floor && !meetsFloor(node, floor).ok) {
    return fail(`${who}: Node ${node} is below the floor ${floor} — `
      + 'install it (macOS: brew install node@22 · Windows: winget install OpenJS.NodeJS.LTS · '
      + "Linux: your distribution's package or nvm)");
  }

  return { root, config };
}

export async function doctorCommand({ flags = {}, log, out = process.stdout, env = process.env,
  // ARC-07-W17 — the PLATFORM is an argument so a FIXTURE CAPTURE can pin it. `make-status-fixtures.mjs`
  // writes `tests/fixtures/doctor/status-*.json` into the repository, and a fixture whose content depends
  // on the runner's shell is not a fixture: captured on Windows it holds `.\snowarch.cmd` and the
  // committed one holds `./snowarch`, so the re-capture case fails on one platform for no defect. #299
  // settled the same question for the locked-production snapshot.
  platform = process.platform,
  err = process.stderr, cwd = process.cwd(), registry = engineRegistry(), now = () => Date.now(),
  home = '', input = process.stdin, ask = null, fixDeps = {} } = {}) {
  const started = now();
  const write = (text) => out.write(`${text}\n`);

  const checkout = resolveCheckout({ cwd });
  if (checkout.problem) {
    write(checkout.problem.message);
    return checkout.problem.exit;
  }
  const { root, config } = checkout;

  const sections = selectSections(flags.section);
  if (sections && sections.unknown.length > 0) {
    write(`unknown section "${sections.unknown[0]}"; valid: ${SECTIONS.join(', ')}`);
    return EXIT_USAGE;
  }

  const options = {
    quick: flags.quick === true,
    // `--quick` implies `--no-network`: the subset exists to be fast, and a network round trip is
    // the slowest thing the doctor does.
    noNetwork: flags['no-network'] === true || flags.quick === true,
    fix: flags.fix === true,
    section: flags.section ?? null,
    sections: sections ? sections.names : null,
  };

  const runOptions = {
    sections: options.sections,
    quick: options.quick,
    noNetwork: options.noNetwork,
    fix: options.fix,
    section: options.section,
    writeCache: flags['no-cache'] === true ? false : 'auto',
    started,
  };

  let report;
  let checks;
  let cacheError;
  // ARC-08-C34 — carried beside the report for the text renderer only.
  let results = [];
  let fixes = [];
  if (options.fix) {
    // Under `--json`, stdout carries ONE thing: the object. The plan, the prompt and the per-fix
    // lines are prose, so they follow every other human line to stderr — a caller piping this into
    // `jq` must not have to strip them, and `JSON.parse(stdout)` is the assertion that proves it.
    const narrate = flags.json ? (text) => err.write(`${text}\n`) : write;
    // A plan a nobody can answer is a plan nobody asked for: without a TTY and without `--yes`,
    // `--fix` prints what it would do and stops, which is the safe half of the interaction.
    const interactive = Boolean(input?.isTTY) || Boolean(ask);
    const outcome = await fixCommand({
      root, config, registry, options: runOptions, env, home, now, write: narrate, platform,
      yes: flags.yes === true,
      ask: ask ?? (interactive ? defaultAsk(input) : null),
      deps: fixDeps,
    });
    report = outcome.report;
    checks = outcome.checks;
    cacheError = outcome.cacheError;
    results = outcome.results ?? [];
    fixes = fixesBlock(outcome.applied ?? []);
    if (fixes.length > 0) report.fixes = fixes;
    // A plan the user declined is a successful run of `--fix`: they asked what it would do, and
    // it told them. The findings are still on the screen and the next run still reports them.
    if (outcome.declined) {
      if (flags.json) write(JSON.stringify(maskForJson(report, { home, ...storeMaskValues(root) }), null, 2));
      if (log?.commit) log.commit();
      return EXIT_OK;
    }
  } else {
    ({ report, checks, cacheError, results } = await runDoctor({
      root, config, registry, ...runOptions, env, home, now, platform,
    }));
  }

  // A cache that could not be written is not a failed run: the report is on the screen, and the
  // banner's fallback is to re-run. Said out loud so a read-only checkout is explicable — and now
  // on STDERR in BOTH modes (ARC-09-C9), because stdout carries the report and nothing else.
  // S11 had already moved it off stdout under `--json`, where `note: …` before the object made
  // every consumer's `JSON.parse` throw on the `n`; C9 finishes the job for the text path, where
  // a diagnostic was interleaved with the report a human was reading.
  if (cacheError) {
    err.write(`doctor: cache not written — ${cacheError}\n`);
  }

  if (flags.json) {
    // ARC-09-C9: and in the object too. A script that reads `--json` never sees stderr, so without
    // this the only signal that the banner will re-run every session was a line it cannot read.
    // Present only when it happened — a `cacheError: null` on every healthy run would be noise in
    // the shape every consumer already parses.
    // ARC-08-C1: masked at the boundary, not at each site that writes a string. `--json` is the
    // form that travels — an issue template asks a stranger to paste it — so instance labels and
    // hosts leave as `<label>` / `<host>`. The text path below, the banner and the cache keep the
    // user's own words; a machine consumer uses the report object, not this string.
    write(JSON.stringify(maskForJson(cacheError ? { ...report, cacheError } : report, { home, ...storeMaskValues(root) }), null, 2));
  } else {
    // ARC-07-W17 — the renderer is pure and takes the spelling; this command may read the shell.
    // `doctorCommand` has no `ctx` — it BUILDS one for the checks — so the platform and the command's
    // own `env` are passed directly. `env` rather than `process.env`: the command already takes it as
    // an argument so a caller can drive a shell, and threading it is what makes Git Bash on Windows
    // keep the POSIX spelling.
    write(renderText({ report, checks, results, colour: useColour({ stream: out, env }),
      cli: cliOf({ platform, env }) }));
  }
  if (log?.commit) log.commit();
  return report.summary.fail > 0 ? exitCodeFor(report.summary) : EXIT_OK;
}
