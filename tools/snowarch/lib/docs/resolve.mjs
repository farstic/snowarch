// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-09-C254 — the page a corpus link stands for.
//
// The corpus's pages link to one another by raw.githubusercontent.com addresses that end in `/australia/markdown/<path>`,
// and seven of ten such links name a path the corpus does not have: a leading `australia/` that belongs to the link, or a
// subfolder the link leaves out. A Read of that path fails, and a citation copied from it is dead. `resolve` says which
// page was meant, and says nothing when it would be a guess. No address is spelled with its scheme in this file: product
// code names only listed hosts (tests/issue-templates.test.mjs, AC 2), and the rule reads a scheme followed by a host.
//
//   exact       the path as written is a page
//   australia   it is, once a leading `australia/` is taken off
//   folders     the page of that file name, in the same area, whose folders contain the cited ones in order and are
//               more than they are; there must be exactly one
//   area        the one page of that file name in the corpus, when it is in the cited area
//
// Nothing else: two pages that fit, a file name no page has, and a file name whose only page is in another area all
// answer `null`. A page in another area is not "probably the one" — it may be a different page of the same name.
//
// The index is read from the corpus tree at the pin, the way verify.mjs's `classify` reads it (ARC-09-C239): the blobless
// clone holds every tree, so a page this install did not check out is in it. With no git directory, or a git that fails,
// it is the pages on disk. It is built in memory when a hook needs it and kept nowhere: a stale copy would name a page
// the pin no longer has, with confidence, and building it costs tens of milliseconds, measured, on a path that runs after a
// failed Read or a dead citation only.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MARKDOWN = 'markdown';
const AUSTRALIA = `${MARKDOWN}/australia/`;

/** A corpus page's path: `markdown/<area>/.../<name>.md`. */
const isPage = (p) => typeof p === 'string' && p.startsWith(`${MARKDOWN}/`) && p.endsWith('.md')
  && p.indexOf('/', MARKDOWN.length + 1) > 0;

const nameOf = (page) => page.slice(page.lastIndexOf('/') + 1);

/** The folders of a page below `markdown/`, the area first. */
const foldersOf = (page) => page.slice(MARKDOWN.length + 1).split('/').slice(0, -1);

/** `part` is `whole` with some folders left out, the rest in their order. */
function isOrderedPart(part, whole) {
  let i = 0;
  for (const folder of whole) if (i < part.length && folder === part[i]) i += 1;
  return i === part.length;
}

/**
 * `markdown/...` for a path that names a corpus page in any spelling a Read can be given: absolute, relative to the
 * checkout or to `vendor/`, with backslashes, with a drive letter, with doubled separators. Matched by the corpus
 * folder's name and not by the checkout's path, so a symlinked checkout or a different drive spelling still matches.
 */
export function corpusRelative(file) {
  if (typeof file !== 'string') return null;
  const posix = file.replace(/\\/g, '/').replace(/\/{2,}/g, '/');
  return posix.match(/(?:^|\/)ServiceNowDocs\/(markdown\/.+)$/)?.[1] ?? null;
}

/** An index of `paths`: the corpus pages among them, by path and by file name. */
export function indexOf(paths) {
  const pages = new Set();
  const byName = new Map();
  for (const p of paths) {
    if (!isPage(p) || pages.has(p)) continue;
    pages.add(p);
    const same = byName.get(nameOf(p));
    if (same) same.push(p);
    else byName.set(nameOf(p), [p]);
  }
  return { size: pages.size, has: (p) => pages.has(p), named: (name) => byName.get(name) ?? [] };
}

/**
 * The page `cited` stands for, as `{ kind, path }`, or `null` when it would be a guess. `cited` is a `markdown/...`
 * path; `index` is `indexOf`'s.
 */
export function resolve(cited, index) {
  if (!isPage(cited)) return null;
  if (index.has(cited)) return { kind: 'exact', path: cited };
  let path = cited;
  if (cited.startsWith(AUSTRALIA)) {
    path = `${MARKDOWN}/${cited.slice(AUSTRALIA.length)}`;
    if (!isPage(path)) return null;
    if (index.has(path)) return { kind: 'australia', path };
  }
  const folders = foldersOf(path);
  const named = index.named(nameOf(path));
  const inArea = named.filter((p) => foldersOf(p)[0] === folders[0]);
  const fits = inArea.filter((p) => {
    const there = foldersOf(p);
    return there.length > folders.length && isOrderedPart(folders, there);
  });
  if (fits.length === 1) return { kind: 'folders', path: fits[0] };
  if (fits.length > 1) return null;
  if (named.length === 1 && inArea.length === 1) return { kind: 'area', path: named[0] };
  return null;
}

/** The paths under `markdown/` in the corpus tree at HEAD, or `null` when git cannot say. */
function treeAt(corpus) {
  try {
    const listed = execFileSync('git', ['-c', 'protocol.allow=never', '--literal-pathspecs', '-C', corpus, 'ls-tree', '-r',
      '-z', '--name-only', 'HEAD', '--', MARKDOWN],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 });
    return listed.split('\0').filter(Boolean);
  } catch { return null; }
}

/** The `.md` files under `dir`, as `rel/...` with `/` on every platform. */
function walk(dir, rel, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) walk(join(dir, entry.name), `${rel}/${entry.name}`, out);
    else if (entry.name.endsWith('.md')) out.push(`${rel}/${entry.name}`);
  }
  return out;
}

/**
 * The index of the corpus at `corpus` (the folder that holds `markdown/`): its tree at HEAD when it has a git directory
 * git can read, else the pages on disk; `null` when there is neither a tree nor a `markdown/` folder.
 */
export function loadIndex(corpus) {
  if (existsSync(join(corpus, '.git'))) {
    const tree = treeAt(corpus);
    if (tree) return indexOf(tree);
  }
  const md = join(corpus, MARKDOWN);
  if (!existsSync(md)) return null;
  try { return indexOf(walk(md, MARKDOWN)); } catch { return null; }
}
