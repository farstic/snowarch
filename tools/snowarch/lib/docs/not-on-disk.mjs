// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-09-C254 — what to say of a real page this install did not check out. It was post-write.mjs's (ARC-09-C239); the
// Read hook says it too, and a wording kept in two places is two wordings.
import { join } from 'node:path';

/**
 * Why a page the corpus tree has is not on disk, by the mode the product reads (the recorded one, else the shape on
 * disk: `modeOf`). On a sparse corpus the page is simply not installed; on the whole corpus a page not on disk is a
 * switch that did not finish, which the doctor names. The modules are imported here, not above: a hook that has no such
 * page to speak of never loads them.
 */
export async function whyNotOnDisk(root) {
  const { CORPUS_DIR, MODE } = await import('./sync.mjs');
  const { modeOf, recordedMode, sparseOf } = await import('./shape.mjs');
  const { spellings } = await import('../text.mjs');
  return modeOf(recordedMode(root), sparseOf(join(root, CORPUS_DIR))) === MODE.sparse
    ? 'a real page, not installed on this sparse corpus'
    : `not on disk in this install's corpus — run ${spellings().cli} doctor`;
}
