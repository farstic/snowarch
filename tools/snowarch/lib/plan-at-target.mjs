// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-09-C195 — U4's plan, asked of the TARGET's own runner.
//
// An upgrade runs in the process that started it, so U4's STEPS, INPUTS and hashFor are the installed release's,
// while the bootstrap U6 runs is the target's: ARC-08-C29's defect, across versions. The installed release's U4
// spawns this file in a child, once the target's files have passed the signed-manifest check. It imports the target's
// own `planSteps` from a worktree of the tag, calls it with `{ ctx, state, manifestWritten }` (the options
// `tests/contract/plan-contract.test.mjs` holds every release to), and prints its answer, `{ steps, estimate }`, as
// one line of JSON on stdout. Stdout is the only channel U4 reads; a failure is one line on stderr and exit 1, and U4
// then plans with its own tables and says so. The target's code runs here before the user says Y, so this plans and
// does nothing more: it writes no file. ARC-09-C241 — the target plans in the worktree this runs in, handed to its
// planSteps as `keepWorktree` when that worktree is the tag's checkout, and U4 removes it; a target from before C241
// makes and removes a worktree of its own.
//
// Usage: node plan-at-target.mjs <worktree of the tag> <checkout root> <tag>, with `{ manifestWritten, state }` as
// JSON on stdin. The state comes from U4, parsed as the installed release read it, so the target needs no loader.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const [worktree, root, tag] = process.argv.slice(2);
try {
  const { manifestWritten = false, state = null } = JSON.parse(readFileSync(0, 'utf8') || '{}');
  const config = JSON.parse(readFileSync(join(worktree, 'engine.config.json'), 'utf8'));
  const { planSteps } = await import(pathToFileURL(join(worktree, 'tools/snowarch/lib/commands/upgrade.mjs')).href);
  // ARC-09-C241 — planned in only when it IS the tag's checkout: a tree that holds the target's code without being a
  // worktree of the tag is not, and the target's planSteps then makes a worktree of its own.
  const commit = (cwd, rev) => {
    try {
      return execFileSync('git', ['rev-parse', '--verify', '--quiet', rev],
        { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch { return null; }
  };
  const tagged = commit(root, `${tag}^{commit}`);
  const keepWorktree = tagged !== null && commit(worktree, 'HEAD') === tagged ? worktree : null;
  const { steps, estimate } = planSteps(root, tag, { ctx: { root, config }, state, manifestWritten, keepWorktree });
  writeSync(1, `${JSON.stringify({ steps, estimate })}\n`);
} catch (e) {
  writeSync(2, `plan-at-target: ${String(e?.message ?? e).split('\n')[0]}\n`);
  process.exitCode = 1;
}
