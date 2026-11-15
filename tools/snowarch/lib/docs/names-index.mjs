// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-09-C263 (M3) — the corpus names index, READ side.
//
// A caller asks one question of the corpus: does it print this name, and on which pages? Answering it by reading the pages
// costs about 26 s on a Mac (292.5 MB), far past a hook's 10 s, so the answer is built once, when the corpus changes
// (names-index-build.mjs: at docs sync, at upgrade, at `doctor --fix`) and read here. This file is the half a hook may
// import; the half that builds is never imported by one (tests/docs-names-index.test.mjs follows the imports).
//
// WHAT IS STORED, under `.local/corpus-names/<pin, 12 characters>/`:
//   meta.json   { v, pin, coverage, areas, pages, names, built }
//   pages.txt   one `markdown/<area>/…/<page>.md` per line; a page's id is its line number, from 0
//   names.tsv   `<name>\t<page count>\t<id>,<id>,…` per line, sorted by name; ids ascending
// A name is an underscore token (lower case, edge underscores off) or a dotted `com.`/`glide.`/`sn_*.` name — the same
// tokeniser as `corpusIndex` (name-rules.mjs `pageNames`).
//
// COVERAGE says what absence may be claimed from it. `full`: the pages on disk were every page of the corpus tree at the pin,
// so a name that is not in the index is not in the corpus. `disk`: a sparse checkout, whose index covers the areas it
// lists and says nothing about the others — presence is still proof, absence is not.
//
// `loadNamesIndex` answers `null` for a missing directory, a corrupt or short file, a version it does not know and, when a
// pin is given, another pin: a caller that gets `null` runs without the index and says nothing else.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MODE } from './sync.mjs';

export const NAMES_INDEX_VERSION = 1;
export const FILES = Object.freeze({ meta: 'meta.json', pages: 'pages.txt', names: 'names.tsv' });
// `full` is the docs mode's own word for "the whole corpus is on disk" (sync.mjs MODE.full, ARC-09-C244): one spelling, not two.
export const COVERAGE = Object.freeze({ full: MODE.full, disk: 'disk' });

const lines = (text) => {
  const out = text.split('\n');
  if (out.length && out[out.length - 1] === '') out.pop();
  return out.map((l) => (l.endsWith('\r') ? l.slice(0, -1) : l));
};

/** The ids both sorted lists hold. */
export function intersect(a, b) {
  const out = [];
  for (let i = 0, j = 0; i < a.length && j < b.length;) {
    if (a[i] === b[j]) { out.push(a[i]); i += 1; j += 1; } else if (a[i] < b[j]) i += 1; else j += 1;
  }
  return out;
}

/**
 * The index in `dir`, or `null`. `pin` (the full docs pin) is checked against the one the index was built for.
 * `read` is given by a test that counts reads.
 */
export function loadNamesIndex(dir, { pin = null, read = readFileSync } = {}) {
  try {
    const metaPath = join(dir, FILES.meta);
    if (!existsSync(metaPath)) return null;
    const meta = JSON.parse(read(metaPath, 'utf8'));
    if (!meta || meta.v !== NAMES_INDEX_VERSION || typeof meta.pin !== 'string'
      || !Object.values(COVERAGE).includes(meta.coverage) || !Number.isInteger(meta.pages) || !Number.isInteger(meta.names)) return null;
    if (pin !== null && meta.pin !== pin) return null;
    const pages = lines(read(join(dir, FILES.pages), 'utf8'));
    if (pages.length !== meta.pages) return null;
    const text = read(join(dir, FILES.names), 'utf8');
    // name -> [page count, start, end] of its posting list inside `text`, parsed only when a name is asked about.
    const entries = new Map();
    for (let pos = 0; pos < text.length;) {
      let eol = text.indexOf('\n', pos);
      if (eol < 0) eol = text.length;
      const t1 = text.indexOf('\t', pos);
      const t2 = t1 > 0 && t1 < eol ? text.indexOf('\t', t1 + 1) : -1;
      if (t2 < 0 || t2 > eol) return null;
      const end = text[eol - 1] === '\r' ? eol - 1 : eol;
      const count = Number(text.slice(t1 + 1, t2));
      if (!Number.isInteger(count)) return null;
      entries.set(text.slice(pos, t1), [count, t2 + 1, end]);
      pos = eol + 1;
    }
    if (entries.size !== meta.names) return null;
    let namespaces = null;
    const ids = (name) => {
      const e = entries.get(name);
      if (!e) return [];
      const raw = text.slice(e[1], e[2]);
      return raw ? raw.split(',').map(Number) : [];
    };
    return {
      meta,
      coverage: meta.coverage,
      pageCount: pages.length,
      nameCount: entries.size,
      has: (name) => entries.has(name),
      count: (name) => entries.get(name)?.[0] ?? 0,
      pagesOf: ids,
      pagePath: (id) => pages[id] ?? null,
      pathsOf: (name) => ids(name).map((id) => pages[id]),
      /** The ids of the pages that print both names (a dotted name looked up by its parts). */
      both: (a, b) => intersect(ids(a), ids(b)),
      /** left part -> the number of distinct dotted names under it, the table `qualifiesWhole` reads. */
      get namespaces() {
        if (!namespaces) {
          namespaces = new Map();
          for (const name of entries.keys()) {
            const dot = name.indexOf('.');
            if (dot > 0) { const left = name.slice(0, dot); namespaces.set(left, (namespaces.get(left) ?? 0) + 1); }
          }
        }
        return namespaces;
      },
    };
  } catch {
    return null;
  }
}

/** The doctor's view: `{ state, meta }` with state `ok`, `missing` (no index for this pin) or `stale` (one for another pin only). */
export function namesIndexState(dir, { pin, siblings = [] } = {}) {
  const idx = loadNamesIndex(dir, { pin });
  if (idx) return { state: 'ok', meta: idx.meta };
  return { state: siblings.length ? 'stale' : 'missing', meta: null };
}
