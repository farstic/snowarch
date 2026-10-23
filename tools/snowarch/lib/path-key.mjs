// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-09-C198 — one spelling for one folder.
//
// B00's `samePath` answered "are these two paths one place?" with this normalisation inside it. The bootstrap state now
// records which folder its steps ran in (`state.mjs`), and that record needs the same answer written down as a key, for
// a folder that may not exist on this machine at all. So the normalisation lives here, `samePath` calls it, and both
// questions get one rule.
import { realpathSync } from 'node:fs';
import { posix, win32 } from 'node:path';

/** The spelling of `p` that two paths to one place share, on `plat`. */
export function pathKey(p, plat = process.platform) {
  let x = String(p).trim();
  // `realpath` first: on macOS `/tmp` and `/var` are symlinks, managed machines symlink home
  // directories, and git always reports the resolved path.
  // `.native` is not a detail on Windows: the plain `realpathSync` resolves junctions but leaves
  // an 8.3 SHORT name alone, so the runner's `C:\Users\RUNNER~1\...` stayed short while git
  // reported `C:/Users/runneradmin/...` long — one directory, two names, compared unequal. The
  // native call goes through `GetFinalPathNameByHandle` and canonicalises both.
  try { x = realpathSync.native(x); } catch {
    try { x = realpathSync(x); } catch { /* a path that does not exist yet still normalises */ }
  }
  // Then the PLATFORM'S OWN resolver, chosen by the parameter rather than by which machine is
  // running. `path.resolve` is whichever flavour the host is, so on macOS it leaves
  // `C:/Users/...` untouched and the Windows branch could not be exercised anywhere but
  // Windows — which is how it shipped broken: git prints forward slashes there, Node hands
  // back backslashes, and every command exited 3 saying "not at the repository root".
  // Windows paths are also case-insensitive, so `D:\A\repo` and `D:\a\repo` are one place.
  if (plat === 'win32') return win32.resolve(x.replace(/\//g, '\\')).toLowerCase();
  return posix.resolve(x);
}
