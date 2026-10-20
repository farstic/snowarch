// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * L09 — a `used_by` value nobody can resolve, or a tool the engine cites but does not pin.
 *
 * Two halves of one property: the pin says what the engine depends on and who depends on it, and
 * both halves have to be true. A `used_by` naming a skill that does not exist makes the pin
 * unreadable as a dependency map; a skill citing a tool the pin does not carry means a rename on
 * the server side passes the pin and breaks that skill silently, which is the whole failure the
 * pin exists to prevent.
 */
import { readLines } from '../lib/scan.mjs';

export const id = 'L09';
export const title = 'used_by resolves, and every cited tool is pinned';

/** The fixed half of the vocabulary (ARC-05-S01). The rest is a skill or agent directory name. */
const FIXED = new Set(['§2.1', '§2.2', 'VALIDATION-TESTS', 'bootstrap',
  '/snowarch status', '/snowarch doctor', '/snowarch setup-instance']);

/** Where a tool citation is a dependency rather than an illustration. */
const CITING = [/^CLAUDE\.md$/, /^\.claude\/rules\//, /^governance\//,
  /^\.claude\/skills\//, /^\.claude\/agents\//];

const TOKEN = /\bsnow_[a-z0-9_]+\b/g;

export function run(ctx) {
  const findings = [];
  const file = 'packages/contract/required-tools.json';

  const known = new Set([
    ...FIXED,
    ...ctx.files
      .map((f) => /^\.claude\/(?:skills\/([^/]+)\/SKILL|agents\/([^/]+))\.md$/.exec(f))
      .filter(Boolean)
      .map((m) => m[1] ?? m[2]),
  ]);

  for (const t of ctx.requiredTools.tools) {
    for (const u of t.used_by) {
      if (!known.has(u)) {
        findings.push({
          file,
          line: 1,
          message: `${t.name}: used_by "${u}" is neither a fixed vocabulary value nor a skill or `
            + 'agent directory that exists',
        });
      }
    }
    // A `sessionMutates` tool is part of the write gate whether or not anything else cites it,
    // so §2.1 must be among its dependants — otherwise removing the last skill that mentions it
    // would make it look unused.
    const live = ctx.contract.tools.find((x) => x.name === t.name);
    if (live?.sessionMutates && !t.used_by.includes('§2.1')) {
      findings.push({
        file,
        line: 1,
        message: `${t.name}: sessionMutates is true, so §2.1 depends on it — add "§2.1" to used_by`,
      });
    }
  }

  const pinned = new Set(ctx.requiredTools.tools.map((t) => t.name));
  const real = new Set(ctx.contract.tools.map((t) => t.name));
  for (const f of ctx.files.filter((x) => CITING.some((re) => re.test(x)))) {
    let fenced = false;
    readLines(ctx.root, f).forEach((line, i) => {
      if (line.trimStart().startsWith('```')) { fenced = !fenced; return; }
      if (fenced) return;
      for (const m of line.matchAll(TOKEN)) {
        const name = m[0];
        // A name the server does not have is L01's finding, not this one; reporting it twice would
        // make one rename look like two problems.
        if (!real.has(name) || pinned.has(name)) continue;
        findings.push({
          file: f,
          line: i + 1,
          message: `${name} is cited here but not in required-tools.json — add it to `
            + `packages/contract/required-tools.json with used_by: ["${skillOf(f)}"]`,
        });
      }
    });
  }
  return findings;
}

function skillOf(file) {
  const m = /^\.claude\/(?:skills\/([^/]+)\/|agents\/([^/]+)\.md)/.exec(file);
  if (m) return m[1] ?? m[2];
  if (file.startsWith('governance/') || file === 'CLAUDE.md' || file.startsWith('.claude/rules/')) return '§2.1';
  return file;
}
