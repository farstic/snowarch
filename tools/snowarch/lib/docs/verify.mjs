// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-03-S03 — the citation gate, as a library.
//
// The bash script it replaces (scripts/verify-citations.sh:23-26) EXITED 0 when the corpus was
// absent, so a fresh clone passed with every citation unverified. That is the defect this file
// exists to remove: a missing corpus is `missing`, never `ok`, and the word SKIP appears nowhere.
import { existsSync, realpathSync } from 'node:fs';
import { join, sep } from 'node:path';
import { scanRepo } from './citations.mjs';
import { needSpell, spellings } from '../launcher-spelling.mjs';

export const EXIT = { ok: 0, dead: 1, missing: 3 };

// A citation is "checked" once per distinct normalised path BEFORE brace expansion; a brace
// citation with a missing member is one dead citation naming the member, not two citations.
export function verifyCitations({ root = process.cwd(), corpusDir = 'vendor/ServiceNowDocs',
                                  allowMissing = false, roots } = {}) {
  const corpus = join(root, corpusDir);
  if (!existsSync(join(corpus, 'markdown'))) {
    return { status: 'missing', checked: 0, dead: [], areasMissing: [], warnings: [], allowMissing };
  }
  const { citations, warnings } = scanRepo({ root, ...(roots ? { roots } : {}) });

  // `checked` is the number of DISTINCT NORMALISED CITATION PATHS BEFORE BRACE EXPANSION, per the
  // story — not the number of citation SITES. The same document cited from five skills is one thing
  // to check, and the old bash script's "175" counted punctuation variants, which is why the figure
  // is defined this precisely. Grouping is therefore by the normalised raw path, and the expanded
  // members of a brace citation stay attached to it so one missing member is one dead citation.
  const byOrigin = new Map();
  for (const c of citations) {
    const key = c.raw.replace(/^(?:vendor\/)?(?:ServiceNowDocs\/)?/, '').replace(/[).,;:]+$/, '').replace(/\/$/, '');
    if (!byOrigin.has(key)) byOrigin.set(key, []);
    byOrigin.get(key).push(c);
  }

  const dead = [];
  const seenDead = new Set();
  for (const [key, all] of byOrigin) {
    // De-duplicate the members of one distinct path that were cited from several places: the same
    // brace citation appearing in three files expands to the same members each time.
    const members = [...new Map(all.map((c) => [c.path, c])).values()];
    for (const c of members) {
      const abs = join(corpus, ...c.path.split('/'));      // node:path, never string concatenation
      if (!existsSync(abs)) {
        const entry = { path: c.path, file: c.file, line: c.line };
        if (members.length > 1) entry.member = c.path.split('/').pop();
        // One dead entry per distinct missing path, reported at its first citation site.
        if (!seenDead.has(c.path)) { seenDead.add(c.path); dead.push(entry); }
        continue;
      }
      // Case-insensitive filesystems (macOS, Windows) accept a wrongly-cased citation that Linux CI
      // will reject. WARN rather than FAIL, per the story's risk note — the matrix is the real gate.
      try {
        const real = realpathSync.native(abs);
        if (!real.split(sep).join('/').endsWith(c.path)) {
          warnings.push({ file: c.file, line: c.line, raw: c.raw,
            reason: `case differs on disk: cited "${c.path}", found "${real.split(sep).join('/').split('/markdown/').pop()}"` });
        }
      } catch { /* realpath can fail on odd filesystems; the existsSync above already passed */ }
    }
  }
  return {
    status: dead.length ? 'fail' : 'ok',
    checked: byOrigin.size,
    dead, areasMissing: [], warnings, allowMissing,
  };
}

/**
 * ARC-07-C31 — REQUIRED, because there are TWO callers. Both are in
 * `tools/snowarch/lib/docs/cli.mjs`, both print to a terminal, and a default would still have been
 * within a hair of the rule — which is exactly why the rule is a COUNT and not a judgement about
 * whether two callers feel like one consumer.
 */
export function formatResult(r, spell) {
  needSpell(spell, 'formatResult');
  const lines = [];
  if (r.status === 'missing') {
    lines.push(r.allowMissing
      ? 'citations: not verified until the corpus is present'
      : `corpus missing — run ${spell.bootstrap} --docs sparse (or ${spell.cli} docs sync)`);
    return { text: lines.join('\n'), code: r.allowMissing ? EXIT.ok : EXIT.missing };
  }
  for (const d of r.dead) {
    lines.push(`DEAD${d.member ? ' (brace member)' : ''} ${d.file}:${d.line} ${d.path}`);
  }
  for (const w of r.warnings) lines.push(`WARN ${w.file}:${w.line} ${w.reason}`);
  lines.push(`checked: ${r.checked} | dead: ${r.dead.length}`);
  return { text: lines.join('\n'), code: r.dead.length ? EXIT.dead : EXIT.ok };
}
