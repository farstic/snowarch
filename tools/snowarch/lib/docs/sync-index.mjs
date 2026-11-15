// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-09-C263 (M3) — the names index after a docs sync: the one place that says WHEN it is built, and the only module that names
// names-index-build.mjs. The callers are the three things that sync the corpus — bootstrap B02, `./snowarch docs sync` and
// `./snowarch doctor --fix` (E-33) — and an upgrade reaches it through B02. The builder runs in a CHILD node, not an import:
// B02 and the doctor are reachable from the hooks' imports (the SessionStart hook prints the doctor's panel), and nothing a hook
// can load may be able to build an index in a session. The child also frees the ~300 MB the build holds when it ends.
//
// A failed build is `{ built: false, error }` and a sentence, never a throw: the sync it follows has succeeded, and
// `doctor --fix` builds the index later.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { spellings } from '../launcher-spelling.mjs';

const BUILDER = fileURLToPath(new URL('./names-index-build.mjs', import.meta.url));

/** The sentence a failed build leaves. */
export const notBuilt = (error, cli) => `[docs] note: the names index was not built (${error}) — run ${cli} doctor --fix`;

/**
 * Builds (or confirms) the index of `corpus` for `pin`. `say` prints the lines; `cli` is the launcher's spelling for the remedy.
 * `run` is the seam a test gives; `timeoutMs` bounds a build that hangs (the real one takes under a minute).
 */
export function indexAfterSync({ root, corpus, pin, say = () => {}, cli = spellings().cli, force = false, run = execFileSync, timeoutMs = 600_000 }) {
  let out;
  try {
    const stdout = run(process.execPath, [BUILDER, '--root', root, '--corpus', corpus, '--pin', pin, ...(force ? ['--force'] : [])],
      { encoding: 'utf8', timeout: timeoutMs, maxBuffer: 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    out = JSON.parse(String(stdout).trim().split('\n').pop());
  } catch (e) {
    // A non-zero exit still printed its JSON line; read it when it is there.
    try { out = JSON.parse(String(e?.stdout ?? '').trim().split('\n').pop()); } catch { out = null; }
    if (!out) out = { built: false, ms: 0, meta: null, error: /TIMEDOUT$/.test(String(e?.code ?? '')) ? 'the build timed out' : (e instanceof Error ? e.message.split('\n')[0] : String(e)) };
  }
  if (out.line) say(out.line);
  else if (out.error) say(notBuilt(out.error, cli));
  return out;
}
