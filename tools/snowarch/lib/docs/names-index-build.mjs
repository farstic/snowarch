// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-09-C263 (M3) — the corpus names index, BUILD side. Read side: names-index.mjs.
//
// WHEN IT RUNS: after a docs sync (`syncCorpus`: bootstrap B02, `./snowarch docs sync`, `doctor --fix`), and so at an upgrade
// whose B02 runs because the index is missing at an unchanged pin. NEVER inside a hook and never during a session — so no
// sitting changes the install, and no hook imports this file (tests/docs-names-index.test.mjs reads the import graph).
//
// IT NEVER READS A BLOB THAT IS NOT CHECKED OUT. An install's corpus is a blobless sparse clone, and reading a page it does
// not hold would fetch it or fail. The pages are the ones on disk; the tree at the pin (trees are all there, resolve.mjs) is
// read for NAMES ONLY, to decide the coverage: the same pages as the tree means `full`, anything less means `disk`.
//
// IT IS ATOMIC: written beside the directory and renamed over it, so a hook that loads while it runs sees the old index or
// the new one, or none (and then runs without it), never half of one.
import { mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { candidate, pageNames } from './name-rules.mjs';
import { diskPages, treePages } from './resolve.mjs';
import { corpusNamesDir } from '../local-paths.mjs';
import { COVERAGE, FILES, NAMES_INDEX_VERSION, loadNamesIndex } from './names-index.mjs';

const areaOf = (page) => page.split('/')[1];

/**
 * The index of the pages at `corpus`, in memory: `{ meta, pages, names }`, `names` a Map from a name to the ascending ids of
 * the pages that print it. `pages` and `tree` are given by a test; `read` too.
 */
export function buildNamesIndex({ corpus, pin, pages = null, tree, now = new Date(), read = readFileSync }) {
  const disk = (pages ?? diskPages(corpus)).slice().sort();
  const inTree = tree === undefined ? treePages(corpus) : tree;
  const sameAsTree = Array.isArray(inTree) && inTree.length === disk.length
    && (() => { const t = new Set(inTree); return disk.every((p) => t.has(p)); })();
  const names = new Map();
  const push = (name, id) => {
    const ids = names.get(name);
    if (ids) ids.push(id); else names.set(name, [id]);
  };
  disk.forEach((page, id) => {
    const { tokens, dotted } = pageNames(read(join(corpus, ...page.split('/')), 'utf8'));
    for (const t of tokens) push(t, id);
    for (const d of dotted) if (candidate(d.split('.')[0])) push(d, id);
  });
  const meta = {
    v: NAMES_INDEX_VERSION,
    pin,
    coverage: sameAsTree ? COVERAGE.full : COVERAGE.disk,
    areas: sameAsTree ? null : [...new Set(disk.map(areaOf))].sort(),
    pages: disk.length,
    names: names.size,
    built: now.toISOString(),
  };
  return { meta, pages: disk, names };
}

/** Writes `built` as the index in `dir`, atomically. Returns the number of bytes written. */
export function writeNamesIndex(dir, built) {
  const tmp = `${dir}.tmp-${process.pid}`;
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  const rows = [...built.names.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([name, ids]) => `${name}\t${ids.length}\t${ids.join(',')}`);
  const pagesText = `${built.pages.join('\n')}\n`;
  const namesText = rows.length ? `${rows.join('\n')}\n` : '';
  writeFileSync(join(tmp, FILES.pages), pagesText);
  writeFileSync(join(tmp, FILES.names), namesText);
  writeFileSync(join(tmp, FILES.meta), `${JSON.stringify(built.meta, null, 2)}\n`);
  rmSync(dir, { recursive: true, force: true });
  renameSync(tmp, dir);
  return Buffer.byteLength(pagesText) + Buffer.byteLength(namesText);
}

/** The siblings of `dir` (other pins' indexes), removed: an index for a pin that is gone names pages that may not exist. */
function pruneOthers(dir) {
  const parent = join(dir, '..');
  if (!existsSync(parent)) return;
  const mine = dir.split(/[\\/]/).pop();
  for (const entry of readdirSync(parent)) {
    if (entry !== mine && !entry.includes('.tmp-')) rmSync(join(parent, entry), { recursive: true, force: true });
  }
}

/** `73,712 names · 51,657 pages · coverage full`. */
export const describe = (meta) => `${meta.names.toLocaleString('en-US')} names · ${meta.pages.toLocaleString('en-US')} pages · coverage ${meta.coverage}`;

/**
 * Makes sure the index for `pin` is there and current, building it when it is not. `{ built, ms, meta, dir }`, or `{ built: false,
 * error }` when it could not be built: the caller warns, and the sync it follows does not fail on it.
 * Current means the index loads for this pin and holds as many pages as the disk does (a sparse checkout that was widened has
 * more pages, so its index is rebuilt).
 */
export function ensureNamesIndex({ root, corpus, pin, force = false, now = new Date(), build = buildNamesIndex }) {
  const dir = corpusNamesDir(root, pin);
  try {
    if (!force) {
      const current = loadNamesIndex(dir, { pin });
      if (current && current.pageCount === diskPages(corpus).length) return { built: false, ms: 0, meta: current.meta, dir };
    }
    const t0 = Date.now();
    const built = build({ corpus, pin, now });
    mkdirSync(join(dir, '..'), { recursive: true });
    writeNamesIndex(dir, built);
    pruneOthers(dir);
    return { built: true, ms: Date.now() - t0, meta: built.meta, dir };
  } catch (e) {
    return { built: false, ms: 0, meta: null, dir, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * The command line `sync-index.mjs` runs in a child: `--root <checkout> --corpus <folder> --pin <sha> [--force]`. It prints ONE
 * line of JSON, `ensureNamesIndex`'s answer plus the line `docs sync` says, and exits 1 when the index could not be built. A
 * child rather than an import, so that nothing a hook can load names this file (docs-names-index.test.mjs follows the imports).
 */
export function cli(argv) {
  const value = (flag) => { const i = argv.indexOf(flag); return i >= 0 ? argv[i + 1] : undefined; };
  const root = value('--root');
  const corpus = value('--corpus');
  const pin = value('--pin');
  if (!root || !corpus || !pin) return { code: 2, out: { built: false, error: 'usage: --root <checkout> --corpus <folder> --pin <sha> [--force]' } };
  const r = ensureNamesIndex({ root: resolve(root), corpus: resolve(corpus), pin, force: argv.includes('--force') });
  const line = r.built ? `[docs] names index … ${(r.ms / 1000).toFixed(1)} s · ${describe(r.meta)}` : null;
  return { code: r.error ? 1 : 0, out: { built: r.built, ms: r.ms, meta: r.meta, error: r.error ?? null, line } };
}

const same = (a, b) => { try { return realpathSync.native(a) === realpathSync.native(b); } catch { return resolve(a) === resolve(b); } };
if (process.argv[1] && same(process.argv[1], fileURLToPath(import.meta.url))) {
  const { code, out } = cli(process.argv.slice(2));
  process.stdout.write(`${JSON.stringify(out)}\n`);
  process.exitCode = code;
}
