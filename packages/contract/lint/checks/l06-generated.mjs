// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * L06 — a generated file that is not what its generator would produce.
 *
 * The failure this catches is specific and has happened: a maintainer accepts a contract change
 * with `pin.mjs`, the sha moves, and every generated file's header — and the tables rendered from
 * the contract — are now stale. Nothing else notices, because each generated file is still valid
 * markdown and the tests that read the contract read the contract, not the documents about it.
 *
 * Every generator's own `--check` is the judge, from the one list in `scripts/lib/generators.mjs`.
 * Re-deriving "is it current" here would be a second opinion, and the one that is wrong when they
 * disagree is always the copy.
 */
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

import { classifyFailure, GENERATORS } from '../../../../scripts/lib/generators.mjs';

export const id = 'L06';
export const title = 'every generated file matches what its generator produces';

export function run(ctx) {
  const findings = [];
  const couldNotRun = [];
  const selfRoot = ctx.root;

  // The list is a parameter so a test can plant a generator that CRASHES. Every real caller gets
  // the one list; a test that pushed onto it would leave the plant behind for the next test.
  for (const gen of (ctx.generators ?? GENERATORS)) {
    if (!gen.supportsRoot && !ctx.isSelfRoot) {
      // Said out loud rather than passed over: these two resolve from their own location, so
      // against a fixture tree they would check the real repository and report a reassuring pass
      // about a tree nobody asked about.
      ctx.skipNotes?.push(`L06: ${gen.id} takes no --root, so it is not checked against a fixture tree`);
      continue;
    }
    const args = [join(selfRoot, gen.script), '--check', ...(gen.supportsRoot ? ['--root', selfRoot] : [])];
    try {
      execFileSync(process.execPath, args, { cwd: selfRoot, encoding: 'utf8', stdio: 'pipe' });
    } catch (e) {
      const out = `${e.stdout ?? ''}${e.stderr ?? ''}`;
      // "Could not run" is not "differs", and the difference matters more here than anywhere: a
      // generator that crashed produced nothing to compare, so telling a reader their file is
      // stale sends them to regenerate a file that is fine. Exit 2 is the generators' own
      // convention for it; a crash exits 1 like a stale target and is recognised by its stack.
      const verdict = classifyFailure({ status: e.status, out });
      if (verdict.kind === 'cannot-run') {
        couldNotRun.push({ id: gen.id, ...verdict });
        ctx.skipNotes?.push(`L06: ${gen.id} could not run here — ${verdict.reason}`);
        // A missing dependency on a design-only install is EXPECTED — no `npm ci` there by
        // design — and is reported as a skip with the reason. Any other crash is a fault in the
        // toolchain and is a finding, because nothing else in the repository would notice it.
        if (!verdict.dependency) {
          findings.push({
            file: gen.script,
            line: 1,
            message: `generator could not run: ${verdict.reason} — run node ${gen.script}`,
          });
        }
        continue;
      }
      // The generator's own diff already names the target and the line. Carry the first changed
      // line through rather than a count: "README.md differs" sends a reader to regenerate blindly,
      // and the line tells them what moved and therefore whether they expected it.
      // One finding per STALE TARGET, not one per generator. A contract change moves the header
      // sha of every generated file at once, and a single line saying "gen-governance differs"
      // would hide that four of its five targets moved with it.
      const lines = out.split('\n');
      const stale = [];
      lines.forEach((l, i) => {
        if (!l.startsWith('--- a/')) return;
        const target = l.slice(6).trim();
        const first = lines.slice(i + 1).find((x) => /^[+-]/.test(x) && !/^[+-]{3}/.test(x));
        stale.push({ target, first });
      });
      if (stale.length === 0) stale.push({ target: gen.targets[0], first: undefined });
      for (const { target, first } of stale) {
        findings.push({
          file: target,
          line: 1,
          message: `differs from generator output (${gen.id})`
            + `${first ? ` — first change: ${first.trim().slice(0, 90)}` : ''}`
            + ` — run node ${gen.script}`,
        });
      }
    }
  }
  // Nothing to compare and nothing wrong to report: the check did not run, and `statusOf` renders
  // that as `skip`. A skip shown as a pass is the one outcome a reader must not see.
  if (findings.length === 0 && couldNotRun.length > 0) ctx.skipped?.add(id);
  return findings;
}
