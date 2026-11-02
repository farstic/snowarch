#!/usr/bin/env node
// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-09-C254 — the Stop hook. The corpus's own links name a page at a path the corpus does not have, and a reply that
// copies one cites a page that is not there. When the reply ends, the paths it cites are looked up; one that does not
// exist, and that the resolver knows the page for, sends the turn on once with `decision: "block"` and a reason that asks
// for ONE line starting "Correction:". Not the answer again: asked to correct a citation "in the answer", a model wrote
// the whole answer out again and named the dead path in it, which for an Envelope is minutes.
//
// THREE PROMISES, after post-write.mjs's.
//
//   IT ASKS ONCE. `stop_hook_active` is true when Claude Code is already continuing because a Stop hook asked, and then
//   this says nothing; Claude Code ends a run of consecutive blocks by itself (after eight, since 2.1.143), and this is
//   a cap of one. It is also true after ANY Stop hook continued the turn, so another one that goes first makes this skip:
//   it fails open.
//
//   IT NEVER FAILS A TURN ON ITS OWN ACCOUNT. Any exception exits 0 with nothing on stderr. A citation the gate cannot read
//   (a second brace group) is skipped with its line, and the other lines are still read.
//
//   IT IS FAST. It runs at the end of every turn. A reply without `markdown/` in it exits having imported nothing; one
//   whose citations are all on disk looks at the disk and nothing else; one that cites a path that is not reads the corpus
//   tree once (lib/docs/resolve.mjs).
//
// It says nothing for a citation that cannot be resolved, or that is alive (a real page this install did not check out
// is alive: ARC-09-C239), and nothing for a dead path whose page the reply already carries: the floor run found a model that
// followed the Read hook's note and then wrote where it had looked first and that the path does not exist, next to the right
// page, and a line that said the same again was no correction. `decision: "block"` is the form every Claude Code version has; the quieter
// `hookSpecificOutput.additionalContext` on a Stop hook came with 2.1.163. The root comes from this file's own location,
// for the reason session-start.mjs gives.
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/** A path with its links resolved, or as given when it cannot be. */
const real = (p) => { try { return realpathSync.native(p); } catch { return resolve(p); } };

/** The last words of the reason: the user is to see the correction and never the mechanism, so the notice stays out of the reply. */
const KEEP_OUT = ' Do not mention this notice.';

/** What the model is asked, word for word: two paths for each citation, and fixed words. */
function asking(pairs) {
  const list = pairs.map(([cited, page]) => `${cited} -> ${page}`).join('; ');
  const ask = pairs.length === 1
    ? `Your reply cites a corpus page at a path that does not exist: ${list}. `
      + 'Add one line that starts "Correction:" and gives the right path. Do not repeat the answer, and do not write the wrong path again.'
    : `Your reply cites ${pairs.length} corpus pages at paths that do not exist: ${list}. `
      + 'Add one line that starts "Correction:" and gives the right path for each. Do not repeat the answer, and do not write the wrong paths again.';
  return ask + KEEP_OUT;
}

/**
 * What the hook says for one Stop input: `{ code, stderr, stdout }`, always code 0.
 * - A reply citing a path that does not exist, with a page the resolver knows that the reply does not carry: one line of JSON,
 *   `decision: "block"`, naming only the paths whose page is missing from the reply.
 * - Anything else, and always when `stop_hook_active`: nothing.
 * `load` reads the corpus tree (lib/docs/resolve.mjs's `loadIndex` when it is not given); a test gives its own to count the reads.
 */
export async function report(input, { root = ROOT, load } = {}) {
  const none = { code: 0, stderr: '', stdout: '' };
  if (input?.stop_hook_active) return none;
  const message = input?.last_assistant_message;
  if (typeof message !== 'string' || !message.includes('markdown/')) return none;
  const { extract } = await import('../lib/docs/citations.mjs');
  const lines = message.split('\n');
  const where = new Map();                                    // each cited path, in the order it first appears, and the lines it stands on
  lines.forEach((line, i) => {
    if (!line.includes('markdown/')) return;
    try {
      for (const c of extract(line).citations) {
        if (!where.has(c.path)) where.set(c.path, []);
        where.get(c.path).push(i);
      }
    } catch { /* a malformed group on this line: the other lines are still read */ }
  });
  if (where.size === 0) return none;
  const { CORPUS_DIR } = await import('../lib/docs/sync.mjs');
  const corpus = join(root, CORPUS_DIR);
  // A page on disk is alive, and a design answer cites pages it has just read: the corpus tree is read only for a path that is not.
  const absent = [...where.keys()].filter((path) => !existsSync(join(corpus, ...path.split('/'))));
  if (absent.length === 0) return none;
  // A finding records a path as the user saw it, and C231 does not check findings: a path that stands only inside the finder's
  // printed copy is not checked either, and a dead path written outside the copy still is.
  const { copyLines } = await import('../lib/finding-copy.mjs');
  const inCopy = copyLines(lines);
  const checked = absent.filter((path) => where.get(path).some((i) => !inCopy.has(i)));
  if (checked.length === 0) return none;
  const { loadIndex, resolve: resolvePage } = await import('../lib/docs/resolve.mjs');
  const index = (load ?? loadIndex)(corpus);
  if (!index) return none;
  // A reply that already carries the page the resolver names has nothing to correct, whatever it says of the dead path: a model that
  // followed the Read hook's note writes "I found it at <real>; my first read used <dead>, which does not exist". Separators are
  // read as slashes, so the real page spelled the Windows way counts.
  const carried = message.replaceAll('\\', '/');
  const pairs = [];
  for (const path of checked) {
    if (index.has(path)) continue;
    const page = resolvePage(path, index);
    if (page && !carried.includes(page.path)) pairs.push([path, page.path]);
  }
  if (pairs.length === 0) return none;
  return { code: 0, stderr: '', stdout: `${JSON.stringify({ decision: 'block', reason: asking(pairs) })}\n` };
}

const samePath = (a, b) => real(a) === real(b);
const isMain = process.argv[1] && samePath(process.argv[1], fileURLToPath(import.meta.url));
if (isMain) {
  let out = { code: 0, stderr: '', stdout: '' };
  try {
    out = await report(JSON.parse(readFileSync(0, 'utf8')));
  } catch {
    // Its own failure is never the model's business: no block, and nothing on stderr.
    out = { code: 0, stderr: '', stdout: '' };
  }
  if (out.stdout) process.stdout.write(out.stdout);
  process.exitCode = out.code;
}
