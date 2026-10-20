// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-03-S02 — one definition of "a citation", shared by the generator (S02) and the verifier (S03)
// so the two can never disagree about what they are looking at.
//
// stdlib only, and it must run on a checkout where vendor/ServiceNowDocs does NOT exist: the sparse
// checkout is computed FROM this scan, so anything that needed the corpus would be circular.
import { readdirSync, statSync, readFileSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

export class CitationSyntaxError extends Error {
  constructor(message, file, line) {
    super(`${file}:${line}: ${message}`);
    this.name = 'CitationSyntaxError';
    this.file = file; this.line = line;
  }
}

// Byte-compatible with the bash regex the engine's verify-citations.sh used, plus the optional
// vendor/ and ServiceNowDocs/ prefixes the imported texts actually contain.
const CITATION = /(?:vendor\/)?(?:ServiceNowDocs\/)?markdown\/[A-Za-z0-9_./{},-]+/g;

// An area is a top-level directory of the corpus. Requiring it to LOOK like one is what keeps
// `markdown/...` out — that string appears in four agent files as a prose placeholder ("cite the
// path used: markdown/..."), not as a citation, and without this rule it would land in the sparse
// checkout list as an area that cannot exist.
const AREA = /^[a-z0-9][a-z0-9-]*$/;

// Expand exactly one {a,b,…} group. Two groups or a nested brace is a syntax error rather than a
// silent partial expansion: a citation nobody can resolve should be reported, not half-read.
function expandBraces(path, file, line) {
  const opens = (path.match(/\{/g) || []).length;
  if (opens === 0) return [path];
  if (opens > 1) throw new CitationSyntaxError(`more than one {…} group in "${path}"`, file, line);
  const m = path.match(/^([^{]*)\{([^{}]*)\}([^{}]*)$/);
  if (!m) throw new CitationSyntaxError(`unparsable {…} group in "${path}"`, file, line);
  return m[2].split(',').map((alt) => `${m[1]}${alt.trim()}${m[3]}`);
}

// Citation-shaped tokens that carry NO `markdown/` prefix. The scanner cannot resolve them — they
// name a filename with no area — so `verify` reported `dead: 0` on a skill that still pointed a
// reader at files which do not exist anywhere in the corpus (found in review of ARC-03-S04; the
// licensing skill had ten, of which two named real pages that merely lacked their path and two named
// pages that exist nowhere). They are WARNED, never failed: the fix is a prose edit that ARC-02 owns
// for the rest of the tree, and a warning that blocked CI would block that work.
const BARE_CITATION = /\(citation:\s*`([^`]+)`\)/gi;
const BARE_IN_CELL = /`([A-Za-z0-9][A-Za-z0-9._-]*\.md)`/g;
// Repository files, not corpus pages — naming these in a table cell is not a citation.
const REPO_FILES = new Set(['SKILL.md', 'EXAMPLES.md', 'CLAUDE.md', 'README.md', 'STORIES.md',
  'NOTICE.md', 'CONTRIBUTING.md', 'ARCHITECTURE.md', 'VALIDATION-TESTS.md']);
// Matched on the BASENAME above, so the S13 move to `tests/` needs no entry here — but the set
// is basenames by design, and a path-shaped citation would not match it at all.

export function findBareCitations(text, file = '<inline>') {
  const out = [];
  text.split('\n').forEach((line, i) => {
    for (const m of line.matchAll(BARE_CITATION)) {
      if (!m[1].includes('markdown/')) {
        out.push({ file, line: i + 1, raw: m[1],
          reason: `citation without a markdown/ path — the gate cannot check "${m[1]}"` });
      }
    }
    // A table row cell that is only a backticked *.md with no path: the "Citation" column form.
    if (line.startsWith('|') && !line.startsWith('|---')) {
      for (const cell of line.split('|')) {
        const t = cell.trim();
        const m = t.match(/^`([A-Za-z0-9][A-Za-z0-9._-]*\.md)`$/);
        if (m && !REPO_FILES.has(m[1])) {
          out.push({ file, line: i + 1, raw: m[1],
            reason: `table citation without a markdown/ path — the gate cannot check "${m[1]}"` });
        }
      }
    }
  });
  return out;
}

export function extract(text, file = '<inline>') {
  const out = [];
  const warnings = [];
  text.split('\n').forEach((lineText, i) => {
    const line = i + 1;
    for (const raw of lineText.match(CITATION) || []) {
      // Trailing punctuation belongs to the prose, not the path; so does a trailing slash on a
      // directory citation, which we record via isDir instead.
      let path = raw.replace(/^(?:vendor\/)?(?:ServiceNowDocs\/)?/, '').replace(/[).,;:]+$/, '');
      const isDir = !path.endsWith('.md');
      path = path.replace(/\/$/, '');
      const area = path.split('/')[1] ?? null;
      if (!area) { warnings.push({ file, line, raw, reason: 'bare markdown citation, no area' }); continue; }
      if (!AREA.test(area)) { warnings.push({ file, line, raw, reason: `"${area}" is not an area name` }); continue; }
      for (const p of expandBraces(path, file, line)) out.push({ path: p, area, isDir, file, line, raw });
    }
  });
  return { citations: out, warnings };
}

// Roots are scanned in this order. A root that does not exist is SKIPPED and reported, never an
// error: ARC-02 is still moving the engine's canonical location, and a generator that dies on a
// missing directory would block the very import that creates it.
export const DEFAULT_ROOTS = [
  '.claude/skills', '.claude/agents', 'governance', 'docs/PLATFORM-NOTES.md', 'CLAUDE.md',
];
// The root `skills/` and `agents/` mirrors were scanned behind a `legacy` flag until ARC-02
// deleted them (S01) and the ARC closed (2026-09-09). Both are gone: a flag whose only value
// pointed at directories that no longer exist is a way to scan nothing and report success.

function* walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (e.isFile() && e.name.endsWith('.md')) yield p;
  }
}

// A token that carries its area but not the `markdown/` root — `platform-security/access-control/x.md`
// rather than `markdown/platform-security/access-control/x.md`. It looks checkable and is not: the
// CITATION pattern requires the root, so the gate neither checks nor warns, and a reader trusts it
// anyway. ARC-02-S03 found 11 of these behind a clean `dead: 0`. `areas` is the set from
// vendor/docs-areas.txt, with or without the `markdown/` prefix.
export function findRootlessCitations(text, file = '<inline>', areas = new Set()) {
  const bare = new Set([...areas].map((a) => a.replace(/^markdown\//, '')));
  const out = [];
  text.split('\n').forEach((line, i) => {
    for (const m of line.matchAll(/`([a-z0-9][a-z0-9-]*\/[A-Za-z0-9._/-]+)`/g)) {
      const token = m[1];
      if (token.startsWith('markdown/')) continue;
      if (!bare.has(token.split('/')[0])) continue;
      if (!/\.md$|\/$/.test(token)) continue;
      out.push({ file, line: i + 1, raw: token,
        reason: `citation carries its area but not the markdown/ root — the gate cannot check "${token}"` });
    }
  });
  return out;
}

export function scanRepo({ root = process.cwd(), roots = DEFAULT_ROOTS } = {}) {
  const all = roots;
  const citations = [], warnings = [], skipped = [], scanned = [];
  for (const r of all) {
    const abs = join(root, r);
    if (!existsSync(abs)) { skipped.push(r); continue; }
    const files = statSync(abs).isDirectory() ? [...walk(abs)] : [abs];
    for (const f of files) {
      const rel = relative(root, f).split(sep).join('/');
      scanned.push(rel);
      const text = readFileSync(f, 'utf8');
      const { citations: c, warnings: w } = extract(text, rel);
      citations.push(...c); warnings.push(...w, ...findBareCitations(text, rel));
    }
  }
  return { citations, warnings, skipped, scanned };
}

export function areasOf(citations) {
  return [...new Set(citations.map((c) => c.area))].sort();
}
