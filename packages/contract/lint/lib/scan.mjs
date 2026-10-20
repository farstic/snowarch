// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * The scan set: which files the engine lint reads, and — more importantly — which it does not.
 *
 * There is exactly ONE definition of "clean" in this repository, and it lives here. The ARC
 * README's acceptance grep, ARC-02-S12's exit test and the CI job all call the lint rather than
 * writing their own `grep -r`, because two definitions of clean is how a sweep gets declared
 * done against a narrower set than the check enforces (architect's ruling, ARC-05-S03).
 *
 * **History is exempt, and that is a decision, not an oversight.** `docs/plans/**` and
 * `docs/spikes/**` cite old tool names and old MCP prefixes *as evidence* — the S-14
 * plugin-channel spike records carry `mcp__plugin_…__` prefixes because that is what was
 * measured, and rewriting them would destroy the record. `docs/CHANGELOG.md` names what things
 * used to be called, which is its job. What stays in scope is everything a reader might act on
 * today, plus `docs/decisions/**` and `docs/ARCHITECTURE.md`, which may name a retired thing
 * only on a line carrying the historical marker.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Every path this module hands out is POSIX-style, on every platform.
 *
 * A finding that reads `governance\\mcp-protocols.md` on Windows and `governance/…` on Unix
 * cannot be diffed between cells, and a reader who pastes one into a `grep` on the other gets
 * nothing back. The exemption lists below are written with `/` for the same reason: comparing a
 * `join()`-built path against a literal is a silent platform difference in which files are
 * checked at all. Caught by three red Windows cells.
 */
const posix = (p) => p.split('\\').join('/');

/** Roots that are scanned, relative to the tree root. A missing one is simply skipped. */
export const SCAN_ROOTS = [
  'CLAUDE.md', 'README.md', '.claude', 'governance', 'docs', 'tools', 'tests',
];

export const SCAN_EXTENSIONS = ['.md', '.json', '.mjs', '.js', '.ts', '.yml', '.yaml', '.txt'];

/**
 * Never scanned, whatever they contain.
 *
 * `packages/**` is excluded because the server has its own tests and its own contract — and
 * because `packages/contract/retired-names.json` IS the list of forbidden words, so scanning it
 * would make the lint fail on its own input.
 */
export const NEVER_SCANNED = [
  'vendor', 'node_modules', '.local', 'packages', 'clients', '.git', 'coverage', 'dist',
];

/**
 * In scope for some checks but not the name checks: history.
 *
 * L01 (tool tokens), L02 (prefix) and L03 (retired names) skip these; every other check that
 * reads files still sees them, and the pin/server-key checks do not read the tree at all.
 */
// distribution: path list — names the lint compares a scanned file against, not files it opens; an absent one is not scanned
export const HISTORY_PATHS = ['docs/plans', 'docs/spikes', 'docs/CHANGELOG.md',
  // The relicensing consent record. Its file list is quoted VERBATIM, inside an indented
  // block, naming each file as it was named when consent was given — so the per-line marker
  // cannot go there without editing the list itself, and editing the list would change what
  // was agreed to. ARC-02-S06's vocabulary sweep excluded it for the same reason; this makes
  // the name checks agree with that rather than hold a second opinion.
  'docs/RELICENSING.md'];

/**
 * Files whose SUBJECT is the list of dead names, exempt from L01/L02/L03.
 *
 * Not an escape hatch — an unavoidable consequence. A test that asserts which words are retired
 * must contain those words; an allow-list of files permitted to name them must name them; a lint
 * fixture must contain the defect it detects. Without this list the lint could never reach exit
 * 0, and ARC-02-S12's "flip the constant to required" plan would have no reachable end state.
 *
 * Every entry is here for that reason and no other. The line to hold is that a file qualifies
 * only if naming the dead thing is *what the file is for* — not merely convenient.
 */
// distribution: path list — names the lint compares a scanned file against, not files it opens; an absent one is not scanned
export const POLICY_FILES = [
  // The ratchet: its FORBIDDEN array IS the list, and its allow-list names the exempt files.
  'tests/no-legacy-names.test.mjs',
  'tests/legacy-names.allowlist.json',
  // ARC-05-S02's assertion about which words are and are not retired.
  'tests/contract/retired-names.test.mjs',
  // ARC-02-S02's negative fixtures: every rule proved to FAIL, which needs a wrong prefix.
  'tests/lint-negatives.test.mjs',
  // This lint's own suite: it asserts the exact text of an L02/L03 finding, which means
  // quoting the retired prefix it is detecting.
  'tests/contract/engine-lint.test.mjs',
  // ARC-05-S05's generator suite, for both reasons at once: it renders against fixture contracts
  // whose tool names are deliberately not real (`snow_a_add`), and it asserts that the retired
  // capture vocabulary is ABSENT from the generated rule file, which means naming it. Neither is
  // avoidable — a fixture built from real tool names would not prove the renderer read the
  // contract, and an absence cannot be asserted without saying what is absent.
  'tests/contract/gen-governance.test.mjs',
  // The policy itself. It has to name the words to state which are retired and which are not.
  'docs/CONTRIBUTING.md',
  // ARC-08-S03's E-23 data: the registration names the old installers wrote. A detector that
  // cannot name what it detects cannot detect it, and keeping them in JSON rather than in the
  // check body is what makes the exemption one file rather than a check.
  'tools/snowarch/lib/doctor/checks/stale-registrations.json',
  // SK-09's token list, for the same reason: the skills lint's own data, which names each retired word to detect it.
  // It moved under tools/snowarch/lib with the lint (ARC-09-C185a), because E-18 runs that lint in a user's install.
  'tools/snowarch/lib/lint-data/retired-vocabulary.json',
  // ARC-10-S01's migration page. It is the one document written FOR a user of the old install, and
  // every step of it names something being removed — the registrations by the names the old
  // scripts wrote, the store by its path. A page that said "run the command the doctor printed"
  // without printing it would be a page nobody can follow. The sibling ratchet
  // (`tests/no-legacy-names.test.mjs`) exempts it by name for the same reason; this is the name
  // checks agreeing with that rather than holding a second opinion.
  'docs/MIGRATION.md',
];

/** True when a file's subject is the retirement policy — exempt from the name checks. */
export function isPolicyFile(rel) {
  return POLICY_FILES.some((p) => rel === p);
}

/** Files where a line may name a retired IDENTIFIER if it carries the marker (S02). */
// distribution: path list — names the lint compares a scanned file against, not files it opens; an absent one is not scanned
export const HISTORICAL_MARKER_FILES = [
  'docs/ARCHITECTURE.md', 'docs/CHANGELOG.md', 'docs/decisions',
];

export const HISTORICAL_MARKER = '<!-- retired-name: historical -->';

const isUnder = (rel, prefix) => rel === prefix || rel.startsWith(`${prefix}/`);

/**
 * True when a file is exempt from the NAME checks (L01/L02/L03) — history or policy.
 *
 * One predicate, so the three checks cannot drift apart about what they scan. They each call
 * this rather than testing `HISTORY_PATHS` themselves.
 */
export function isHistory(rel) {
  return HISTORY_PATHS.some((p) => isUnder(rel, p)) || isPolicyFile(rel);
}

/** True when a historical marker on a line is honoured in this file. */
export function honoursMarker(rel) {
  return HISTORICAL_MARKER_FILES.some((p) => isUnder(rel, p));
}

function walk(root, dir, out) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const full = join(dir, e.name);
      const rel = posix(relative(root, full));
    if (e.isDirectory()) {
      if (NEVER_SCANNED.includes(e.name)) continue;
      // Any directory named `fixtures`, at any depth. S01's contract fixtures deliberately hold
      // renamed and re-gated tools, and this lint's own fixture trees deliberately hold every
      // defect it detects — scanning them would make the suite fail on its own test data.
      if (e.name === 'fixtures') continue;
      walk(root, full, out);
    } else if (SCAN_EXTENSIONS.some((x) => e.name.endsWith(x))) {
      out.push(rel);
    }
  }
}

/**
 * Every scanned file, tree-relative, sorted.
 *
 * Sorted so findings come out in a stable order: a lint whose output moves between runs cannot
 * be diffed, and the first thing anyone does with a long finding list is diff it.
 */
export function scanFiles(root) {
  const out = [];
  for (const entry of SCAN_ROOTS) {
    const full = join(root, entry);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) walk(root, full, out);
    else if (SCAN_EXTENSIONS.some((x) => entry.endsWith(x))) out.push(posix(entry));
  }
  return out.sort();
}

/**
 * A file's lines, 1-indexed, with `\r` stripped.
 *
 * The `.gitattributes` LF rule makes the strip a no-op on a correct checkout — but a lint that
 * reported a line number one character off on Windows would be blamed for the wrong thing.
 */
export function readLines(root, rel) {
  return readFileSync(join(root, rel), 'utf8').replace(/\r/g, '').split('\n');
}
