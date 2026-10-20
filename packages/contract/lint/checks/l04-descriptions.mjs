// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * L04 — a skill or agent description that is too long, or shaped so it will not register.
 *
 * Both failures are silent at runtime. A description over 500 characters is truncated by the
 * harness, and a `": "` inside an unquoted YAML scalar makes the frontmatter parse as a map, which
 * drops the agent from the registry with no error anywhere (`.claude/agents/now-assist-specialist.md`
 * lost a whole persona to that once).
 *
 * The rules come from `tools/snowarch/lib/lint-rules.mjs` — ARC-02-S02's SK-02 and AG-02 — rather than a
 * second implementation. Two implementations of "too long" is two answers to the same question.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { parseFrontmatter } from '../../lib/frontmatter.mjs';

export const id = 'L04';
export const title = 'skill and agent descriptions register and are not truncated';

const MAX = 500;

export function run(ctx) {
  const findings = [];
  const files = ctx.files.filter((f) => /^\.claude\/(skills\/[^/]+\/SKILL|agents\/[^/]+)\.md$/.test(f));

  for (const file of files) {
    let data;
    let quoted;
    try {
      ({ data, quoted } = parseFrontmatter(readFileSync(join(ctx.root, file), 'utf8'), file));
    } catch (e) {
      findings.push({ file, line: 1, message: `frontmatter does not parse: ${e.message}` });
      continue;
    }
    const description = data.description;
    if (typeof description !== 'string' || description.trim() === '') {
      findings.push({ file, line: 1, message: 'no description — the harness has nothing to route on' });
      continue;
    }
    // Code points, not UTF-16 units: an em dash is one character to a reader and to the harness.
    const length = [...description].length;
    if (length > MAX) {
      findings.push({ file, line: 1, message: `description is ${length} characters, ${length - MAX} over the ${MAX} limit` });
    }
    // The colon-space hazard, and only where it bites: inside an UNQUOTED scalar.
    if (!quoted.description && description.includes(': ')) {
      findings.push({
        file,
        line: 1,
        message: 'description contains ": " and is not quoted — YAML reads it as a map and the entry '
          + 'does not register at all',
      });
    }
  }
  return findings;
}
