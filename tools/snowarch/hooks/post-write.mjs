#!/usr/bin/env node
// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-09-C231 — the PostToolUse citation check: a file the Architect writes under `clients/` has its citations
// resolved after the write, and a dead path goes back to the model before the file is presented. An Envelope is
// written at Phase 1 Step 5, before any Phase 2 exists, so the check rides on the write itself.
//
// THREE PROMISES, after session-start.mjs's.
//
//   IT NEVER FAILS A TOOL CALL ON ITS OWN ACCOUNT. Any exception exits 0 with nothing on stderr. Only a dead
//   citation exits 2: Claude Code shows a PostToolUse hook's stderr to the model then, after the tool has run.
//   ARC-09-C239 — a real page this install did not check out is not dead: alone, it is said as context (exit 0, one
//   line of JSON on stdout), so the model is never asked to correct a citation that is right.
//
//   IT IS FAST. Outside `clients/` it exits having imported only the constant that names a finding note; the resolver
//   is imported only for a file it checks (about 30 ms either way, measured, most of it Node's own start). A path not
//   on disk costs one git read of the corpus tree, and the wording of a page not checked out one read of the mode.
//
//   IT RESOLVES AS THE GATE DOES. The resolver is the shipped citation gate's, `tools/snowarch/lib/docs/verify.mjs`,
//   given the written file as its one root: no second reading of what a citation is, and none of what makes one dead.
//
// The root comes from this file's own location, never from `cwd` and never from `CLAUDE_PROJECT_DIR`, for
// session-start.mjs's reason: inside a session that variable is the SESSION's project.
import { readFileSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FINDING_PATH } from '../lib/finding-path.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/** What a dead citation asks of the model, said after the paths. */
export const CORRECT = 'Correct each path before presenting the file.';

/** A path with its links resolved, or as given when it cannot be (a file that is not there). */
const real = (p) => { try { return realpathSync.native(p); } catch { return resolve(p); } };

/**
 * The written file's path below `root`, `/`-separated, when it is under `clients/`; otherwise `null`. ARC-09-C239 — a
 * note `/snowarch finding` writes is `null` too: it records a path as the user saw it, dead or not.
 *
 * Both sides as real paths: Node gives this script its own path with links resolved, so ROOT is a real path, while the
 * path Claude Code passes is spelled the way the session reached the file. A checkout through a symlinked folder, or
 * macOS's `/var` (a link to `/private/var`), made every file "outside clients/", and nothing was checked.
 */
export function clientsPath(root, filePath) {
  if (typeof filePath !== 'string' || filePath === '') return null;
  const abs = isAbsolute(filePath) ? filePath : resolve(root, filePath);
  const rel = relative(real(root), real(abs)).split(sep).join('/');
  return rel.startsWith('clients/') && !FINDING_PATH.test(rel) ? rel : null;
}

/**
 * What the hook says for one PostToolUse input: `{ code, stderr, stdout }`.
 * - A dead path: exit 2, the dead paths with their lines, then CORRECT; a page this install did not check out follows.
 * - Only pages this install did not check out: exit 0, and on stdout the line of JSON that carries them as context.
 * - Otherwise 0 and nothing: outside `clients/`, with no corpus to resolve against (the doctor reports that), or with
 *   every path alive.
 */
export async function report(input, { root = ROOT } = {}) {
  const none = { code: 0, stderr: '', stdout: '' };
  const rel = clientsPath(root, input?.tool_input?.file_path);
  if (!rel) return none;
  const { verifyCitations } = await import('../lib/docs/verify.mjs');
  const r = verifyCitations({ root, roots: [rel] });
  if (r.status !== 'fail') return none;
  const dead = r.dead.filter((d) => d.reason !== 'outside');
  const notes = await notCheckedOut(root, r.dead.filter((d) => d.reason === 'outside'));
  if (dead.length === 0) {
    const context = `In ${rel}: ${notes.join('; ')}.`;
    return { code: 0, stderr: '',
      stdout: `${JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: context } })}\n` };
  }
  const n = dead.length;
  const paths = dead.map((d) => `${d.path} (line ${d.line})`).join('; ');
  const also = notes.length > 0 ? ` In the same file: ${notes.join('; ')}.` : '';
  return { code: 2, stderr: `${n} dead citation${n === 1 ? '' : 's'} in ${rel}: ${paths}. ${CORRECT}${also}\n`, stdout: '' };
}

/**
 * ARC-09-C239 — what to say of each real page this install did not check out. The wording is lib/docs/not-on-disk.mjs's
 * (ARC-09-C254), which the Read hook uses as well.
 */
async function notCheckedOut(root, outside) {
  if (outside.length === 0) return [];
  const { whyNotOnDisk } = await import('../lib/docs/not-on-disk.mjs');
  const why = await whyNotOnDisk(root);
  return outside.map((d) => `${d.path} (line ${d.line}) — ${why}`);
}

const samePath = (a, b) => real(a) === real(b);
const isMain = process.argv[1] && samePath(process.argv[1], fileURLToPath(import.meta.url));
if (isMain) {
  let out = { code: 0, stderr: '', stdout: '' };
  try {
    out = await report(JSON.parse(readFileSync(0, 'utf8')));
  } catch {
    // Its own failure is never the model's business: no finding, and nothing on stderr.
    out = { code: 0, stderr: '', stdout: '' };
  }
  if (out.stdout) process.stdout.write(out.stdout);
  if (out.stderr) process.stderr.write(out.stderr);
  process.exitCode = out.code;
}
