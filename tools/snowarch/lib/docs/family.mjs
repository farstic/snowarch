// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-03-S08 — switching release family: propose the whole edit, then apply it.
//
// The dry run IS the proposal (design principle 10). Everything this command would touch is printed
// first, in the form it will be written, and `--yes` applies exactly that — no line is edited that
// was not shown. What it cannot do is rewrite platform FACTS: a table that exists in one family and
// not the next is a human's judgement, so those lines are listed under REVIEW rather than guessed at.
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, relative } from 'node:path';
import { CORPUS_DIR, EXIT, SyncError } from './sync.mjs';
import { syncUpstream, formatUpstream } from './upstream.mjs';
import { needSpell, spellings } from '../launcher-spelling.mjs';

/** `--dry-run`/`--yes` were both omitted: the plan is printed and nothing is applied. */
export const EXIT_NEEDS_YES = 2;

const run = (args, cwd) => execFileSync('git', args, {
  cwd, encoding: 'utf8', stdio: 'pipe', maxBuffer: 64 * 1024 * 1024,
}).trim();
const probe = (args, cwd) => {
  try { return { ok: true, out: run(args, cwd) }; }
  catch (e) { return { ok: false, out: '', stderr: String(e.stderr ?? e.message ?? '') }; }
};

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * The files a family switch may edit.
 *
 * History is not here and never will be: `docs/plans`, `docs/spikes`, `docs/decisions`, the
 * changelog and RELICENSING describe what was true when they were written, and rewriting them to
 * match today's family would be falsifying a record to keep a search clean.
 */
export const SCAN_ROOTS = [
  '.claude/skills', '.claude/agents', 'CLAUDE.md', 'governance',
];

function scanFiles(root) {
  const out = [];
  for (const r of SCAN_ROOTS) {
    const abs = join(root, r);
    if (!existsSync(abs)) continue;
    if (statSync(abs).isFile()) { out.push(abs); continue; }
    const walk = (d) => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const p = join(d, e.name);
        if (e.isDirectory()) walk(p);
        else if (/^(SKILL|EXAMPLES)\.md$/.test(e.name) || (r === 'governance' && e.name.endsWith('.md'))
          || (r === '.claude/agents' && e.name.endsWith('.md'))) out.push(p);
      }
    };
    walk(abs);
  }
  return out;
}

/**
 * The phrase set, longest first.
 *
 * Longest-first matters: `(Australia branch)` contains `Australia branch`, and matching the inner
 * form would edit the same words twice and report two edits where a reader sees one.
 */
function forms(old) {
  const o = cap(old);
  return [
    new RegExp(`ServiceNowDocs ${o} branch`, 'g'),
    new RegExp(`\\(${o} branch\\)`, 'g'),
    new RegExp(`${o} release family`, 'g'),
    new RegExp(`${o} branch`, 'g'),
    // `Old release` only when what follows makes it a family reference rather than prose.
    new RegExp(`${o} release(?=[).]|$)`, 'g'),
  ];
}

/**
 * EDIT or REVIEW, per line.
 *
 * **A line is EDIT only if every mention of the family word on it sits inside a matched form.** One
 * stray mention — "NOT available in Australia release family, unlike Vancouver" — and the whole line
 * goes to REVIEW, because a partial substitution would leave a sentence that is half about the new
 * family and half about the old, which is worse than not touching it.
 */
export function classifyLine(text, old, to) {
  const o = cap(old), n = cap(to);
  const word = new RegExp(`\\b${o}\\b`, 'g');
  const total = (text.match(word) ?? []).length;
  if (total === 0) return { kind: 'skip' };

  let covered = 0;
  let edited = text;
  for (const re of forms(old)) {
    edited = edited.replace(re, (m) => {
      covered += (m.match(word) ?? []).length;
      return m.replaceAll(o, n);
    });
  }
  if (covered === 0) return { kind: 'review', text };
  return covered === total ? { kind: 'edit', before: text, after: edited } : { kind: 'review', text };
}

/**
 * The whole plan, computed and written nowhere.
 *
 * `planFamilySwitch` touches no file and makes exactly one network call — `ls-remote`, to find out
 * whether the branch exists at all, which a dry run has to know and cannot learn offline.
 */
  // ARC-07-C31 — A DEFAULT IS ALLOWED HERE BECAUSE THERE IS EXACTLY ONE CALLER, NAMED: `tools/snowarch/lib/docs/cli.mjs:132`.
  // The rule this row settled is that a default needs literally one caller and a comment saying
  // which; everything else takes the spelling required. `loadState` is why the rule is that
  // narrow — it had ten callers and seven held a ctx, and a default would have handed each the
  // process.
export function planFamilySwitch({ root = process.cwd(), config, to, from = null,
  spell = spellings() } = {}) {
  if (!/^[a-z][a-z0-9-]*$/.test(to)) {
    throw new SyncError(`"${to}" is not a family name — expected lowercase letters, digits and hyphens`,
      EXIT.git);
  }
  const old = from ?? config.docs.family;
  if (old === to) return { root, from: old, to, already: true, edits: [], review: [], schemaEdit: null };

  // Network, even in a dry run — and the output says so, because a maintainer running `--dry-run`
  // on a plane deserves to know why it failed.
  const remote = probe(['ls-remote', '--heads', config.docs.upstream, to], root);
  if (!remote.ok || remote.out === '') {
    throw new SyncError(`upstream branch '${to}' not found — the release family may have moved; `
      + `run ${spell.cli} docs family <name> --dry-run`, EXIT.upstream);
  }
  const tip = remote.out.split(/\s+/)[0];

  const edits = [], review = [];

  // The two configuration edits, always first and always exactly these.
  const gitmodules = join(root, '.gitmodules');
  if (existsSync(gitmodules)) {
    const text = readFileSync(gitmodules, 'utf8');
    if (text.includes(`branch = ${old}`)) {
      edits.push({ file: '.gitmodules', line: null, kind: 'config',
        before: `branch = ${old}`, after: `branch = ${to}` });
    }
  }
  edits.push({ file: 'engine.config.json', line: null, kind: 'config',
    before: `docs.family "${old}"`, after: `"${to}"` });

  // The schema enum, when the target is not already one of its values. Applied FIRST under --yes,
  // so the config write never lands against a schema that would reject it.
  let schemaEdit = null;
  const schemaPath = join(root, 'engine.config.schema.json');
  if (existsSync(schemaPath)) {
    const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
    const enumv = schema?.properties?.docs?.properties?.family?.enum;
    if (Array.isArray(enumv) && !enumv.includes(to)) {
      schemaEdit = { file: 'engine.config.schema.json', line: null, kind: 'schema',
        before: `docs.family enum`, after: `+ "${to}"` };
    }
  }

  for (const abs of scanFiles(root)) {
    const rel = relative(root, abs);
    readFileSync(abs, 'utf8').split('\n').forEach((line, i) => {
      const c = classifyLine(line, old, to);
      if (c.kind === 'edit') edits.push({ file: rel, line: i + 1, kind: 'prose', before: c.before, after: c.after });
      else if (c.kind === 'review') review.push({ file: rel, line: i + 1, text: c.text });
    });
  }

  return { root, from: old, to, already: false, tip, edits, review, schemaEdit };
}

const ELIDE = 78;
const snip = (s) => {
  const t = s.trim();
  return t.length <= ELIDE ? t : `…${t.slice(Math.max(0, t.length - ELIDE))}`;
};

/** The proposal, exactly as `--yes` will apply it. */
/**
 * ARC-07-C31 — REQUIRED, two callers: `tools/snowarch/lib/docs/cli.mjs:135` and this module's own
 * `applyFamilySwitch`. Worth knowing for anyone counting: `tools/snowarch/lib/plan.mjs` has an
 * unrelated `formatPlan(current, ctx, …)`, so a bare grep reports seven callers for this one and I
 * nearly wrote that number down.
 */
export function formatPlan(plan, { applied = false, spell } = {}) {
  needSpell(spell, 'formatPlan');
  if (plan.already) return { text: `already on ${plan.to} — nothing to do`, code: EXIT.ok };
  const lines = [`docs family: ${plan.from} → ${plan.to}`];
  lines.push(`upstream branch ${plan.to}: found (tip ${plan.tip.slice(0, 7)})`);
  if (plan.schemaEdit) {
    lines.push(`EDIT engine.config.schema.json: docs.family enum + "${plan.to}"`);
  }
  for (const e of plan.edits) {
    lines.push(e.line === null
      ? `EDIT ${e.file}: ${e.before} → ${e.after}`
      : `EDIT ${e.file}:${e.line}  "${snip(e.before)}" → "${snip(e.after)}"`);
  }
  for (const r of plan.review) {
    lines.push(`REVIEW (not edited) ${r.file}:${r.line}  "${snip(r.text)}"`);
  }
  if (!applied) {
    lines.push(`THEN: ${spell.cli} docs sync --upstream (moves the pin to `
      + `${plan.to} tip), ${spell.cli} docs verify, ARC-02 description-length lint`);
    lines.push('dry run — nothing changed. Re-run with --yes to apply.');
  }
  return { text: lines.join('\n'), code: EXIT.ok };
}

/** Replace one occurrence on one line, leaving every other byte of the file alone. */
function applyLineEdit(root, e) {
  const p = join(root, e.file);
  const lines = readFileSync(p, 'utf8').split('\n');
  if (lines[e.line - 1] !== e.before) {
    throw new SyncError(`${e.file}:${e.line} is not the line the plan described — `
      + 'the tree changed since the dry run; re-run --dry-run', EXIT.git);
  }
  lines[e.line - 1] = e.after;
  writeFileSync(p, lines.join('\n'));
}

/**
 * Apply the plan, move the pin, re-lint, stage — and commit nothing.
 *
 * A lint failure exits 1 with the edits STAGED, which leaves the switch half-applied on disk. That
 * is deliberate and it is the same trade the staged pin makes: the maintainer needs the edits in
 * order to fix what the lint caught. It is only acceptable because the last two lines say how to
 * finish and how to abandon, so neither state is a puzzle.
 */
/**
 * ARC-07-C31 — `spell` REQUIRED, threaded from `runDocs`. One caller, so a default would have been
 * within the rule; it is required anyway because this function passes the spelling on to two things
 * that require it, and a default here would be a place for the process to re-enter a chain that has
 * already excluded it.
 */
export function applyFamilySwitch(plan, { root = plan.root, config, log = console.log,
  spell } = {}) {
  needSpell(spell, 'applyFamilySwitch');
  if (plan.already) { log(`already on ${plan.to} — nothing to do`); return { applied: false, code: EXIT.ok }; }
  const oldPin = config.docs.pin;

  // THE PIN MOVES FIRST, on a clean tree.
  //
  // `syncUpstream` refuses a dirty tree outside `vendor/`, and that refusal is worth keeping: it is
  // what stops a family switch from landing on top of someone's unrelated work. Writing the prose
  // edits before the refresh would trip it on THIS command's own edits and turn a real guard into
  // an obstacle, so the order is: move the pin against the target family, then edit, then stage.
  const report = syncUpstream({
    root, config: { ...config, docs: { ...config.docs, family: plan.to } }, log: null, spell,
  });
  log(formatUpstream(report).text);

  // The schema next: the config write must never land against a schema that would reject it.
  if (plan.schemaEdit) {
    const p = join(root, 'engine.config.schema.json');
    const schema = JSON.parse(readFileSync(p, 'utf8'));
    schema.properties.docs.properties.family.enum.push(plan.to);
    writeFileSync(p, `${JSON.stringify(schema, null, 2)}\n`);
  }

  for (const e of plan.edits) {
    if (e.kind === 'prose') { applyLineEdit(root, e); continue; }
    if (e.file === '.gitmodules') {
      const p = join(root, '.gitmodules');
      writeFileSync(p, readFileSync(p, 'utf8').replace(`branch = ${plan.from}`, `branch = ${plan.to}`));
    } else {
      const p = join(root, 'engine.config.json');
      const text = readFileSync(p, 'utf8');
      const needle = `"family": "${plan.from}"`;
      if (!text.includes(needle)) {
        throw new SyncError(`engine.config.json does not hold ${needle} — refusing to rewrite it`, EXIT.git);
      }
      writeFileSync(p, text.replace(needle, `"family": "${plan.to}"`));
    }
  }

  run(['add', '--', '.'], root);

  const lints = [
    ['gen-docs-areas --check', ['scripts/gen-docs-areas.mjs', '--check']],
    ['skills lint (SK-04 description length)', ['--test', 'tests/skills-lint.test.mjs']],
  ];
  let failed = null;
  for (const [name, args] of lints) {
    try { execFileSync(process.execPath, args, { cwd: root, stdio: 'pipe', encoding: 'utf8' }); }
    catch { failed = name; break; }
  }

  log(formatPlan(plan, { applied: true, spell }).text);
  log(`staged: everything — review, then: git commit -m "chore(docs): switch release family to ${plan.to}"`);
  if (failed) {
    log(`half-applied: fix the named lint, then review with git diff --cached`);
    log('or abandon with: git restore --staged . && git checkout -- . '
      + `&& git -C ${CORPUS_DIR} checkout --detach ${oldPin}`);
    return { applied: true, code: EXIT.incomplete, failedLint: failed, report };
  }
  return { applied: true, code: EXIT.ok, failedLint: null, report };
}
