// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-08-C18 — `./snowarch status`: the panel, as a command.
 *
 * It exists so that a terminal user and a Claude session read the SAME lines. SKILL.md § status
 * used to be a renderer in prose — seven lines with their JSON keys in brackets, a null rule, a
 * failure branch, an exit-3 branch and three named causes for "the doctor cannot run" — executed by
 * a language model once per session. Everything it described is now code: `renderPanel` for the
 * seven lines, `resolveCheckout` for the exit-3 branch, and `fallbackPanel` below for the causes,
 * each named only when this command actually observed it.
 *
 * IN-PROCESS, not a spawn of `./snowarch doctor --quick --json`. The SessionStart banner runs on a
 * budget ARC-09-C8 measured in single milliseconds on Windows, and a spawn spends a whole Node
 * start-up before the first check runs.
 *
 * `--json` emits the doctor report UNCHANGED — byte-for-byte what `doctor --quick --json` prints,
 * masked at the same boundary. A panel-shaped JSON would be a second schema for one set of facts,
 * and the first consumer to read the wrong one would be reading a shape nothing maintains.
 */
import { existsSync, readFileSync } from 'node:fs';
import { spellings } from '../text.mjs';
import { join } from 'node:path';
import { statePath } from '../local-paths.mjs';

import { EXIT_FAIL, EXIT_OK, EXIT_PREREQ } from '../exit.mjs';
import { BANNER } from '../text.mjs';
import { resolveCheckout, runDoctor } from '../doctor/index.mjs';
import { maskForJson, storeMaskValues } from '../doctor/json-boundary.mjs';
import { renderPanel } from '../doctor/panel.mjs';

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
  `usage: ${spellings(where).cli} status [--json]`,
  '',
  '  The one-screen panel: mode, engine, docs, roster, capabilities, instances and the quick',
  '  doctor. `--json` prints the doctor report itself, exactly as `doctor --quick --json` does.',
  '',
  '  Exit: 0 when no check failed, 1 when one did: the panel is printed either way, so a 1 is not a',
  '  failure to render. It is also 1 when the doctor itself failed; then the one line printed is a',
  '  Mode line that says doctor unavailable. Any other 1 is the command itself failing, and what it',
  '  printed says why.',
].join('\n');

/**
 * What to print when the doctor could not run at all.
 *
 * The mode is READ from `.local/bootstrap-state.json` rather than derived, and the sentence says
 * so — "from bootstrap state" is the difference between a fact established a moment ago and one
 * the bootstrap recorded at install time, and a reader deciding whether to trust it needs to know
 * which they have.
 *
 * THE CAUSE IS PASSED IN, never assumed. SKILL.md's rule was *"never state a cause you did not
 * check"* and then `BANNER.fromState` stated one unconditionally: *"until Node 20+ is installed"*,
 * which is the one cause this command can never be the one to report — a machine without Node
 * cannot run it to find out. Every caller below names what it actually observed.
 *
 * When the state file is missing or unreadable the panel says THAT, rather than a mode it does not
 * have. A remedy for the wrong problem costs the reader the time they spend following it.
 */
export function fallbackPanel(root, cause,
  // ARC-07-W17 — TOLD, not read. `statusCommand` is what `make-status-fixtures.mjs` drives with
  // `platform: 'linux'` so a COMMITTED fixture renders identically on every runner; a `spellings()` in
  // here reads the machine instead and the fixture then depends on the shell that captured it.
  { read = readFileSync, exists = existsSync, platform, env } = {}) {
  const path = statePath(root);
  if (!exists(path)) {
    // ARC-07-W17 — one spelling, the reader's. This named both by hand and the Windows one was BARE,
    // which PowerShell refuses; the sentence that tells somebody their checkout is not bootstrapped
    // handed a Windows reader a command their shell rejects.
    return `Mode: unknown — doctor unavailable ${cause}, and .local/bootstrap-state.json is`
      + ` absent — run ${spellings({ platform, env }).bootstrap}`;
  }
  try {
    const state = JSON.parse(read(path, 'utf8'));
    return BANNER.fromState(state.mode ?? 'unknown', state.updatedAt ?? 'unknown', cause);
  } catch (e) {
    return `Mode: unknown — doctor unavailable ${cause}, and .local/bootstrap-state.json is`
      + ` unreadable (${e.message})`;
  }
}

export async function statusCommand({ flags = {}, log, out = process.stdout, env = process.env,
  cwd = process.cwd(), home = '', now = () => Date.now(), registry = undefined,
  // ARC-07-W17 — like `doctorCommand`'s, and for the same reason: `make-status-fixtures.mjs` pins it so
  // the committed fixtures stop depending on the capturing machine's shell (rule 4).
  platform = process.platform,
  // ARC-07-C33 — a seam, defaulting to the product's behaviour; see the `runDoctor` call below.
  writeCache = 'auto',
  // ARC-11-C7 — a seam, empty for every real caller: `make-status-fixtures.mjs` leaves E-32 out, because what E-32
  // says is the COMMIT's (a release version, and its signed manifest), and a committed fixture carries no fact that
  // differs between two correct commits (ARC-08-C27).
  exclude = [] } = {}) {
  const write = (text) => out.write(`${text}\n`);

  const checkout = resolveCheckout({ cwd, who: 'STATUS' });
  if (checkout.problem) {
    // Exit 3 and its remedy, from the one preamble the doctor uses. The skill's step 4 — "print
    // the cd remedy and nothing else about mode" — is this branch, and it is now the command's
    // because the command is what observed it.
    write(checkout.problem.message);
    if (log?.commit) log.commit();
    return checkout.problem.exit;
  }
  const { root, config } = checkout;

  let report;
  try {
    ({ report } = await runDoctor({
      root,
      config,
      // The shell this run was TOLD about, so the Mode line inside the report is pinned too.
      platform,
      ...(registry ? { registry } : {}),
      quick: true,
      exclude,
      // `--quick` implies no network in `doctorCommand`, and the implication is the point rather
      // than a detail: a session must answer in under a second and a round trip is the slowest
      // thing here. Stated rather than inherited, because this call does not go through the flags.
      noNetwork: true,
      fix: false,
      section: null,
      sections: null,
      // ARC-07-C33 — a SEAM, defaulting to the product's behaviour. The panel caches because a
      // session's first line is on a millisecond budget, so `'auto'` is right for every real caller.
      // What it is wrong for is a TEST that runs this against the real checkout to see what the
      // doctor produces now: that case does not care about caching and was leaving
      // `.local/doctor-last.json` and `.local/doctor-last.inputs.json` in the repository root.
      writeCache,
      started: now(),
      env,
      home,
      now,
    }));
  } catch (e) {
    // It ran and failed. The CLASS, never the message: a message can carry a path or a value, and
    // this line is pasted into conversations.
    write(fallbackPanel(root, `after it failed (${e?.constructor?.name ?? 'Error'})`,
      { platform, env }));
    if (log?.commit) log.commit();
    return EXIT_FAIL;
  }

  if (flags.json) {
    write(JSON.stringify(maskForJson(report, { home, ...storeMaskValues(root, env) }), null, 2));
  } else {
    // ARC-07-W17 — the panel is PURE (its import graph is walked and must reach no environment), so
    // the launcher is supplied here, where reading the shell is allowed.
    write(renderPanel(report, spellings({ platform, env }).cli));
  }
  if (log?.commit) log.commit();
  // The doctor's verdict, so a script can branch on it. The panel is on the screen either way.
  return report.summary.fail > 0 ? EXIT_FAIL : EXIT_OK;
}

// Re-exported so a caller that already has a report — the banner, a test — renders the same panel
// without going through the command. One renderer, whatever the path in.
export { renderPanel, EXIT_PREREQ };
