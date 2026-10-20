// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * L10 — `claude plugin validate` on the skills and agents directories.
 *
 * The only check here that needs a tool outside this repository, which shapes how it behaves. In
 * the `lint` job the CLI is not installed, so L10 says it skipped and why; enforcement lives in the
 * dedicated `plugin validate` job, where the CLI is. A check that silently passed when it could not
 * run would make that job look redundant, and it would be the one actually doing the work.
 *
 * `--require-claude` turns absence into "cannot run" (exit 2), which is what the enforcing job
 * passes: there, a missing CLI means the job is misconfigured, not that there is nothing to check.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { delimiter, join } from 'node:path';

export const id = 'L10';
export const title = 'the skills and agents directories validate as plugins';

const DIRS = ['.claude/skills', '.claude/agents'];

/**
 * `claude` on PATH, resolved by hand.
 *
 * Not `spawnSync('claude', …)`: on Windows the executable is `claude.cmd`, and Node refuses to
 * spawn a `.cmd` without a shell — so the naive call reports "not installed" on the one platform
 * where it is most likely to be installed differently.
 */
function findClaude() {
  const exts = process.platform === 'win32' ? ['.cmd', '.exe', '.bat', ''] : [''];
  for (const dir of (process.env.PATH ?? '').split(delimiter).filter(Boolean)) {
    for (const ext of exts) {
      const candidate = join(dir, `claude${ext}`);
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

export function run(ctx) {
  const claude = findClaude();
  if (!claude) {
    if (ctx.requireClaude) {
      ctx.cannotRun('L10: --require-claude was passed and claude is not on PATH');
    }
    ctx.skipped?.add(id);
    ctx.skipNotes?.push('L10: claude not on PATH — validation runs in the plugin validate job');
    return [];
  }

  const findings = [];
  for (const dir of DIRS) {
    if (!existsSync(join(ctx.root, dir))) continue;
    const r = spawnSync(claude, ['plugin', 'validate', dir], {
      cwd: ctx.root, encoding: 'utf8', timeout: 120_000,
    });
    if (r.error) {
      ctx.skipNotes?.push(`L10: ${dir} — could not run claude (${r.error.message})`);
      continue;
    }
    if (r.status !== 0) {
      // The CLI's own message is the finding: it names the file and the reason, and paraphrasing
      // it here would put this check between the reader and the tool that knows.
      const out = `${r.stdout ?? ''}${r.stderr ?? ''}`.trim().split('\n').filter(Boolean);
      findings.push({ file: dir, line: 1, message: `plugin validate failed — ${out[0] ?? `exit ${r.status}`}` });
      for (const line of out.slice(1, 6)) findings.push({ file: dir, line: 1, message: `  ${line}` });
    }
  }
  return findings;
}
