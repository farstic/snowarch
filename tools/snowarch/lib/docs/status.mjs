// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-03-S06 — one description of the corpus, computed here and wrapped everywhere else.
//
// The doctor (ARC-08) and the `/snowarch status` skill both need to say whether the corpus is
// present, pinned, on the right family, correctly sparse and fully cited. Before this file each
// would have re-derived it from git, and two derivations of the same fact are one that will
// disagree. This computes; ARC-08 assigns check ids, severities and `--fix` actions to what it
// returns. Nothing here ever touches the network — `--fetch` is S07's.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { statePath } from '../local-paths.mjs';
import { ALWAYS_DIRS, CORPUS_DIR, MODE, ROOT_FILES, readAreas } from './sync.mjs';
import { verifyCitations } from './verify.mjs';
import { needSpell, spellings } from '../text.mjs';
import { restoreRemedy } from '../licence/manifest.mjs';

/**
 * The doctor's E-12 line, owned here and imported by ARC-08 — never retyped.
 *
 * It is a FAIL and never a WARN or a SKIP. An absent corpus means every citation in every skill is
 * unverified, and the engine's whole claim is that its ServiceNow facts are grounded; reporting that
 * as a warning would be reporting the failure of the thing the product is for as a note in the
 * margin. The mode is quoted because "skip" and "sparse" fail for different reasons — one was asked
 * for, the other went wrong — and the remedy is the same command either way.
 */
/**
 * ARC-07-C31 — the spelling is REQUIRED here, and this one is not a style choice.
 *
 * TWO CONSUMERS WITH TWO DIFFERENT SHELLS: `docs status` renders for the terminal in front of it,
 * and `doctor/checks/engine-docs.mjs` renders for the ctx it was given, which a win32 case drives.
 * A default would satisfy the first and silently give the second the process — which is exactly the
 * defect that cost twelve Windows cells when `MODE_VARIANTS` read the process.
 */
export const E12_ABSENT = (mode, spell) =>
  `E-12 docs corpus: FAIL — corpus absent (docs mode "${mode}"); grounding and citations are `
  + `unverified — run ${needSpell(spell, 'E12_ABSENT').cli} docs sync`;

/** The object's version. Additions are non-breaking; a removal or a changed meaning is not. */
export const SCHEMA = 1;

/**
 * The four shapes a checkout can be in.
 *
 * `full` is `MODE.full` rather than a second spelling of the word: "the whole corpus is on disk" is
 * the same claim whether it arrives as a requested mode or as an observed shape, and writing it
 * twice would be two definitions of one fact — and two literals for the ARC-05-S10 scan to judge,
 * where the allow-list already carries exactly one argued row for this homograph.
 */
export const SPARSE = Object.freeze({ cone: 'cone', full: MODE.full, pattern: 'pattern', none: 'none' });

const git = (args, cwd) => {
  try {
    return {
      ok: true,
      out: execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe', maxBuffer: 64 * 1024 * 1024 }).trim(),
    };
  } catch { return { ok: false, out: '' }; }
};

/**
 * The gitlink the superproject records — from the INDEX, falling back to HEAD.
 *
 * After `docs sync --upstream` the moved gitlink is staged and not yet committed, so HEAD still
 * holds the old commit while the index holds the new one. Reading HEAD would report a MISMATCH
 * against a pin the maintainer has just deliberately moved, which is the opposite of useful. The
 * index is what will be committed, so the index is what is reported — and `gitlinkStaged` says so,
 * because "this is not committed yet" is worth seeing.
 */
function gitlinkOf(root) {
  // The two commands print the mode differently and neither is `160000 <sha>` alone:
  //   ls-tree      `160000 commit <sha>\t<path>`
  //   ls-files -s  `160000 <sha> <stage>\t<path>`
  // Reading one format for both silently returned null for the index, which is how the staged
  // gitlink went unnoticed on the first run.
  const shaFrom = (r, re) => {
    if (!r.ok) return null;
    const m = re.exec(r.out);
    return m ? m[1] : null;
  };
  const head = shaFrom(git(['ls-tree', 'HEAD', '--', CORPUS_DIR], root), /^160000 commit ([0-9a-f]{40})/);
  const index = shaFrom(git(['ls-files', '--stage', '--', CORPUS_DIR], root), /^160000 ([0-9a-f]{40})/);
  return { sha: index ?? head, staged: index !== null && head !== null && index !== head };
}

/**
 * Which branch the checkout is on — the family it should be, not merely where HEAD points.
 *
 * Recipe C leaves a DETACHED HEAD at the pin, so `rev-parse --abbrev-ref HEAD` says `HEAD` and
 * tells us nothing about the family. The branch that actually matters is the remote branch the
 * clone tracks, so it is read from the clone's own config.
 */
function branchOf(corpus) {
  const head = git(['rev-parse', '--abbrev-ref', 'HEAD'], corpus).out;
  if (head && head !== 'HEAD') return head;
  const remote = git(['config', '--get', 'remote.origin.fetch'], corpus).out;
  const m = /refs\/heads\/([^:*]+)/.exec(remote);
  return m ? m[1] : null;
}

/**
 * `cone` | `full` | `pattern` | `none`.
 *
 * `pattern` is the ADR-0008 shape — sparse checkout on, cone mode off, which is what git 2.34.1
 * silently produces from `set --cone` and which omits the corpus's root files. It is reported as
 * its own value rather than folded into `cone`, because the remedy differs.
 */
function sparseOf(corpus) {
  if (!existsSync(join(corpus, '.git'))) return SPARSE.none;
  const on = git(['config', '--get', 'core.sparseCheckout'], corpus).out === 'true';
  if (!on) return SPARSE.full;
  return git(['config', '--get', 'core.sparseCheckoutCone'], corpus).out === 'true' ? SPARSE.cone : SPARSE.pattern;
}

/**
 * The recorded mode, and the checkout's shape, are two different questions.
 *
 * `mode` is what the operator ASKED for — ARC-06 writes it to `.local/bootstrap-state.json` — and
 * `sparse` is what is on disk. They can disagree (a state file saying `sparse` over a full
 * checkout), and reporting both is the point: the disagreement is the finding.
 */
function recordedMode(root) {
  const p = statePath(root);
  if (!existsSync(p)) return null;
  try {
    const m = JSON.parse(readFileSync(p, 'utf8'))?.docs?.mode;
    return (m === MODE.sparse || m === MODE.full || m === 'skip') ? m : null;
  } catch { return null; }
}

/** Files and bytes under the corpus, `.git` excluded. ~1 s over 35k files, so it is opt-in. */
function measure(corpus) {
  let fileCount = 0, sizeBytes = 0;
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name === '.git') continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile()) { fileCount += 1; sizeBytes += statSync(p).size; }
    }
  };
  walk(corpus);
  return { fileCount, sizeBytes };
}

/**
 * ARC-08-C19 — the corpus, as much of it as a `--quick` run may pay for.
 *
 * `docsStatus` is not available to a quick run: it spawns git five times — `rev-parse` in the
 * submodule, `branchOf`, `sparseOf`, and `gitlinkOf`'s two — and `verify: false` does not change
 * that, it only skips `verifyCitations`. ARC-09-C8 moved E-12…E-15 out of the quick subset for
 * exactly that cost, and the consequence nobody had noticed was that `engine.docs` came back null,
 * so the panel's `Docs:` line — the one carrying the release family a grounding decision turns on —
 * was omitted on the one run SKILL.md mandates.
 *
 * WHAT THIS COSTS: two file reads the doctor has already done, one `existsSync`, and ONE bounded
 * git call.
 *
 *   `pin` and `family`    `engine.config.json`, already parsed by `doctorCommand`
 *   `mode`                `.local/bootstrap-state.json`, already read for `registration`
 *   `present`             one `existsSync`
 *   `head`                `git rev-parse HEAD` in the submodule — the one call
 *
 * THE ONE CALL IS THE POINT, not a convenience. Without it this function reports the corpus the
 * checkout is CONFIGURED for, and a `Docs:` line naming a pin the corpus has drifted off would be
 * asserting what it did not measure — the defect this programme has spent the week removing. With
 * it, `headMatchesPin` is a measurement, and a drifted corpus says so on the first line a session
 * prints. Bounded and offline: `rev-parse` reads `.git/HEAD`, touches no network, and carries an
 * explicit timeout, because C8's contract is about the worst case and the shared `git()` helper
 * above has no deadline at all.
 *
 * Every field this cannot know stays `null`, which schema v1 already defines as "no check filled
 * it": `citations`, `branch`, `familyMatches`, `gitlink`, `pinMatchesGitlink`. `family` is the
 * CONFIGURED family and `branch` is what the corpus is actually on; naming the first as if it were
 * the second is the same error one layer down, so only the first is filled here.
 */
export function configuredDocs({ root = process.cwd(), exec = execFileSync, timeoutMs = 2000 } = {}) {
  let docs;
  try {
    ({ docs } = JSON.parse(readFileSync(join(root, 'engine.config.json'), 'utf8')));
  } catch { return null; }
  if (!docs) return null;

  const corpus = join(root, CORPUS_DIR);
  const present = existsSync(join(corpus, 'markdown'));

  let head = null;
  if (present) {
    try {
      head = exec('git', ['rev-parse', 'HEAD'],
        { cwd: corpus, encoding: 'utf8', stdio: 'pipe', timeout: timeoutMs, maxBuffer: 1024 * 64 })
        .trim() || null;
    } catch { head = null; }
  }

  return {
    present,
    path: CORPUS_DIR,
    pin: docs.pin ?? null,
    family: docs.family ?? null,
    mode: recordedMode(root),
    head,
    // `null` when there was nothing to compare, not `false`: a corpus that is absent has not
    // failed to match a pin, and the two readings send a reader to different remedies.
    headMatchesPin: head === null || !docs.pin ? null : head === docs.pin,
    gitlink: null,
    pinMatchesGitlink: null,
    branch: null,
    familyMatches: null,
    citations: null,
    dead: null,
    source: 'configured',
  };
}

/**
 * Everything ARC-08 needs about the corpus, in one object.
 *
 * `verify` defaults to true. The doctor's `--quick` path and the SessionStart banner pass
 * `verify: false` and get `citations: null` — the KEY IS ALWAYS PRESENT, so a consumer distinguishes
 * "not asked" from "asked and empty" without knowing which caller it is. `measure` is opt-in for
 * the same reason: a 35k-file walk does not belong in a hook's budget.
 */
export function docsStatus({ root = process.cwd(), verify = true, measure: doMeasure = verify } = {}) {
  const config = JSON.parse(readFileSync(join(root, 'engine.config.json'), 'utf8'));
  const { docs } = config;
  const corpus = join(root, CORPUS_DIR);
  const present = existsSync(join(corpus, 'markdown'));

  let areasExpected = [];
  try { areasExpected = readAreas(root, docs.areasFile); } catch { /* generated file absent */ }

  const base = {
    present, path: CORPUS_DIR, pin: docs.pin, gitlink: null, gitlinkStaged: false,
    head: null, pinMatchesGitlink: null, headMatchesPin: null,
    family: docs.family, branch: null, familyMatches: null,
    sparse: 'none', areasExpected, areasPresent: [], areasMissing: areasExpected,
    // ADR-0008's other half. `checkCompleteness` has always checked these at SYNC time; nothing
    // read them afterwards, so a corpus that lost `LICENSE` — pruned by hand, a half-finished
    // checkout, a `git clean` — passed every doctor check ever written. An absent corpus is
    // missing all of them, which is the honest reading rather than an empty list.
    rootMissing: [...ROOT_FILES, ...ALWAYS_DIRS],
    mode: recordedMode(root), fileCount: null, sizeBytes: null,
    citations: null,
    // Only meaningful on Windows: elsewhere the setting does not exist and `false` would read as
    // "off", which is a different claim from "not applicable".
    longpaths: null,
    schema: SCHEMA,
  };
  const link = gitlinkOf(root);
  base.gitlink = link.sha;
  base.gitlinkStaged = link.staged;
  base.pinMatchesGitlink = base.gitlink === null ? null : base.gitlink === docs.pin;

  if (!present) {
    // No corpus and no state file: there is nothing to infer FROM. S06's rule reads the shape of the
    // checkout, and an absent checkout has no shape — so the mode is reported as `skip`, which is
    // the honest reading of "no corpus is here and nothing says one was ever asked for". A recorded
    // mode still wins: an operator who asked for `sparse` and has no corpus has a broken install,
    // not a skipped one, and E-12 quotes the difference.
    base.mode = base.mode ?? 'skip';
    if (verify) base.citations = verifyCitations({ root });
    return base;
  }

  const head = git(['rev-parse', 'HEAD'], corpus).out || null;
  const branch = branchOf(corpus);
  const sparse = sparseOf(corpus);
  const areasPresent = areasExpected.filter((a) => existsSync(join(corpus, ...a.split('/'))));

  const out = {
    ...base,
    head,
    headMatchesPin: head === docs.pin,
    branch,
    familyMatches: branch === docs.family,
    sparse,
    areasPresent,
    areasMissing: areasExpected.filter((a) => !areasPresent.includes(a)),
    // One definition of "the files every corpus has", imported from the module that already owns
    // it rather than retyped here — `ROOT_FILES` is `checkCompleteness`'s list, and a second copy
    // would be a second thing to keep in step.
    rootMissing: [...ROOT_FILES, ...ALWAYS_DIRS].filter((f) => !existsSync(join(corpus, f))),
    mode: base.mode ?? (sparse === SPARSE.full ? MODE.full : MODE.sparse),
    longpaths: process.platform === 'win32'
      ? git(['config', '--get', 'core.longpaths'], corpus).out === 'true'
      : null,
  };
  if (doMeasure) Object.assign(out, measure(corpus));
  if (verify) out.citations = verifyCitations({ root });
  return out;
}

const short = (sha) => (sha ? sha.slice(0, 7) : '—');
const commas = (n) => (n === null ? '—' : n.toLocaleString('en-US'));
const mb = (b) => (b === null ? '—' : `${Math.round(b / 1_000_000)} MB`);

/**
 * The human screen, and the exit code that goes with it.
 *
 * One line per fact with its verdict in the last column and, when it is not `ok`, the remedy on the
 * next line. The wording is reused verbatim by the doctor, so it is written once here.
 */
  // ARC-07-C31 — A DEFAULT IS ALLOWED HERE BECAUSE THERE IS EXACTLY ONE CALLER, NAMED: `tools/snowarch/lib/docs/cli.mjs:159`, printing to a terminal.
  // The rule this row settled is that a default needs literally one caller and a comment saying
  // which; everything else takes the spelling required. `loadState` is why the rule is that
  // narrow — it had ten callers and seven held a ctx, and a default would have handed each the
  // process.
// ARC-09-C185a — `engineering`: whether this tree is the engineering checkout, where the maintainer moves the pin. The
// caller says so (isEngineeringCheckout); an install reads E-32's remedy instead, because its pin is a shipped file.
export function formatStatus(s, spell = spellings(), { engineering = false } = {}) {
  if (!s.present) {
    return {
      text: [
        `docs corpus: MISSING — run ${spell.bootstrap} --docs sparse `
        + '(or node scripts/docs.mjs sync)',
        // The doctor's exact line, so `docs status` and the doctor cannot disagree about what an
        // absent corpus means or what to do about it.
        E12_ABSENT(s.mode, spell),
      ].join('\n'),
      code: 3,
    };
  }

  const rows = [];
  const add = (label, body, ok, remedy) => rows.push({ label, body, ok, remedy });

  add('pin', `${short(s.pin)}  gitlink ${short(s.gitlink)}${s.gitlinkStaged ? ' (staged)' : ''}  HEAD ${short(s.head)}`,
    s.headMatchesPin && s.pinMatchesGitlink !== false,
    s.pinMatchesGitlink === false
      // S01's lint prints this sentence too; the two must not diverge. S07/S09 own the script.
      ? (engineering ? `maintainer: node scripts/docs-bump.mjs --to ${s.gitlink ?? '<gitlink>'}` : restoreRemedy(spell.cli))
      : 'run node scripts/docs.mjs sync');

  add('family', `${s.family}  branch ${s.branch ?? '—'}`, s.familyMatches === true,
    'run node scripts/docs.mjs sync');

  const shape = s.sparse === SPARSE.cone ? 'sparse (cone)'
    : s.sparse === SPARSE.full ? SPARSE.full
      : s.sparse === SPARSE.pattern ? 'sparse (PATTERN mode — root files may be missing)' : SPARSE.none;
  const size = s.fileCount === null ? shape
    : `${shape}, ${s.areasPresent.length}/${s.areasExpected.length} areas, ${commas(s.fileCount)} files, ${mb(s.sizeBytes)}`;
  add('checkout', s.fileCount === null
    ? `${shape}, ${s.areasPresent.length}/${s.areasExpected.length} areas`
    : size,
  s.areasMissing.length === 0 && s.sparse !== SPARSE.pattern,
  s.areasMissing.length ? `missing: ${s.areasMissing.join(', ')} — run node scripts/docs.mjs sync`
    : 'run node scripts/docs.mjs sync');

  if (s.citations) {
    add('citations', `checked: ${s.citations.checked} | dead: ${s.citations.dead.length}`,
      s.citations.status === 'ok' && s.citations.dead.length === 0,
      'run node scripts/docs.mjs verify');
  }

  const width = Math.max(...rows.map((r) => r.body.length)) + 2;
  const lines = [`docs corpus: ${s.path}`];
  for (const r of rows) {
    lines.push(`  ${r.label.padEnd(10)} ${r.body.padEnd(width)}${r.ok ? 'ok' : 'MISMATCH'}`);
    if (!r.ok) lines.push(`             ${r.remedy}`);
  }
  return { text: lines.join('\n'), code: rows.every((r) => r.ok) ? 0 : 1 };
}
