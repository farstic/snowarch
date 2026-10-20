// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-06-S04 — find an executable on PATH, then spawn the FILE.
//
// Not `npx`, and not a bare command name on Windows. Two reasons, both bitten before:
//
//   - A bare name on Windows makes `child_process` fall back to a shell to resolve `.cmd`/`.exe`,
//     and a shell means quoting rules apply to a path the user chose. Resolving here and spawning
//     an absolute path takes the shell out of it entirely.
//   - `npx` would reach the network for a package that is already on the machine, which is exactly
//     the thing a preflight must not depend on.
import { accessSync, constants, statSync } from 'node:fs';
import { delimiter, join } from 'node:path';

/** Windows decides "executable" by extension; PATHEXT is the list, and it is user-configurable. */
const extensions = (env, platform) => (platform === 'win32'
  ? (env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean)
  : ['']);

const runnable = (p, platform) => {
  try {
    if (!statSync(p).isFile()) return false;
    if (platform === 'win32') return true;      // no execute bit semantics worth trusting there
    accessSync(p, constants.X_OK);
    return true;
  } catch { return false; }
};

/**
 * The absolute path of `name` on PATH, or null.
 *
 * `env` and `platform` are parameters rather than ambient reads so a test can resolve a fixture
 * directory on any machine — and so the Windows branch is provable from a POSIX one.
 */
export function which(name, { env = process.env, platform = process.platform } = {}) {
  const path = env.PATH ?? env.Path ?? '';
  for (const dir of path.split(delimiter).filter(Boolean)) {
    for (const ext of extensions(env, platform)) {
      const candidate = join(dir, `${name}${ext}`);
      if (runnable(candidate, platform)) return candidate;
    }
  }
  return null;
}
