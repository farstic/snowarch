// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-08-S02 — E-17, E-18: the roster, counted from the directory and linted by ARC-02-S02's rules.
//
// Five documents used to disagree about how many skills there are (`00` §3.8, P-12), and every one
// of those numbers was written by hand and true when written. So neither check here counts
// anything itself: E-17 calls `tools/snowarch/lib/roster.mjs` — the listing `scripts/gen-roster.mjs`
// renders into `docs/ARCHITECTURE.md` — and E-18 calls the `lintSkills`/`lintAgents` rules whose
// ids CI already quotes. A doctor with its own opinion of the roster would be a sixth document.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { collectRoster, RosterError } from '../../roster.mjs';
import { lintAgents, lintSkills } from '../../lint-rules.mjs';
import { isEngineeringCheckout } from '../../engineering-checkout.mjs';
import { defineCheck } from '../registry.mjs';

import { fail, ok } from './result.mjs';

const json = (root, rel) => JSON.parse(readFileSync(join(root, rel), 'utf8'));

/**
 * The allow-lists CI passes to the same rules, read from the same fixtures.
 *
 * Absent files mean empty allow-lists rather than a crash: a user's checkout is complete, but a
 * doctor that died over a missing fixture would be failing on its own scaffolding.
 */
export function lintOptions(root, config) {
  const safe = (rel, fallback) => { try { return json(root, rel); } catch { return fallback; } };
  const allow = safe('tools/snowarch/lib/lint-data/skills-lint-allowlist.json', { length: [], version: [] });
  const builtins = safe('tools/snowarch/lib/lint-data/claude-builtin-commands.json', { commands: [] });
  return {
    root,
    lengthAllow: new Set(allow.length ?? []),
    versionAllow: new Set(allow.version ?? []),
    builtins: new Set(builtins.commands ?? []),
    roster: config?.roster?.skills ?? null,
    utility: new Set(config?.roster?.utility ?? []),
  };
}

export function engineRosterChecks() {
  return [
    defineCheck({
      id: 'E-17',
      section: 'roster',
      title: 'roster from directory listing',
      severity: 'fail',
      quick: true,
      network: false,
      // The listing is a library call, not a subprocess: `scripts/gen-roster.mjs --json` prints
      // exactly this object, and spawning it to read the print-out would cost a process for the
      // same answer — and put E-17 outside `--quick`, where the story's own table puts it.
      spawns: false,
      fixable: false,
      run: async (ctx) => {
        let roster;
        try {
          roster = collectRoster(ctx.root);
        } catch (e) {
          if (e instanceof RosterError) {
            return fail(e.message.split('\n')[0], {
              remedy: 'restore with `git checkout -- .claude/`',
              command: 'git checkout -- .claude/',
              data: { problems: [e.message] },
            });
          }
          throw e;
        }
        const utility = [...roster.utility];
        const missingUtility = utility.filter((u) => !roster.skills.some((s) => s.dir === u));
        const problems = [...roster.problems,
          ...missingUtility.map((u) => `utility skill "${u}" is not in .claude/skills`)];
        const data = {
          skills: roster.rosterSkills.length,
          agents: roster.agents.length,
          utility,
          declared: { skills: roster.declared.skills ?? null, agents: roster.declared.agents ?? null },
          problems,
        };
        return problems.length === 0
          ? ok(`${roster.rosterSkills.length} skills · ${roster.agents.length} sub-agents`
            + `${utility.length ? ` · ${utility.length} utility` : ''}`, data)
          : fail(problems.join('; '), {
            remedy: 'restore with `git checkout -- .claude/`, or update engine.config.json.roster '
              + 'if the change is intended',
            data,
          });
      },
    }),

    defineCheck({
      id: 'E-18',
      section: 'roster',
      title: 'skill descriptions',
      severity: 'fail',
      quick: true,
      network: false,
      spawns: false,
      fixable: false,
      // ARC-02-S02's rules, run rather than re-stated: every failure string already begins with
      // its rule id (`SK-04 .claude/skills/x/SKILL.md: move version under metadata.version`), so
      // the doctor quotes CI's own sentence and a reader can search for the id.
      run: async (ctx) => {
        const skills = lintSkills(lintOptions(ctx.root, ctx.config));
        // `enforceS04: true` is what `tests/agents-lint.test.mjs` passes — ARC-02-S04 made
        // `model: inherit` and the `skills:` preload required, and a doctor that checked the
        // pre-S04 rules would clear an agent CI rejects.
        const agents = lintAgents({ root: ctx.root, enforceS04: true });
        const problems = [...skills, ...agents.fail];
        const data = { skills: problems.filter((p) => p.startsWith('SK')).length,
          agents: problems.filter((p) => p.startsWith('AG')).length,
          files: agents.files, problems: problems.slice(0, 10) };
        return problems.length === 0
          ? ok(`${lintOptions(ctx.root, ctx.config).roster ?? '—'} skills · ${agents.files} agents clean`,
            data)
          : fail(problems.slice(0, 10).join('; '), {
            // ARC-09-C185a: the lint's own tests are in the engineering checkout; an install corrects what it read.
            remedy: isEngineeringCheckout(ctx.root)
              ? 'run `node --test tests/skills-lint.test.mjs tests/agents-lint.test.mjs` for the full report'
              : 'correct what the findings name: each begins with its rule id and its file',
            data,
          });
      },
    }),
  ];
}
