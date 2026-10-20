// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-06-S03 — the `bootstrap` sub-command: build the context, show the plan, run the steps.
//
// The command itself decides very little. It assembles the context every step reads, gets the plan
// accepted, and hands the list to the runner; the resume semantics live in `steps/index.mjs`, the
// schema in `state.mjs`, the wording in `steps/format.mjs`. Keeping this thin is what lets
// ARC-06-S04…S09 land one step at a time without any of them touching the command.
import { lineReader } from './ask.mjs';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { storePath } from './local-paths.mjs';
import { EXIT_FAIL, EXIT_OK, EXIT_USAGE } from './exit.mjs';
import { loadConfig, root as defaultRoot, version } from './config.mjs';
import { checkLocation, checkMode } from './instance-file.mjs';
import { DOCS, buildPlan, runPlanScreen } from './plan.mjs';
import { LAST, STEPS, interrupt, runSteps, stepById } from './steps/index.mjs';
import { RESET_MESSAGE, StateError, emptyState, loadState, resetState, saveState } from './state.mjs';
import { needSpell, spellings } from './launcher-spelling.mjs';
import { licenceStatus } from './licence/state.mjs';

/**
 * ARC-07-C31 slice 4 — a function of the reader's shell, the shape every other usage now has.
 * `cli.mjs` resolves a `usage` that is a function and threads the one `where` it built.
 */
export const USAGE = (where) => [
  `usage: ${spellings(where).cli} bootstrap [options]`,
  '',
  '  --mode design|live        what to install for (default: design-only)',
  `  --docs ${DOCS.join('|')}   how much of the documentation corpus to check out`,
  '  --yes                     accept the plan without showing the prompt',
  '  --from BNN                re-run from this step, caching the ones before it',
  '  --reset                   clear the bootstrap state and start over',
  '  --instance-file <path>    read live-mode connection details from a file, once',
  '  --skip-claude-check       do not check the Claude Code version floor',
  '  --json                    print the summary object on stdout',
].join('\n');

/** The sentence for the one combination that cannot work. Exported so the test cannot paraphrase it. */
/**
 * Is this the combination that genuinely cannot work? — ARC-06-C16.
 *
 * ONE statement of the rule, used by `bootstrap` and by `mode`. They already shared the SENTENCE,
 * with `mode.mjs` noting that "there is one reason this combination cannot work and it should not
 * have two phrasings" — and then each wrote its own condition, which disagreed. `mode` asked
 * `&& !hasStore`; `bootstrap` did not, so an upgrade of a LIVE checkout that already holds an
 * instance was refused for not being able to type credentials it was never going to be asked for.
 *
 * The rule is about a store with nothing in it. A checkout that already has an instance is not
 * being asked to add one.
 */
export const liveYesNeedsInstanceFile = ({ mode, yes, instanceFile, hasStore }) =>
  mode === 'live' && yes === true && !instanceFile && !hasStore;

export const LIVE_YES_WITHOUT_FILE =
  'live mode with --yes needs --instance-file <path>: credentials cannot be typed '
  + 'non-interactively (see docs/INSTALL.md "Operators and CI")';

/** This machine's Node, as the steps read it. Exported since ARC-08-C29: the plan's dry run needs
 * the same answer the bootstrap will give, and a second reading of `process.versions` at another
 * call site is how two callers start disagreeing about the machine they are both on. */
export const nodeInfo = () => {
  const v = process.versions.node;
  return { present: true, version: v, major: Number(v.split('.')[0]) };
};

const countAreas = (root, config) => {
  const p = join(root, config.docs.areasFile);
  if (!existsSync(p)) return 0;
  return readFileSync(p, 'utf8').split('\n').filter((l) => l.trim() !== '').length;
};

/** One line from stdin, or `null` at end of input — `lib/ask.mjs`, shared with the doctor. */
const stdinAsker = (input, output) => lineReader(input, output);

/**
 * THE SHAPE EVERY STEP IS HANDED — one constructor, so a second caller cannot build a near-miss.
 *
 * ARC-08-C29's fix-up. `rerunAtTag` needed a ctx to ask `runsWhen` and `hashFor` the runner's
 * question at the tag, and built one by spreading the upgrade command's `{ root, config }`. That
 * object has no `env`, and `B04.runsWhen` reads `ctx.env.SNOWARCH_TEST_FORCE_DEPS` — so **every
 * real `./snowarch upgrade` crashed at `[U4/7] plan`** with `Cannot read properties of undefined`,
 * on every machine, including the owner's next one. The four plan tests did not see it because
 * they build their own ctx, and `tests/upgrade/` is outside `npm test`, so a green local run
 * covered none of it.
 *
 * A ctx assembled at a call site is a ctx that drifts from what the steps read. This is what the
 * bootstrap gives them, and it is now what anybody asking the steps a question gives them too.
 */
/**
 * ARC-07-C31 slice 4 — `platform` BESIDE THE `env` THIS ALREADY CARRIED, so a step can spell the
 * launcher for the shell the run was TOLD about rather than the one the process happens to be.
 *
 * `env` alone is not enough and that is the whole reason: `isWindowsShell` is
 * `platform === 'win32' && !env.SHELL && !env.MSYSTEM`, so a ctx with only an env renders by this
 * machine's SHELL. With both, `tests/upgrade` and the bootstrap's own cases can drive a Windows
 * rendering by argument — which is what keeps these seventeen sites from being as thinly held as the
 * server's ten, where there was no context to add one to.
 */
export function stepContext({ root, config, env = process.env, platform = process.platform,
  node, flags = {}, state = null, licence = licenceStatus(root) }) {
  return {
    root,
    config,
    env,
    platform,
    node,
    areaCount: countAreas(root, config),
    instanceFile: flags['instance-file'] ?? null,
    skipClaudeCheck: Boolean(flags['skip-claude-check']),
    // ARC-08-C28 — B06 needs to know it was told not to ask. It decided by TTY alone, so an
    // upgrade typed at a terminal — which inherits stdio — started the wizard over an instance
    // the run had been told to keep, with `--yes` invisible to the decision.
    yes: Boolean(flags.yes),
    // ARC-11-C6 (ruling R1) — read once for the run: B06 and B08 ask the gate with it before they start the package CLI.
    licence,
    state: state ?? emptyState({ engineVersion: version(root), node }),
  };
}

export async function bootstrapCommand({ flags, log, root = defaultRoot, argv = [],
  input = process.stdin, out = process.stdout, err = process.stderr, env = process.env,
  // ARC-07-C31 — `platform` beside the `env` this already had, for `loadState`'s spelling. The
  // ARGUMENT is all that changes in this file: its own three launcher sites stay with the
  // e2e-trigger slice, and this edit is why slice 2 runs the five `tests/upgrade` files.
  platform = process.platform,
  cwd = process.cwd(), probe = undefined, exec = undefined, asker = null } = {}) {
  // With `--json`, stdout carries ONE thing: the object. The plan screen is prose, so it follows
  // every other human line to stderr — a caller piping this into `jq` must not have to strip a
  // banner first. (`--json` with no `--yes` still shows the screen and still waits: the operator is
  // there, it is their terminal, and only the machine-readable channel changes.)
  const humanOut = flags.json ? err : out;
  const config = loadConfig(root);

  // A refusal before the plan is accepted leaves the checkout exactly as it found it — including
  // the log. Criterion 7 says this combination "writes nothing", and a `.local/logs/` directory
  // conjured by the error message is still something.
  const refuse = (message, code = EXIT_USAGE) => { log.fail(message); log.discard(); return code; };

  if (flags.mode !== undefined && flags.mode !== 'design' && flags.mode !== 'live') {
    return refuse(`--mode must be design or live, not "${flags.mode}"`);
  }
  if (flags.docs !== undefined && !DOCS.includes(flags.docs)) {
    return refuse(`--docs must be ${DOCS.join(', ')}, not "${flags.docs}"`);
  }
  if (flags.from !== undefined && !stepById(String(flags.from).toUpperCase())) {
    return refuse(`--from must name a step (${STEPS.map((s) => s.id).join(', ')}), not "${flags.from}"`);
  }
  // Checked BEFORE the state is loaded or anything is written: the story requires that this
  // combination writes nothing at all, and a usage error discovered halfway through a run has
  // already broken that promise.
  // The path is spelled here rather than imported from `mode.mjs`: that module imports the
  // refusal sentence FROM this one, and a second edge would close the cycle.
  if (liveYesNeedsInstanceFile({ mode: flags.mode, yes: flags.yes,
    instanceFile: flags['instance-file'],
    hasStore: existsSync(storePath(root)) })) {
    return refuse(LIVE_YES_WITHOUT_FILE);
  }

  // The instance file's MODE and PATH are checked here, at parse time, as well as in B06.
  //
  // Both answers need no read and no network, and B06 is reached only after B04 has installed
  // 72 MB — so a file that was always going to be refused would cost an install first. Checked
  // twice on purpose: the file can change between this moment and B06, and B06 is also reachable
  // from a resume that never passed through this code.
  if (flags['instance-file']) {
    const path = flags['instance-file'];
    if (!existsSync(path)) return refuse(`${path} does not exist`);
    const mode = checkMode(path);
    if (!mode.ok) return refuse(mode.reason, EXIT_FAIL);
    const location = checkLocation(path, root);
    if (!location.ok) return refuse(location.reason, EXIT_FAIL);
  }

  if (flags.reset) {
    resetState(root);
    log.step(RESET_MESSAGE);
    return EXIT_OK;
  }

  // ARC-07-C31 slice 4 — ONE spelling for this command, built once and threaded: `loadState`'s
  // refusals, the step context the steps render from, and the closing `nextText` all have to be the
  // same shell or one run prints two answers.
  const spell = spellings({ platform, env });
  let state;
  try { state = loadState(root, spell); } catch (e) {
    if (!(e instanceof StateError)) throw e;
    return refuse(e.message, e.code);
  }

  const node = nodeInfo();
  const ctx = {
    ...stepContext({ root, config, env, node, flags, state }),
    // Filled in from the accepted plan below. Present here so a step reading `ctx.mode` before the
    // plan is accepted gets `null` rather than a silently wrong default.
    mode: null, docs: null,
  };

  // B00 runs BEFORE the plan screen, and writes nothing.
  //
  // The order is the story's and the reason is worth stating: the plan asks the operator to choose
  // between modes, and offering `live` on a machine with no Node — or any plan at all on a machine
  // that cannot reach github.com — is asking someone to decide something already decided. A
  // preflight FAIL therefore ends the run before a single question and before `.local/` exists, so
  // `save` is a no-op here rather than the real one.
  // The plan is PROPOSED before the preflight so B00 knows which mode to check for — asking
  // "is Node good enough?" without knowing whether live was requested has no answer. The proposal
  // is pure and writes nothing; the screen that shows it comes after.
  const proposed = buildPlan({ ctx, state, flags });
  const preflight = await runSteps({
    // `cwd` and `probe` are seams, not configuration: the root check has to be asked about a
    // directory, and the network check must be answerable without a socket. Both default to the
    // real thing, so the product path is the one every test is a deviation from.
    root, ctx: { ...ctx, cwd, probe, exec, mode: proposed.mode, docs: proposed.docs },
    state: ctx.state, steps: [STEPS[0]], last: LAST, onLine: (l) => log.step(l), save: () => {},
  });
  if (preflight.code !== EXIT_OK) {
    // The runner has already printed the FAIL line, the cause and the remedy. Printing them again
    // here — which the first version did — makes the operator read the same three lines twice and
    // wonder which one is the real one.
    log.discard();
    return preflight.code;
  }

  // ...and B00's verdict feeds back into the screen: a machine it has just said cannot run live
  // must not be offered live. `nodeUsable` is read rather than re-derived, so there is one answer.
  const usable = ctx.state.steps.B00?.data?.nodeUsable !== false;
  const plan = usable ? proposed : { ...proposed, mode: 'design-only', nodeFixed: true };
  const io = asker ?? stdinAsker(input, humanOut);
  let accepted;
  try {
    accepted = await runPlanScreen({
      plan, ctx, ask: io.ask, write: (s) => humanOut.write(s),
      accepted: flags.yes ? '--yes' : null,
    });
  } finally {
    if (io.close) io.close();
  }
  if (accepted.action === 'quit') {
    log.discard();                       // nothing was accepted, so nothing is written — not even a log
    return EXIT_OK;
  }
  log.commit();

  // The plan's answers become the state's, here. B03 will own this once ARC-06-S07 gives it a body;
  // until then the decision still has to reach the file, because acceptance criterion 1 reads it
  // back and every step's `runsWhen` is asked about it.
  const runState = ctx.state;          // the same object B00 recorded into, not a second empty one
  runState.mode = accepted.plan.mode;
  runState.docs = { mode: accepted.plan.docs, pin: config.docs.pin };
  runState.node = node;
  ctx.mode = accepted.plan.mode;
  ctx.docs = accepted.plan.docs;
  ctx.state = runState;

  const lines = [];
  const onLine = (line) => { lines.push(line); log.step(line); };

  // Shared with the runner so the handler can reach the child of the step that is mid-flight.
  const live = { child: null, step: null };
  const onSigint = () => {
    const r = interrupt({ root, state: runState, live, onLine });
    process.exit(r.code);
  };
  process.on('SIGINT', onSigint);
  let outcome;
  try {
    outcome = await runSteps({ root, ctx, state: runState, live, steps: STEPS.slice(1), last: LAST,
      from: flags.from ? String(flags.from).toUpperCase() : null, onLine });
  } finally {
    process.off('SIGINT', onSigint);
  }
  saveState(root, runState);

  // The closing block, after the last step line, so the five lines a user reads at the end really
  // are the last five.
  if (outcome.next && !flags.json) for (const line of outcome.next.split('\n')) log.step(line);

  if (flags.json) {
    log.json({
      mode: runState.mode,
      docs: runState.docs,
      steps: runState.steps,
      summary: { ok: outcome.summary.ok, warn: outcome.summary.warn,
        fail: outcome.summary.fail, skipped: outcome.summary.skipped },
      next: nextText(outcome, runState, spell),
    });
  } else if (!outcome.next) {
    log.step(nextText(outcome, runState, spell));
  }
  return outcome.code === EXIT_OK ? EXIT_OK : EXIT_FAIL;
}

/** What to do now. ARC-06-S09 replaces this with B09's own text, dialog budget and all. */
/**
 * ARC-07-C31 slice 4 — `spell` REQUIRED: two callers, both below (`next:` in the `--json` object and
 * the `log.step` beside it), and the rule is a count. Both render for the same terminal, and requiring
 * it is what stops the two drifting into two renderings of one sentence.
 */
export function nextText(outcome, state, spell) {
  needSpell(spell, 'nextText');
  if (outcome.stoppedAt) {
    return `stopped at ${outcome.stoppedAt} — fix the cause above and re-run ${spell.bootstrap}`;
  }
  // B09's block, verbatim. `--json`'s `next` and the lines a human read are then the same string
  // rather than two renderings that can drift — which is what criterion 3 asks.
  if (outcome.next) return outcome.next;
  return state.mode === 'live'
    ? `bootstrap complete (${LAST}) — run /snowarch status in Claude Code to confirm the instance`
    : `bootstrap complete (${LAST}) — design-only; add an instance later with ${spell.cli} mode live`;
}
