// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// B06 instance — the slot ARC-07's wizard drops into, and the operator path that works today.
//
// Two ways in, and they are genuinely different jobs. The INTERACTIVE path hands the terminal to
// the wizard by SPAWNING it with inherited stdio — not by importing it — because the wizard reads
// raw-mode keystrokes and masks a password, and a library called in-process cannot own a TTY the
// bootstrap is also using. The NON-INTERACTIVE path never has a terminal at all: it reads a 0600
// file, probes once, and writes the store.
//
// Everything that needs `node_modules` is imported LAZILY. `dist/cli/index.js` and the store's
// schema module both exist only after B04, and a design-only run — which never reaches this step —
// must still be able to load the module. A test asserts that nothing here is imported at load time.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { storePath } from '../local-paths.mjs';
import { codeForStatus, probeAuth } from '../probe-auth.mjs';
import { readInstanceFile, SENTENCE } from '../instance-file.mjs';
import { productEnv } from '../spawn-env.mjs';
import { TEXT } from './inputs.mjs';
import { INPUTS } from '../inputs.mjs';
import { spellings } from '../text.mjs';
import { packageCliRefused, REMEDY } from '../licence/state.mjs';
import { NO_LICENCE_IN_FORCE } from '../doctor/checks/licence.mjs';

export const id = 'B06';
export const title = 'instance';
export const needsNode = true;
/**
 * Live mode, OR a store that is already there (ARC-09-S06).
 *
 * A design-only checkout that still carries a `.local/instances.json` is not a hypothetical: it is
 * what a user has after `mode design`, and what S07's upgrade harness is. That file must stay
 * LOADABLE across an upgrade, which means a schema change has to reach it in either mode — and the
 * step that reaches it is this one. Without the second clause, upgrading a design-only checkout
 * would leave the store a version behind and the next `mode live` would meet a schema it cannot
 * read, in the place least able to explain it.
 */
/**
 * ARC-07-C1, closed by W7 — EVERY CLI SPELLING IN THIS FILE COMES FROM HERE.
 *
 * Seven remedies and one bootstrap reference spelled `./snowarch` / `./bootstrap.sh` as literals, so
 * a Windows reader was handed a command their shell refuses. Read at module load, which is correct
 * because a process's platform does not change — and it keeps these as STRINGS. Making them functions
 * would have turned the existing `detail === NO_TERMINAL` assertions into comparisons of a value with
 * itself: green forever, and blind to the spelling they look like they check. The spelling is guarded
 * where it belongs instead — by the bare-spelling check over renderer sources.
 */
const SPELL = spellings();


const applies = (ctx) => ctx.mode === 'live' || storeExists(ctx.root);
/**
 * ARC-11-C6 (ruling R1) — and a licence in force. This step starts the package CLI's `store migrate` and its
 * `instance add`, which that CLI refuses without one, by the gate ./snowarch uses. Asked here, so the runner records
 * the step skipped, and the first bootstrap after a licence is installed runs it.
 */
const unlicensed = (ctx) => applies(ctx) && packageCliRefused(ctx);
export const runsWhen = (ctx) => applies(ctx) && !unlicensed(ctx);
export const skipReason = (ctx) => (unlicensed(ctx) ? NO_LICENCE_IN_FORCE : 'design-only');
export const skipNote = (spell, ctx) => (unlicensed(ctx) ? REMEDY(spell.cli) : null);

export const MIGRATION_FAILED =
  `the store migration did not complete — run ${SPELL.cli} store migrate to see why; `
  + 'nothing was changed and a backup was written if the migration had started';

export const NO_TERMINAL =
  `no terminal for the instance wizard — run ${SPELL.cli} instance add in an interactive terminal, `
  + 'or pass --instance-file <path> (see docs/INSTALL.md "Operators and CI")';
export const WIZARD_ABSENT =
  `instance wizard not available in this build — run ${SPELL.bootstrap} again after upgrading`;

const CLI = join('packages', 'snowarch', 'dist', 'cli', 'index.js');

// The CLI's usage code, named rather than typed as a 2. `lib/exit.mjs` owns the engine's five and
// deliberately does not re-export the CLI's; this is the one value B06 needs to read back from a
// child, so it is named here once with the reason attached.
const EXIT_USAGE_CODE = 2;
// ARC-07-C10 — the wizard's own "nothing saved" code: a refusal, an abort, three failed attempts,
// or a probe that failed. Every one of those is the operator's answer rather than a broken build.
const EXIT_FAILED_CODE = 1;

/**
 * The argv this step hands the wizard — EXPORTED so a test can drive the real CLI with it.
 *
 * ARC-07-C2's gap was the same as ARC-06-C6's: nothing ever ran B06's spawn against the actual
 * command-line parser. The step passed no label, the CLI required one, and every interactive
 * install died at exit 2 before asking anything — while CI stayed green because CI has no TTY and
 * never reaches this step. An argv written as a literal inside a spawn call is an argv no test can
 * reach; a named export is one a test can hand to the parser that has to accept it.
 */
export const WIZARD_ARGV = Object.freeze(['instance', 'add', '--from-bootstrap']);

// ARC-09-S05: the declaration lives in `lib/inputs.mjs`. Ten steps answering "what are my
// inputs" in ten files is ten places to get the resume rule wrong, and no way to show a user the
// set — the table is one answer, and `docs/ARCHITECTURE.md` renders from it.
export const inputs = INPUTS.B06.resolve;

// `root` guarded: `runsWhen` is called with whatever ctx a caller has, and a step selector that
// threw on a ctx without a root would turn "which steps run" into a crash.
/**
 * Wait for a child, whatever shape the caller's `spawn` returns.
 *
 * The runner hands every step an ASYNCHRONOUS `spawn` (ARC-06-S03) so its interrupt handler can
 * reach the child — and an async `ChildProcess` has no `.status`. Reading one gives `undefined`,
 * which `!== 0`, so this step declared every spawn a failure the moment it started it: in
 * production the wizard would run, the user would answer its prompts, and the bootstrap would
 * already have printed "the instance wizard exited abnormally" over the top of them. Every test
 * injected a synchronous fake returning `{ status: 0 }`, so nothing caught it; ARC-09-S07's
 * migration branch is what walked into it.
 *
 * Both shapes are accepted on purpose — the fakes are sync, the real one is not — and the answer
 * is always the same object: `{ status, signal }`, after the child has actually finished.
 */
export function awaitChild(child) {
  if (!child || typeof child.on !== 'function') {
    return Promise.resolve({ status: child?.status ?? null, signal: child?.signal ?? null });
  }
  return new Promise((resolve) => {
    child.on('error', () => resolve({ status: null, signal: null }));
    child.on('exit', (status, signal) => resolve({ status, signal }));
  });
}

export const storeExists = (root) => Boolean(root) && existsSync(storePath(root));

function shapeOf(root) {
  const p = storePath(root);
  if (!existsSync(p)) return { present: false, version: null };
  try {
    // Presence and schema version only. This file holds credentials, and a hash input that read
    // further would put one a careless line away from the log.
    const text = readFileSyncSafe(p);
    const v = text === null ? null : JSON.parse(text)?.version;
    return { present: true, version: Number.isInteger(v) ? v : null };
  } catch { return { present: true, version: null }; }
}

function readFileSyncSafe(p) {
  try { return readFileSync(p, 'utf8'); } catch { return null; }
}

/**
 * The five answers a wizard probe can give. Four of them used to be one boolean.
 *
 * `ABSENT` is the only one that means what the old message said, and it is the rarest: it needs a
 * CLI that starts, answers `--help` and does not list `add`. The other three are a machine problem,
 * and telling their owner to re-bootstrap a perfectly good build is worse than saying nothing.
 */
export const WIZARD = Object.freeze({
  OK: 'ok', SPAWN_ERROR: 'spawn-error', CRASHED: 'crashed', SIGNAL: 'signal', ABSENT: 'absent',
  // ARC-07-C2 — the class C5 did not have, because nothing had ever seen it: the wizard RAN and
  // refused its own arguments. It is the one an operator actually hit.
  USAGE: 'usage',
  // ARC-07-C10 — the wizard ran, asked, and did not get an answer it could save. Distinct from
  // USAGE because the remedy is the opposite: nothing is broken and the operator can finish it.
  REFUSED: 'refused',
});

/**
 * What a non-zero wizard exit MEANS, and what to do about it.
 *
 * `remedy: null` prints "none recorded — please report this", which is the right sentence for a
 * failure nobody anticipated and the wrong one for exit 2: the CLI's own usage code, raised because
 * this step passed argv the CLI would not take. That is a defect in the caller, and a report is
 * exactly what it needs — but it needs to say so rather than shrug.
 *
 * WHAT THIS CANNOT DO, stated because the obvious reading of the rule expects it: the wizard is
 * spawned with `stdio: 'inherit'` so it can mask a password on the operator's own terminal, which
 * means there is NO captured stderr here to quote. Its message is already on screen, above this
 * line. Capturing it would take the terminal away from the thing that needs it most.
 */
export function wizardExitFailure(status) {
  const nothingSaved = 'nothing was saved by B06';
  if (status === EXIT_USAGE_CODE) {
    return { status: 'fail', klass: WIZARD.USAGE,
      detail: `the wizard rejected its arguments (exit ${EXIT_USAGE_CODE}) — ${nothingSaved}. `
        + 'Its own message is above, in this terminal',
      // The claim is narrower than it was. This said "a defect in the bootstrap, not in what you
      // typed" — which was false for the owner at the S06 sitting, where it WAS what they typed:
      // exit 2 covered both a bad argv and a rejected interactive answer. The answer path returns
      // 1 now, so exit 2 really is argv B06 built; the sentence can be confident again because the
      // code it is reading finally means one thing.
      remedy: 'the arguments B06 passed were refused, which is a defect in the bootstrap rather '
        + `than in anything you typed: run \`${SPELL.cli} instance add <label>\` to finish the install, `
        + 'and please report the line above with the log from .local/logs/' };
  }
  // ARC-07-C10 — EXIT 1 IS THE USER'S ANSWER, NOT A DEFECT, and it used to carry no remedy at all.
  //
  // The wizard documents 1 as "nothing saved — a refusal, an abort, three failed attempts, or a
  // probe that failed": every one of those is something the operator did or something their
  // instance did, and all of them are recoverable by running the wizard again. Printing only
  // `the instance wizard exited 1` left the most common real failure with no next step, while the
  // exit-2 branch above — the one that CANNOT happen from a typed answer any more — had two.
  if (status === EXIT_FAILED_CODE) {
    return { status: 'fail', klass: WIZARD.REFUSED,
      detail: `the wizard did not save an instance (exit ${EXIT_FAILED_CODE}) — ${nothingSaved}. `
        + 'Its own message is above, in this terminal',
      // ARC-07-W11 — IT POINTS AT THE WIZARD'S OWN LINE rather than naming a command itself. This
      // said `instance add <label>`, which is (a) a second author for the same advice and (b) the
      // half-install: `instance add` alone skips B07 (toggles) and B08 (verify). The wizard now
      // prints the exact command including every non-secret answer already given, plus the bootstrap
      // alternative — so B06 has nothing left to guess. The exit-2 branch above keeps its own
      // command, because exit 2 means the wizard refused ARGV and never asked, so there is no line
      // of its own to point at.
      remedy: 'nothing here is broken: the wizard asked, and the answer it got was refused, '
        + 'abandoned, or could not be verified. It printed the command to resume with, above in '
        + 'this terminal — run that when you have what it asked for: a valid label, or credentials '
        + 'the instance accepts' };
  }
  return { status: 'fail', remedy: null,
    detail: `the instance wizard exited ${status ?? 'abnormally'} — ${nothingSaved}` };
}

/**
 * Wait for a probe, whatever shape the caller's `spawn` returns, AND keep what it printed.
 *
 * `awaitChild` above answers `{ status, signal }` and is right for the two call sites that hand the
 * terminal over with `stdio: 'inherit'` — there is nothing to collect. A probe is the opposite: its
 * whole purpose is the output, so this collects the pipes before resolving.
 *
 * Both shapes are accepted for the same reason `awaitChild` accepts both: the fakes are synchronous
 * and the runner's `spawn` (ARC-06-S03) is not. THAT is the defect this exists to close — ARC-09-S07
 * fixed exactly this confusion at the two sites below, and the probe was the third and was missed.
 * Handed a live `ChildProcess`, the old one interpolated a `Socket` into a template, compared
 * `"[object Object]"` against /\badd\b/ and answered `false` before the child had run — so
 * `mode live` could never reach the wizard on any machine, and only a human at a TTY could find it,
 * because every machine path enters B06 through `--instance-file`.
 */
/**
 * One failure line per probe class, each with a remedy somebody can act on.
 *
 * Only ABSENT gets `WIZARD_ABSENT` — the "re-bootstrap this build" sentence. Sending a user there
 * for a spawn error or a crashed CLI is what this whole chore exists to stop.
 */
export function wizardProbeFailure(probe) {
  switch (probe.klass) {
    case WIZARD.SPAWN_ERROR:
      return { status: 'fail', remedy: `run ${SPELL.cli} mode live again`,
        detail: `the wizard probe could not be started (${probe.detail}) — the build was never asked` };
    case WIZARD.SIGNAL:
      return { status: 'fail', remedy: `run ${SPELL.cli} mode live again, and report this if it repeats`,
        detail: `the wizard probe was killed by ${probe.signal} before it answered` };
    case WIZARD.CRASHED:
      return { status: 'fail', remedy: 'run: npm ci --omit=dev --ignore-scripts   (at the repository root)',
        detail: `the wizard probe exited ${probe.status}: ${probe.detail || 'no output'}` };
    default:
      return { status: 'fail', detail: WIZARD_ABSENT, remedy: null };
  }
}

export function awaitProbe(child) {
  if (!child || typeof child.on !== 'function') {
    // A synchronous result (spawnSync, or a test's fake). `error` is how spawnSync reports a spawn
    // that never happened; it is not an exception.
    return Promise.resolve({
      status: child?.status ?? null, signal: child?.signal ?? null,
      stdout: typeof child?.stdout === 'string' ? child.stdout : '',
      stderr: typeof child?.stderr === 'string' ? child.stderr : '',
      error: child?.error ?? null,
    });
  }
  return new Promise((resolve) => {
    let out = ''; let err = '';
    child.stdout?.setEncoding?.('utf8');
    child.stderr?.setEncoding?.('utf8');
    child.stdout?.on?.('data', (c) => { out += c; });
    child.stderr?.on?.('data', (c) => { err += c; });
    child.on('error', (error) => resolve({ status: null, signal: null, stdout: out, stderr: err, error }));
    child.on('close', (status, signal) => resolve({ status, signal, stdout: out, stderr: err, error: null }));
  });
}

/** The first line a reader would want — the one that says why, not the stack that followed it. */
export const firstLine = (text) => String(text ?? '').split('\n').map((l) => l.trim()).find(Boolean) ?? '';

/**
 * Probe the built CLI and say WHICH way it failed, not merely that it did.
 *
 * The order matters: a spawn that never happened has no exit code to read, and a child killed by a
 * signal has a null status that `!== 0` would call a crash. Only when the CLI actually ran and
 * exited cleanly is the absence of `add` a statement about the build.
 */
export async function probeWizard(root, { run = spawnSync } = {}) {
  const cli = join(root, CLI);
  if (!existsSync(cli)) return { klass: WIZARD.ABSENT, status: null, signal: null, detail: `${CLI} is not in this checkout` };
  const r = await awaitProbe(run(process.execPath, [cli, 'instance', '--help'],
    { encoding: 'utf8', stdio: 'pipe', cwd: root, env: productEnv(root) }));

  if (r.error) return { klass: WIZARD.SPAWN_ERROR, status: null, signal: null, detail: r.error.code || r.error.message };
  if (r.signal) return { klass: WIZARD.SIGNAL, status: null, signal: r.signal, detail: r.signal };
  if (r.status !== 0) {
    return { klass: WIZARD.CRASHED, status: r.status, signal: null, detail: firstLine(r.stderr) || firstLine(r.stdout) };
  }
  if (/\badd\b/.test(`${r.stdout}${r.stderr}`)) return { klass: WIZARD.OK, status: 0, signal: null, detail: '' };
  return { klass: WIZARD.ABSENT, status: 0, signal: null, detail: '' };
}

/** The boolean the step used to ask for. Kept because a probe that ran is still a yes/no question. */
export async function wizardAvailable(root, opts = {}) {
  return (await probeWizard(root, opts)).klass === WIZARD.OK;
}

/**
 * The file path: read, propose, probe once, save.
 *
 * The probe comes before the save and there is no retry: a non-interactive run has nobody to ask
 * for a corrected password, so a second attempt is the same wrong credential sent again — noise in
 * the instance's audit log, and on some configurations a lockout.
 */
export async function fromInstanceFile(ctx) {
  const contract = ctx.contract ?? JSON.parse(
    readFileSyncSafe(join(ctx.root, 'packages', 'snowarch', 'dist', 'contract.json')) ?? '{}');

  const file = await readInstanceFile(ctx.instanceFile, { root: ctx.root, contract,
    ...(ctx.plat ? { plat: ctx.plat } : {}), ...(ctx.gitRun ? { gitRun: ctx.gitRun } : {}) });
  if (!file.ok) return { status: 'fail', detail: file.reason, remedy: null };

  for (const note of file.notes) ctx.line?.(note);
  if (file.modeNote) ctx.line?.(`note: ${file.modeNote}`);

  const probe = ctx.probeAuth ?? probeAuth;
  for (const [label, entry] of Object.entries(file.store.instances)) {
    const result = await probe({ url: entry.url, username: entry.auth.username,
      password: entry.auth.password, ...(ctx.env ? { env: ctx.env } : {}) });
    if (!result.ok) {
      return { status: 'fail', remedy: null,
        detail: result.code === codeForStatus(401)
          ? SENTENCE.authFailed(label)
          : `${result.code} for "${label}" — nothing saved${result.detail ? ` (${result.detail})` : ''}` };
    }
  }

  const { saveStore } = await import('../../../../packages/snowarch/dist/store/index.js');
  const { completeFlags } = await import('../../../../packages/snowarch/dist/store/schema.js');
  const { expandPreset } = await import('../../../../packages/contract/lib/contract.mjs');

  // Every saved entry carries all six flags as byte-exact strings: the loader would fill the gaps
  // and warn, and a store written by the bootstrap should not be one the doctor has to correct.
  const instances = Object.fromEntries(Object.entries(file.store.instances).map(([label, e]) => [
    label,
    { ...e, flags: completeFlags(e.preset === 'custom' ? e.flags : expandPreset(contract, e.preset)) },
  ]));

  saveStore(storePath(ctx.root),
    { version: file.store.version, defaultInstance: file.defaultInstance, instances });

  ctx.line?.(SENTENCE.stillThere(ctx.instanceFile));
  const labels = Object.keys(instances);
  return {
    status: 'ok',
    detail: `${labels.length} instance(s) saved from the file`,
    // Labels are not secrets, but nothing about the URL, the user or the credential goes here.
    data: { saved: labels.length, defaultInstance: file.defaultInstance,
      probes: 'auth ok · others not probed' },
  };
}

/**
 * A store whose schema is behind gets MIGRATED — never re-wizarded.
 *
 * This is the branch the whole of S06 exists for. "Something about the store changed" has exactly
 * one safe answer when the thing that changed is its SHAPE, and re-running the wizard over
 * somebody's credentials is not it. The migration runs through the built CLI with `--yes` (the
 * plan was already shown and accepted at the bootstrap's own plan screen), writes its 0600 backup
 * and never touches a credential value.
 */
export async function migrateIfBehind(ctx) {
  const shape = shapeOf(ctx.root);
  if (!shape.present) return null;

  const current = await storeSchemaVersion(ctx.root);
  if (current === null || shape.version === null || shape.version === current) return null;
  if (shape.version > current) {
    // A store from the FUTURE is not this step's to fix: downgrading it would mean discarding
    // whatever the newer build added. The doctor's SV-09 says the same thing with the command.
    return { status: 'warn', remedy: null,
      detail: `store schema v${shape.version} is newer than this build's v${current} — `
        + `run ${SPELL.cli} upgrade` };
  }

  const spawn = ctx.spawn ?? spawnSync;
  const r = await awaitChild(spawn(process.execPath,
    [join(ctx.root, CLI), 'store', 'migrate', '--yes'],
    { stdio: 'inherit', cwd: ctx.root, env: productEnv(ctx.root) }));
  if (r.status !== 0) {
    // The child's own answer in the line: "exit 1" and "killed by SIGTERM" send a reader to
    // different places, and a message that says neither sends them to guess.
    const how = r.signal ? `killed by ${r.signal}` : `exit ${r.status ?? 'none'}`;
    return { status: 'fail', detail: `${MIGRATION_FAILED} (${how})`, remedy: null };
  }
  return { status: 'ok', detail: `store schema v${shape.version} → v${current} (migrated)`,
    data: { migratedFrom: shape.version, migratedTo: current } };
}

/** The schema this BUILD reads, from the contract — the same number S05's B06 row hashes. */
async function storeSchemaVersion(root) {
  const p = join(root, 'packages', 'snowarch', 'dist', 'contract.json');
  const text = readFileSyncSafe(p);
  if (text === null) return null;
  try {
    const v = JSON.parse(text)?.storeSchemaVersion;
    return Number.isInteger(v) ? v : null;
  } catch { return null; }
}

export const run = async (ctx) => {
  // BEFORE the instance-file and wizard paths, because both write a store and this decides
  // whether the store that is already there can be read at all.
  const migrated = await migrateIfBehind(ctx);
  if (migrated && migrated.status !== 'ok') return migrated;
  if (migrated) return migrated;

  if (ctx.instanceFile) return fromInstanceFile(ctx);

  // A design-only checkout reaches this step only because a store exists (`runsWhen`), and with
  // the store current there is nothing else here to do: the wizard is live mode's business.
  if (ctx.mode !== 'live') {
    return { status: 'ok', detail: 'store present and current; no wizard in design-only mode' };
  }

  const interactive = ctx.isTTY ?? Boolean(process.stdin.isTTY);

  // ARC-06-C16, corrected by ARC-08-C28 — NOTHING TO ADD IS NOT A FAILURE, **AND NOT A QUESTION**.
  //
  // C16 short-circuited only the NON-interactive case, on a premise written into the comment it
  // replaced: *"`upgrade` runs `bootstrap --mode live --yes`, which has no terminal"*. That premise
  // is false on every upgrade a person types. `upgrade.mjs`'s `finish()` spawns the bootstrap with
  // **`stdio: 'inherit'`**, so the child has the operator's terminal and `process.stdin.isTTY` is
  // true — the short-circuit was written for the CI path and never matched the path it was written
  // for. The owner's rc.6 → rc.9 upgrade reached `Label for this instance [pdi]`: the wizard, over
  // an instance the plan had just promised was untouched, on a run carrying `--yes`.
  //
  // And `--yes` could not stop it, because it never reached this decision at all.
  //
  // So the keep-path is decided by THE STORE, not by the terminal. B06's own input table already
  // said so and this code disagreed with it:
  //
  //   "MIGRATE, DON'T RE-WIZARD: a store whose schema is behind makes this step stale so the
  //    migration runs — and a store whose CONTENTS changed does not, because re-running the wizard
  //    over somebody's credentials is never the right answer to 'something moved'."
  //
  // The wizard exists to ADD an instance. A checkout that has one is not being asked to, whoever
  // is watching.
  const { readDefaultSummary } = await import('../../../../packages/snowarch/dist/store/label.js');
  const kept = readDefaultSummary(storePath(ctx.root));
  if (kept) {
    // ON THE LINE, not only in the state file. A person watching an upgrade reads the step line and
    // nothing else, and this step line said `ok` while the decision underneath it was the keep-path
    // ARC-08-C28 was raised over — the one where the wizard used to re-prompt over an existing
    // instance. "kept" without the reason reads as a status; with it, it reads as a choice. `data`
    // is untouched, so every JSON consumer sees exactly what it saw before.
    return { status: 'ok', showDetail: true,
      detail: `kept instance "${kept.label}"; the store already has one, so the wizard did not run`,
      data: { saved: 0, defaultInstance: kept.label, instance: kept, kept: true } };
  }

  // Nothing to keep. A run told not to ask REFUSES rather than asking — `--yes` means "do not put
  // a question in front of me", and a prompt is the one thing it must never produce. The sentence
  // names the flag that answers it without a terminal, which is the same remedy the no-terminal
  // path gives, because it is the same problem: an answer is needed and nobody can supply one.
  if (ctx.yes === true || !interactive) {
    return { status: 'fail', detail: NO_TERMINAL, remedy: null };
  }

  // The probe is CLASSIFIED (ARC-06-C5). A boolean here reported four different failures with one
  // sentence, and the sentence named the only cause it had not checked.
  const probe = await probeWizard(ctx.root, ctx.spawn ? { run: ctx.spawn } : {});
  if (probe.klass !== WIZARD.OK) return wizardProbeFailure(probe);

  // The terminal is handed over wholesale: the wizard prints its own secret-free summary, and this
  // step deliberately learns nothing from it beyond the exit code and what the STORE says
  // afterwards — never a URL, a username or a credential.
  const spawn = ctx.spawn ?? spawnSync;
  // AWAITED (ARC-09-S07). The runner's `spawn` is asynchronous, so the old `r.status` read an
  // undefined off a live ChildProcess and called a wizard that had not finished a failure.
  const r = await awaitChild(spawn(process.execPath,
    [join(ctx.root, CLI), ...WIZARD_ARGV],
    // The wizard writes the store; it must write THIS checkout's.
    { stdio: 'inherit', cwd: ctx.root, env: productEnv(ctx.root) }));
  if (r.status !== 0) return wizardExitFailure(r.status);

  // The same reader the keep-path above used; imported once, higher up, because a second
  // `const { readDefaultSummary }` in one function is a second binding of one name.
  const label = readDefaultSummary(storePath(ctx.root));
  // ARC-06-C15 — RECORD what the wizard just saved. `./snowarch mode` reported
  // `instance=<label> (unknown) preset=unknown` on every live checkout because it read
  // `state.instance` and `state.steps.B08.data.instance`, and nothing in the tree wrote either.
  // The step that watched the save is the step that should write it down (ARC-06-C7's rule for
  // the mode itself). Three non-secret fields, from a reader that cannot return more.
  return { status: 'ok', detail: label ? `default instance "${label.label}"` : 'wizard completed',
    data: { saved: label ? 1 : 0,
      defaultInstance: label?.label ?? null,
      ...(label ? { instance: label } : {}) } };
};
