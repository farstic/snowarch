// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-06-S02 — the `docs` sub-commands, lifted out of `scripts/docs.mjs` so there is ONE
// implementation behind two entry points.
//
// `./snowarch docs …` and `node scripts/docs.mjs …` both land here; the script kept its name and
// behaviour because CI, the npm scripts and two workflows call it by path, but it is now a shim
// rather than a second copy of the dispatch.
//
// `runDocs` RETURNS an exit code. The frame owns `process.exit`, and a function that exits cannot
// be tested — which is the same lesson ARC-03-S09's bump script learned about doing work at import.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { syncCorpus, planRecipe, readAreas, inspect, resolveMode, SyncError, EXIT as SYNC_EXIT }
  from './sync.mjs';
import { verifyCitations, formatResult, EXIT } from './verify.mjs';
import { verifyIdentifiers, formatIdentifiers } from './identifiers.mjs';
import { verifyTables, formatTables } from './tables.mjs';
import { docsStatus, formatStatus } from './status.mjs';
import { syncUpstream, formatUpstream } from './upstream.mjs';
import { planFamilySwitch, formatPlan, applyFamilySwitch, EXIT_NEEDS_YES } from './family.mjs';
import { root } from '../config.mjs';
import { isEngineeringCheckout } from '../engineering-checkout.mjs';
import { spellings } from '../launcher-spelling.mjs';

/**
 * ARC-07-C31 — THE BOUNDARY, which is the one place reading the process is the right answer.
 *
 * This is the docs command's entry point: everything below renders for the person who typed it, so
 * the spelling is resolved ONCE here and threaded, rather than each renderer deciding for itself.
 * A parameter with a process default rather than a bare `spellings()` in the body, so a case can
 * drive the whole command's Windows rendering by argument. One caller — `tools/snowarch/lib/cli.mjs`'s
 * `docs` entry — which is what the rule requires of a default.
 */
export function runDocs(argv, { spell = spellings() } = {}) {
  const config = JSON.parse(readFileSync(join(root, 'engine.config.json'), 'utf8'));
  const [cmd, ...rest] = argv;


  if (cmd === 'sync') {
    const flag = (name) => rest.includes(name);
    const value = (name) => { const i = rest.indexOf(name); return i === -1 ? undefined : rest[i + 1]; };
    const quiet = flag('--quiet');
    const asJson = flag('--json');

    // `--print-recipe` executes nothing. It is the source the ARCHITECTURE block is copied from and
    // the launchers run when Node is absent, so it must print for the state the caller is IN — a
    // fresh checkout and an existing one need different command lists.
    if (flag('--print-recipe')) {
      try {
        const areas = readAreas(root, config.docs.areasFile);
        const mode = resolveMode(root, value('--mode'));
        const state = inspect(root, config, areas);
        for (const line of planRecipe({ config, areas, mode, state })) console.log(line);
        return (0);
      } catch (e) {
        console.error(e.message);
        return (e instanceof SyncError ? e.code : 2);
      }
    }

    // The maintainer refresh is a different command wearing the same word. Kept under `sync` because
    // the story names it `sync --upstream`, and refused alongside `--mode` because "reconcile my
    // checkout" and "move the repository's pin" are not one operation.
    if (flag('--upstream')) {
      if (value('--mode') !== undefined) {
        console.error('--upstream is the maintainer refresh; run `sync --mode` separately');
        return (2);
      }
      try {
        const r = syncUpstream({
          root, config, to: value('--to') ?? null,
          verify: !flag('--no-verify'), log: asJson ? null : console.log, spell,
        });
        if (asJson) console.log(JSON.stringify(r, null, 2));
        return (formatUpstream(r).code);
      } catch (e) {
        if (!(e instanceof SyncError)) throw e;
        console.error(e.message);
        return (e.code);
      }
    }

    let result;
    try {
      result = syncCorpus({ root, config, mode: value('--mode'), quiet: quiet || asJson });
    } catch (e) {
      if (!(e instanceof SyncError)) throw e;
      console.error(e.message);
      return (e.code);
    }
    const { completeness } = result;

    if (asJson) {
      // The S06 shape, replacing S05's minimal placeholder: one description of the corpus, the same
      // one the doctor embeds. `verify: false` — a sync has just run the completeness check, and the
      // citation scan is `docs verify`'s job, not a second cost on every sync.
      console.log(JSON.stringify(docsStatus({ root, verify: false, measure: true }), null, 2));
      return (completeness.ok ? 0 : 1);
    }

    // THE GATE. Deleted by accident at ARC-03-S06 and restored by the 2026-09-09 fix; it moved here
    // with the dispatch, and it is why `docs sync` cannot print `INCOMPLETE` and then `complete`.
    if (!completeness.ok) {
      if (completeness.missingRoot.length) {
        console.error(`INCOMPLETE: missing root path(s): ${completeness.missingRoot.join(', ')}`);
      }
      if (completeness.head !== completeness.pin) {
        console.error(`INCOMPLETE: HEAD ${completeness.head} != pin ${completeness.pin}`);
      }
      if (!completeness.initialised) {
        console.error('INCOMPLETE: the superproject reports the submodule uninitialised: '
          + `${completeness.submodule}`);
      }
      return (1);
    }

    // A cited area that upstream does not have is a citation defect; `verify` is where it fails.
    for (const a of completeness.missingAreas) {
      console.error(`WARN: cited area "${a}" does not exist at the pin — `
        + 'a dead citation, not a checkout fault; run: node scripts/docs.mjs verify');
    }
    console.log('docs sync: complete');
    return (0);
  }

  if (cmd === 'verify') {
    const r = verifyCitations({ root, allowMissing: rest.includes('--allow-missing') });
    // ARC-09-C81: the names the roster writes, beside the pages it cites. Only here, not in the
    // doctor's E-16 — one walk of every corpus page is a maintainer's gate, not a health check.
    const ids = verifyIdentifiers({ root });
    // ARC-09-C126: a table row wider than its header renders short on GitHub, and nothing else notices.
    const tables = verifyTables({ root });
    const cites = formatResult(r, spell);
    const names = formatIdentifiers(ids);
    const cells = formatTables(tables);
    if (rest.includes('--json')) {
      console.log(JSON.stringify({ ...r, identifiers: ids, tables }, null, 2));
      return (cites.code || names.code || cells.code);
    }
    (cites.code === EXIT.ok ? console.log : console.error)(cites.text);
    (names.code === EXIT.ok ? console.log : console.error)(names.text);
    (cells.code === EXIT.ok ? console.log : console.error)(cells.text);
    return (cites.code || names.code || cells.code);
  }

  if (cmd === 'family') {
    // ARC-09-C185a — switching the corpus family re-runs the skills lint and the areas generator, maintainers' tools
    // that live in the engineering checkout. A user's install refuses, saying where the command belongs.
    if (!isEngineeringCheckout(root)) {
      console.error("snowarch docs family is a maintainers' command, run in the engineering checkout.");
      return (2);
    }
    const [name, ...flags] = rest;
    const has = (f) => flags.includes(f);
    const val = (f) => { const i = flags.indexOf(f); return i === -1 ? undefined : flags[i + 1]; };
    if (!name || name.startsWith('--')) {
      console.error('usage: node scripts/docs.mjs family <name> [--dry-run | --yes] [--from <name>] [--json]');
      return (2);
    }
    try {
      const plan = planFamilySwitch({ root, config, to: name, from: val('--from') ?? null, spell });
      if (has('--json')) { console.log(JSON.stringify(plan, null, 2)); return (0); }
      if (!has('--yes')) {
        console.log(formatPlan(plan, { spell }).text);
        // No flag at all is not a dry run: the maintainer asked for something and got a plan, so the
        // exit code has to say the thing they asked for did not happen.
        if (!has('--dry-run')) { console.error('refusing to apply without --yes'); return (EXIT_NEEDS_YES); }
        return (0);
      }
      const r = applyFamilySwitch(plan, { root, config, spell });
      return (r.code);
    } catch (e) {
      if (!(e instanceof SyncError)) throw e;
      console.error(e.message);
      return (e.code);
    }
  }

  if (cmd === 'status') {
    const s = docsStatus({ root, verify: true, measure: true });
    if (rest.includes('--json')) {
      // `--json` exits 0 unless the command itself failed: a caller reading the object wants the
      // object, and would have to distinguish "the corpus is missing" from "the tool crashed"
      // through an exit code that says both.
      console.log(JSON.stringify(s, null, 2));
      return (0);
    }
    const { text, code } = formatStatus(s, spell, { engineering: isEngineeringCheckout(root) });
    (code === 0 ? console.log : console.error)(text);
    return (code);
  }

  console.error('usage: node scripts/docs.mjs '
    + '(sync [--mode sparse|full] [--json] [--quiet] [--print-recipe]\n'
    + '     | sync --upstream [--to <sha>] [--json] [--no-verify]\n'
    + '     | verify [--allow-missing] [--json]\n'
    + '     | status [--json]\n'
    + '     | family <name> [--dry-run | --yes] [--from <name>] [--json])\n'
    + '\nexit: 0 ok · 1 incomplete, the pin moved and citations broke, or a roster name is unexcused · 2 plan printed, not applied\n'
    + '      3 corpus missing · 4 working tree not clean · 5 git failed · 6 upstream does not have it');
  return (2);
}
