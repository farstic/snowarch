// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-03-S07 — the maintainer refresh: move the pin forward, and show what it broke.
//
// A SEPARATE MODULE from `sync.mjs`, deliberately. `sync` is the user-safe local reconcile that
// bootstrap, the doctor and every developer run; this is a maintainer operation that mutates the
// repository's own configuration and stages a change for review. They share plumbing but not
// audience, not blast radius and not a report format — and `sync.mjs` was already the longest file
// in this directory. The import direction is one-way: upstream depends on sync, never the reverse.
//
// It never commits. The pin moves, the gitlink moves, both are staged, and a human reads the diff
// of dead citations before deciding. S09's workflow pastes the report below verbatim as a PR body
// and keys on exit 1, so the headings are a contract.
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { CORPUS_DIR, EXIT, SyncError, classifyGitFailure } from './sync.mjs';
import { applyAllTargets } from './recipe-block.mjs';
import { verifyCitations } from './verify.mjs';
import { needSpell, spellings } from '../launcher-spelling.mjs';

const raw = (args, cwd) => execFileSync('git', args, {
  cwd, encoding: 'utf8', stdio: 'pipe', maxBuffer: 64 * 1024 * 1024,
});
const run = (args, cwd) => raw(args, cwd).trim();

const probe = (args, cwd, { trim = true } = {}) => {
  try { return { ok: true, out: trim ? run(args, cwd) : raw(args, cwd) }; }
  catch (e) { return { ok: false, out: '', stderr: String(e.stderr ?? e.message ?? '') }; }
};

/** `%cs` — the commit date as `YYYY-MM-DD`, which is what the report shows. */
const dateOf = (sha, cwd) => probe(['log', '-1', '--format=%cs', sha], cwd).out || '????-??-??';

/**
 * Move `docs.pin` without reformatting the file around it.
 *
 * `JSON.parse` → `JSON.stringify` would rewrite key order, indentation and the trailing newline,
 * turning a one-token change into a whole-file diff that a reviewer has to read. The pin is a
 * 40-hex string in a file the schema validates, so replacing that one string is both sufficient and
 * the smallest possible change. The old value is matched exactly rather than by pattern, so a file
 * that does not contain the pin we think it does fails loudly instead of being rewritten.
 */
export function writePin(root, from, to) {
  const p = join(root, 'engine.config.json');
  const text = readFileSync(p, 'utf8');
  const needle = `"${from}"`;
  const hits = text.split(needle).length - 1;
  if (hits !== 1) {
    throw new SyncError(`engine.config.json holds ${hits} occurrence(s) of the current pin — `
      + 'refusing to rewrite a file that is not the shape this expects', EXIT.git);
  }
  writeFileSync(p, text.replace(needle, `"${to}"`));
  return { path: 'engine.config.json' };
}

/** Dead entries keyed so before and after can be compared. */
const keyOf = (d) => `${d.file}:${d.line} ${d.path}`;

/**
 * The maintainer refresh.
 *
 * Order matters and is the story's: refuse a dirty tree BEFORE any network call, fetch, resolve,
 * baseline-verify at the current pin, move, verify again, write the pin, stage. The baseline runs
 * before the checkout because "which citations BECAME dead" is a difference between two states, and
 * the first state stops existing the moment the corpus moves.
 */
/**
 * ARC-07-C31 — REQUIRED, THREE callers, and one of them is not a terminal at all.
 *
 * `tools/snowarch/lib/docs/cli.mjs:56` and `tools/snowarch/lib/docs/family.mjs:230` print to a
 * terminal. `scripts/docs-bump.mjs:98` does NOT: it puts this sentence into a GitHub Actions
 * annotation (`::error::`) and into a PR body written with `--body-out`, read later by a maintainer.
 * That third audience is the whole reason the default had to go — it was hiding a second shell shape
 * behind a parameter that looked settled. `docs-bump.yml` is `runs-on: ubuntu-latest`, so the process
 * rendering happens to be POSIX there today, and "happens to be" is not a property to rest on.
 */
export function syncUpstream({ root = process.cwd(), config, to = null, verify = true,
  log = console.log, spell } = {}) {
  needSpell(spell, 'syncUpstream');
  const { docs } = config;
  const corpus = join(root, CORPUS_DIR);
  // ARC-07-C31 — the spelling travels IN the ctx `classifyGitFailure` already takes, so its four call
  // sites need no new argument and cannot disagree about which shell this run is speaking to.
  const ctx = { upstream: docs.upstream, pin: docs.pin, spell };

  // 1. Dirty check, outside `vendor/` only: the corpus itself is about to move, and its own
  //    modified state is `sync`'s business (exit 4 there), not this command's.
  // NOT trimmed, and not read positionally by accident: `git status --porcelain` lines are
  // `XY<space>PATH`, and for a modified-but-unstaged path X is a SPACE. Trimming the output eats
  // that space on the first line and shifts the path by one character — which is exactly what the
  // first run of this code did, reporting `endor/ServiceNowDocs`.
  const porcelain = probe(['status', '--porcelain'], root, { trim: false }).out;
  const dirty = porcelain.split('\n').filter(Boolean)
    .map((l) => l.slice(3).replace(/^"|"$/g, '').split(' -> ').pop().trim())
    .filter(Boolean)
    .filter((f) => !f.startsWith('vendor/'));
  if (dirty.length > 0) {
    throw new SyncError(`working tree not clean — commit or stash first: ${dirty.join(', ')}`,
      EXIT.dirty);
  }

  // 2. Fetch. A named SHA is fetched by hash; otherwise the family branch.
  const target = to ?? docs.family;
  const fetched = probe(['fetch', '--depth', '1', 'origin', target], corpus);
  if (!fetched.ok) {
    const err = fetched.stderr.toLowerCase();
    if (err.includes("couldn't find remote ref") || err.includes('could not find remote ref')
        || err.includes('not our ref')) {
      throw new SyncError(to
        ? `sha ${to} not fetchable from upstream — is it reachable from branch '${docs.family}'?`
        : `upstream branch '${docs.family}' not found — the release family may have moved; `
          + `run ${spell.cli} docs family <name> --dry-run`,
      EXIT.upstream);
    }
    throw new SyncError(classifyGitFailure(fetched.stderr, ctx), EXIT.git);
  }

  const resolved = probe(['rev-parse', 'FETCH_HEAD^{commit}'], corpus);
  if (!resolved.ok) throw new SyncError(classifyGitFailure(resolved.stderr, ctx), EXIT.git);
  const newPin = resolved.out;

  // 3. Baseline, at the pin we are about to leave.
  const before = verify ? verifyCitations({ root }) : null;

  // 4. Move. The sparse set is untouched — this changes WHICH commit, never which areas.
  const moved = probe(['checkout', '--detach', newPin], corpus);
  if (!moved.ok) throw new SyncError(classifyGitFailure(moved.stderr, ctx), EXIT.git);

  const after = verify ? verifyCitations({ root }) : null;

  // 5. The pin, then everything generated FROM the pin, then the staging. Nothing is committed,
  //    here or anywhere below.
  //
  //    The recipe block in `docs/ARCHITECTURE.md` embeds the pin twice, so the instant the line
  //    above runs, that block is stale — and the bump pull request would carry a document
  //    contradicting the config it ships with, plus a red `gen-docs-recipe --check` in its own CI.
  //    Regenerating it here is not tidying: a generated file that depends on a value this command
  //    moves is this command's output too. Order is forced — the generator reads the pin from
  //    `engine.config.json`, so it has to run after the write, not beside it.
  writePin(root, docs.pin, newPin);
  //    Re-read rather than reuse the caller's `config`: that object still holds the pin we just
  //    left, and rendering the block from it would produce the OLD recipe, report `current`, and
  //    stage nothing — a fix that looks like it works. Reading back also parses what `writePin`
  //    produced, so a write that damaged the file fails here rather than in someone's CI.
  const pinned = JSON.parse(readFileSync(join(root, 'engine.config.json'), 'utf8'));
  // THREE generated targets since ARC-06-S06 — the published block and the two launcher recipe
  // files — so a bump stages up to five paths and exactly two when the pin does not move. Whatever
  // came back `written` is staged; a target a fixture tree does not have reports `absent` and is
  // simply not there to stage.
  const recipe = applyAllTargets({ root, config: pinned });

  const staged = ['engine.config.json', CORPUS_DIR,
    ...recipe.filter((r) => r.status === 'written').map((r) => r.path)];
  run(['add', '--', ...staged], root);

  const beforeDead = new Set((before?.dead ?? []).map(keyOf));
  const afterDead = new Set((after?.dead ?? []).map(keyOf));
  const newlyDead = (after?.dead ?? []).filter((d) => !beforeDead.has(keyOf(d)));
  const healed = (before?.dead ?? []).filter((d) => !afterDead.has(keyOf(d)));

  // An upstream that rewrote history can leave the family tip BEHIND the current pin. The ruling
  // (2026-09-09) is to follow it rather than refuse: the pin records what upstream publishes, and
  // silently staying put would hide the rewrite. It is said out loud on the pin line instead.
  const olderThanPin = probe(['merge-base', '--is-ancestor', newPin, docs.pin], corpus).ok
    && newPin !== docs.pin;

  const result = {
    from: docs.pin, to: newPin,
    fromDate: dateOf(docs.pin, corpus), upstreamDate: dateOf(newPin, corpus),
    checkedBefore: before?.checked ?? null, checkedAfter: after?.checked ?? null,
    deadBefore: before?.dead.length ?? null, deadAfter: after?.dead.length ?? null,
    newlyDead, healed, olderThanPin, verified: verify,
    recipe: Object.fromEntries(recipe.map((r) => [r.target, r.status])),
    staged,
  };
  if (log) log(formatUpstream(result).text);
  return result;
}

/**
 * The report. S09 pastes this verbatim into a PR body, so the headings are fixed text.
 */
export function formatUpstream(r) {
  const s7 = (x) => x.slice(0, 7);
  const lines = [];
  lines.push(`docs pin: ${s7(r.from)} (${r.fromDate}) → ${s7(r.to)} (${r.upstreamDate})`
    + (r.olderThanPin ? ' (older than the current pin)' : ''));
  lines.push(r.verified
    ? `citations: checked: ${r.checkedBefore} | dead: ${r.deadBefore} → `
      + `checked: ${r.checkedAfter} | dead: ${r.deadAfter}`
    : 'citations: not verified (--no-verify)');

  if (r.verified) {
    lines.push(`newly dead (${r.newlyDead.length}):`);
    for (const d of r.newlyDead) lines.push(`  DEAD ${d.file}:${d.line} ${d.path}`);
    lines.push(`healed (${r.healed.length})`);
    for (const d of r.healed) lines.push(`  ${d.file}:${d.line} ${d.path}`);
  }

  // Only the unhappy status earns a line. `written` and `current` are already visible — the first
  // as a third entry on `staged:`, the second as its absence — and a line that says "nothing was
  // wrong" on every run is a line reviewers stop reading. `no-markers` is the one case where the
  // block silently did NOT move with the pin, which is exactly what this must never do quietly.
  for (const [target, status] of Object.entries(r.recipe ?? {})) {
    if (status === 'no-markers') {
      lines.push(`recipe: the ${target} target has lost its generator markers — it was NOT `
        + 'regenerated and now contradicts the pin above');
    }
  }

  lines.push(`staged: ${r.staged.join(', ')} — review, then: `
    + `git commit -m "chore(docs): bump ServiceNowDocs to ${s7(r.to)}"`);
  return { text: lines.join('\n'), code: r.newlyDead.length > 0 ? EXIT.incomplete : EXIT.ok };
}
