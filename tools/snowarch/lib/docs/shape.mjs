// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-09-C239 — the corpus's mode as the product reads it: the mode the bootstrap recorded, and the shape the checkout
// has on disk. Moved out of status.mjs, which re-exports all four, so the citation hook reads them without status.mjs's
// licence imports: a hook that words one notice should not load the integrity check, and each import it adds is one
// more way for the notice to fail silently.
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { statePath } from '../local-paths.mjs';
import { MODE, effectiveDocsMode } from './sync.mjs';

/**
 * The four shapes a checkout can be in.
 *
 * `full` is `MODE.full` rather than a second spelling of the word: "the whole corpus is on disk" is
 * the same claim whether it arrives as a requested mode or as an observed shape, and writing it
 * twice would be two definitions of one fact — and two literals for the ARC-05-S10 scan to judge,
 * where the allow-list already carries exactly one argued row for this homograph.
 */
export const SPARSE = Object.freeze({ cone: 'cone', full: MODE.full, pattern: 'pattern', none: 'none' });

/** One git config value in the corpus, or `''` when git has none or fails. */
const config = (corpus, key) => {
  try {
    return execFileSync('git', ['config', '--get', key], { cwd: corpus, encoding: 'utf8', stdio: 'pipe' }).trim();
  } catch { return ''; }
};

/**
 * `cone` | `full` | `pattern` | `none`.
 *
 * `pattern` is the ADR-0008 shape — sparse checkout on, cone mode off, which is what git 2.34.1
 * silently produces from `set --cone` and which omits the corpus's root files. It is reported as
 * its own value rather than folded into `cone`, because the remedy differs.
 */
export function sparseOf(corpus) {
  if (!existsSync(join(corpus, '.git'))) return SPARSE.none;
  const on = config(corpus, 'core.sparseCheckout') === 'true';
  if (!on) return SPARSE.full;
  return config(corpus, 'core.sparseCheckoutCone') === 'true' ? SPARSE.cone : SPARSE.pattern;
}

/**
 * The recorded mode, and the checkout's shape, are two different questions.
 *
 * `mode` is what the operator ASKED for — ARC-06 writes it to `.local/bootstrap-state.json` — and
 * `sparse` is what is on disk. They can disagree (a state file saying `sparse` over a full
 * checkout), and reporting both is the point: the disagreement is the finding.
 *
 * ARC-09-C244 — read as every other reader reads it (`effectiveDocsMode`): a recorded `sparse` without the
 * `optIn` marker is the default an older release wrote, and the default is now the whole corpus. So it reports
 * `full`, and a cone still on disk is the disagreement E-15 names, with `docs sync` as the cure.
 */
export function recordedMode(root) {
  const p = statePath(root);
  if (!existsSync(p)) return null;
  try {
    const docs = JSON.parse(readFileSync(p, 'utf8'))?.docs;
    const m = docs?.mode;
    return (m === MODE.sparse || m === MODE.full || m === 'skip') ? effectiveDocsMode(docs) : null;
  } catch { return null; }
}

/**
 * ARC-09-C239 — the mode the product reads for a corpus: the recorded one, and with nothing recorded the shape on disk.
 * ONE rule with two readers: `docsStatus`, and the citation hook, which words a page this install did not check out by
 * it and has no rule of its own.
 */
export const modeOf = (recorded, sparse) => recorded ?? (sparse === SPARSE.full ? MODE.full : MODE.sparse);
