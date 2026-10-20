// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// B02 docs — the corpus, obtained by calling ARC-03's recipe rather than by having one of its own.
//
// This step is glue, deliberately. `syncCorpus` decides what git does; `verifyCitations` decides
// what "the citations are fine" means; `docsStatus` measures. B02 maps their results onto a
// StepResult and prints one step line. Every temptation to re-derive any of that here would end
// with two answers to a question the operator asks once.
//
// The one judgement it does make is which failures stop an installation. A broken checkout does
// (nothing downstream can be grounded); a dead CITATION does not — the corpus is present, the fix
// belongs to a maintainer, and refusing to install over it would punish the wrong person.
import { execFileSync } from 'node:child_process';
import { CORPUS_DIR, EXIT as DOCS_EXIT, MODE, SyncError, syncCorpus } from '../docs/sync.mjs';
import { docsStatus } from '../docs/status.mjs';
import { verifyCitations } from '../docs/verify.mjs';
import { CORPUS_TEXT } from './format.mjs';
import { FILE, TEXT, ABSENT } from './inputs.mjs';
import { INPUTS } from '../inputs.mjs';
import { needSpell, spellings } from '../launcher-spelling.mjs';

export const id = 'B02';
export const title = 'docs';
export const needsNode = false;
export const runsWhen = (ctx) => ctx.docs !== 'skip';
export const skipReason = '--docs skip';
/** What skipping costs, said when the choice is made rather than sprung by the doctor later. */
export const skipNote = CORPUS_TEXT.skipConsequence;

/**
 * The gitlink, from the INDEX — the one value that changes exactly when the corpus is supposed to
 * be different. Hashing the checkout would mean reading 35,000 files to decide whether to skip a
 * step, and an unrelated `touch` would invalidate it.
 */
export function gitlink(root) {
  try {
    const out = execFileSync('git', ['ls-tree', 'HEAD', CORPUS_DIR],
      { cwd: root, encoding: 'utf8', stdio: 'pipe' });
    const m = /^160000 commit ([0-9a-f]{40})/.exec(out.trim());
    return m ? m[1] : ABSENT;
  } catch {
    return ABSENT;
  }
}

// ARC-09-S05: the declaration lives in `lib/inputs.mjs`. Ten steps answering "what are my
// inputs" in ten files is ten places to get the resume rule wrong, and no way to show a user the
// set — the table is one answer, and `docs/ARCHITECTURE.md` renders from it.
export const inputs = INPUTS.B02.resolve;

/** The docs family's exit codes → a StepResult, with the remedy each one actually needs. */
/**
 * ARC-07-C31 slice 4 — `spell` REQUIRED. One product caller, which would allow a default, and it is
 * required anyway because that caller has the ctx's shell: a default here would let the process answer
 * for a run that was told which platform it is spelling for.
 */
export function mapSyncFailure(error, spell) {
  needSpell(spell, 'mapSyncFailure');
  const message = error?.message ?? String(error);
  switch (error?.code) {
    case DOCS_EXIT.incomplete:
      return { status: 'fail', detail: message, remedy: `run ${spell.cli} docs sync` };
    case DOCS_EXIT.dirty:
      // ARC-03's own sentence, unaltered: it already says what to do, and re-phrasing it here
      // would give the same situation two descriptions depending on which command hit it.
      return { status: 'fail', detail: message, remedy: null };
    case DOCS_EXIT.git:
    case DOCS_EXIT.upstream:
      return { status: 'fail', detail: message, remedy: null };
    default:
      return { status: 'fail', detail: message, remedy: `run ${spell.cli} docs sync` };
  }
}

export const run = async (ctx) => {
  // ARC-07-C31 slice 4 — from the ctx, which carries BOTH platform and env since `stepContext`
  // gained a platform: a step spells the shell the RUN was told about, not the machine's.
  const spell = spellings({ platform: ctx.platform, env: ctx.env });
  // `skip` cannot reach here — `runsWhen` is false for it and the runner prints the skip line — so
  // `syncCorpus`'s own refusal of a "skip" mode is unreachable from this path. Asserted rather than
  // assumed: if it ever became reachable, the operator would see a refusal about a mode they chose.
  const mode = ctx.docs;
  if (mode !== MODE.sparse && mode !== MODE.full) {
    return { status: 'fail', detail: `B02 reached with docs mode "${mode}"`, remedy: null };
  }

  let result;
  try {
    result = syncCorpus({ root: ctx.root, config: ctx.config, mode, log: (l) => ctx.line?.(l) });
  } catch (e) {
    if (!(e instanceof SyncError)) throw e;
    return mapSyncFailure(e, spell);
  }

  if (!result.completeness.ok) {
    return { status: 'fail',
      detail: `${CORPUS_DIR} is incomplete after sync`, remedy: `run ${spell.cli} docs sync` };
  }

  // The size line is `docsStatus`'s measurement, not a second walk of the tree.
  const status = docsStatus({ root: ctx.root, verify: false, measure: true });
  ctx.line?.(`[docs] ${status.fileCount.toLocaleString('en-US')} files · `
    + `${Math.round(status.sizeBytes / (1024 * 1024))} MB working tree`);

  const citations = verifyCitations({ root: ctx.root });
  ctx.line?.(`citations: checked: ${citations.checked} | dead: ${citations.dead.length}`);

  // Numbers only. The state is read by the doctor and the launchers, and a path or a family name
  // in there would be a second source for something `engine.config.json` already owns.
  const data = { mode: result.mode, pin: ctx.config.docs.pin.slice(0, 7),
    files: status.fileCount, bytes: status.sizeBytes,
    checked: citations.checked, dead: citations.dead.length };
  ctx.state.docs = { mode: result.mode, pin: ctx.config.docs.pin };

  if (citations.dead.length > 0) {
    return { status: 'warn', data,
      detail: `${citations.dead.length} dead citation(s) — see ${spell.cli} docs verify` };
  }
  return { status: 'ok', data,
    detail: `${result.mode}, ${result.areas.length} areas` };
};
