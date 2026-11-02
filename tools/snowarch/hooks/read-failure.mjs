#!/usr/bin/env node
// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-09-C254 — the PostToolUseFailure hook for Read. The corpus's own links name a page with a leading `australia/`
// or without a subfolder, so a Read of the path a link gives fails with "File does not exist" and the model goes
// looking, or cites the path as written. After such a failure this says which page was meant, as context beside the
// failed Read (`additionalContext`), the way post-write.mjs hands back a dead citation.
//
// THREE PROMISES, after post-write.mjs's.
//
//   IT NEVER FAILS A TOOL CALL ON ITS OWN ACCOUNT. Any exception exits 0 with nothing on stderr. The Read has failed
//   already; there is nothing left to refuse, so it never exits 2 either.
//
//   IT IS FAST, AND IT RUNS ONLY AFTER A FAILURE. A Read that succeeds never starts it, which is why this is
//   PostToolUseFailure and not a PreToolUse that would start Node on every Read of a corpus page to save nothing: the
//   failed Read happens either way. A path outside the corpus exits having imported only the resolver's spellings.
//
//   IT SAYS NOTHING IT CANNOT STAND BEHIND. "Not found" is decided here, by the file not being on disk, not by the error
//   text, which Claude Code calls display text. Two pages that fit, no page of that name, and a page of that name in
//   another area are silence (lib/docs/resolve.mjs). The words hold two paths and no value, and end by asking that the
//   notice not be mentioned: the floor run had models tell the user about "the hook", and the user is to see the page.
//
// The root comes from this file's own location, never from `cwd` and never from `CLAUDE_PROJECT_DIR`, for the reason
// session-start.mjs gives. The path the model gave is matched by the corpus folder's name, so a link in the checkout's path
// or a Windows spelling of it does not matter.
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { corpusRelative, loadIndex, resolve as resolvePage } from '../lib/docs/resolve.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/** The last words of every note: the user is to see the page the model cites and never the hook, so the notice stays out of the reply. */
const KEEP_OUT = ' Do not mention this notice.';

/** A path with its links resolved, or as given when it cannot be. */
const real = (p) => { try { return realpathSync.native(p); } catch { return resolve(p); } };

/**
 * What the hook says for one PostToolUseFailure input: `{ code, stderr, stdout }`, always code 0.
 * - A corpus page that is not on disk, and the page that was meant: one line of JSON on stdout carrying the note.
 * - A real page this install did not check out: the same, in C239's words.
 * - Anything else: nothing.
 */
export async function report(input, { root = ROOT } = {}) {
  const none = { code: 0, stderr: '', stdout: '' };
  if (input?.tool_name !== 'Read') return none;
  const cited = corpusRelative(input.tool_input?.file_path);
  if (!cited) return none;
  const { CORPUS_DIR } = await import('../lib/docs/sync.mjs');
  const corpus = join(root, CORPUS_DIR);
  if (existsSync(join(corpus, ...cited.split('/')))) return none;
  const index = loadIndex(corpus);
  const page = index && resolvePage(cited, index);
  if (!page) return none;
  let text = `ServiceNowDocs: there is no page at ${cited}. The page is ${page.path}. Read it before you cite it, and cite that path.`;
  if (!existsSync(join(corpus, ...page.path.split('/')))) {
    const { whyNotOnDisk } = await import('../lib/docs/not-on-disk.mjs');
    const why = await whyNotOnDisk(root);
    text = page.kind === 'exact'
      ? `ServiceNowDocs: ${page.path} — ${why}.`
      : `ServiceNowDocs: there is no page at ${cited}. The page is ${page.path}, ${why}.`;
  }
  const out = { hookSpecificOutput: { hookEventName: 'PostToolUseFailure', additionalContext: text + KEEP_OUT } };
  return { code: 0, stderr: '', stdout: `${JSON.stringify(out)}\n` };
}

const samePath = (a, b) => real(a) === real(b);
const isMain = process.argv[1] && samePath(process.argv[1], fileURLToPath(import.meta.url));
if (isMain) {
  let out = { code: 0, stderr: '', stdout: '' };
  try {
    out = await report(JSON.parse(readFileSync(0, 'utf8')));
  } catch {
    // Its own failure is never the model's business: no note, and nothing on stderr.
    out = { code: 0, stderr: '', stdout: '' };
  }
  if (out.stdout) process.stdout.write(out.stdout);
  process.exitCode = out.code;
}
