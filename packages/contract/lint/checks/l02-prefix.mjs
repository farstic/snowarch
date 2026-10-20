// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * L02 — every `mcp__<key>__` prefix equals the one the registration actually uses.
 *
 * The value comes from `engine.config.json` and from nowhere else. That is the point of the
 * check: P-05 was three different registration prefixes live in the tree at once, with no
 * single place saying which was right. Hard-coding the expected prefix here would recreate the
 * problem one level up — there would again be two declarations, and the lint would enforce its
 * own rather than the product's. (The three are listed in `retired-names.json`, which is where
 * a reader should look: naming them here would put them in a file the ratchet scans.)
 */
import { HISTORICAL_MARKER, honoursMarker, isHistory, readLines } from '../lib/scan.mjs';

const PREFIX = /\bmcp__[a-z0-9_-]+__/g;

export const id = 'L02';
export const title = 'every mcp__ prefix is the one engine.config.json declares';

export function run(ctx) {
  const expected = `mcp__${ctx.serverKey}__`;
  const findings = [];

  for (const file of ctx.files) {
    if (isHistory(file)) continue;
    // The same marker L03 honours, in the same three places. An ADR that RECORDS the choice of
    // registration key has to quote the keys it rejected — that is the decision it is recording
    // — and a check that forbade it would make the record unwritable. Added after the real tree
    // showed `docs/decisions/ADR-0001-names.md` failing L02 for naming its own alternatives.
    const marked = honoursMarker(file);
    const lines = readLines(ctx.root, file);
    lines.forEach((line, i) => {
      if (marked && line.trimEnd().endsWith(HISTORICAL_MARKER)) return;
      for (const m of new Set([...line.matchAll(PREFIX)].map((x) => x[0]))) {
        if (m === expected) continue;
        findings.push({
          file,
          line: i + 1,
          message: `prefix ${m} ≠ ${expected}`,
        });
      }
    });
  }

  // The `.mcp.json` leg. ARC-06-S01 commits that file; until then this is a SKIP and never a
  // pass — a check that quietly reports success for something it did not look at is worse than
  // one that says it could not look.
  if (!ctx.mcpJson) {
    ctx.skipNotes.push('L02: .mcp.json not present — the registration-key leg is not checked (ARC-06-S01)');
  } else {
    const keys = Object.keys(ctx.mcpJson.mcpServers ?? {});
    if (keys.length !== 1) {
      findings.push({ file: '.mcp.json', message: `expected exactly one mcpServers key, found ${keys.length}` });
    } else if (keys[0] !== ctx.serverKey) {
      findings.push({ file: '.mcp.json', message: `mcpServers key ${keys[0]} ≠ ${ctx.serverKey}` });
    }
  }

  return findings;
}
