// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-09-C265 — `clients/` EXISTS AFTER A BOOTSTRAP: empty, made only when nothing is there, never touched when something is.
//
// The user types `Status` in a fresh install and the Architect looks for the engagement; a listing of a folder that is not there
// prints `ls: clients: No such file or directory` before any engagement exists. An empty folder reads as "no engagement folder yet".
// `.gitignore` keeps `clients/` out of git: it holds a client's work, which stays on the machine.
//
// THE BOOTSTRAP COMMAND MAKES IT, NOT A STEP. A step would have to be stale to run on an install made before this release, and the
// only step that belongs to a workspace is B01, whose run also fetches the release manifest: an input that moved it would send every
// older install to the network once more and make the held manifest "not held" in the plan. The command runs every time, after the
// plan is accepted and before the steps, and has no inputs to move.
import { lstatSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export const CLIENTS_DIR = 'clients';

/**
 * `lstat`, not `exists`: a symlink the user pointed somewhere else (dangling or not) and a file called `clients` are theirs, and are
 * left alone. A folder that cannot be made is reported with its reason; the caller says so and goes on, because nothing depends on it.
 */
export function ensureClientsDir(root) {
  const dir = join(root, CLIENTS_DIR);
  try { lstatSync(dir); return { existed: true, error: null }; } catch { /* nothing there */ }
  try {
    mkdirSync(dir, { recursive: true });
    return { existed: false, error: null };
  } catch (e) {
    return { existed: false, error: e?.code ?? String(e?.message ?? e) };
  }
}
