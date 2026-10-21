// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * The roster, read from the directory listing — ONE implementation, two readers.
 *
 * `scripts/gen-roster.mjs` renders it into `docs/ARCHITECTURE.md` and fails CI when the committed
 * block is stale; the doctor's E-17/E-18 report the same listing as check results (ARC-08-S02).
 * Before this file the generator held the listing and the doctor would have had to re-read
 * `.claude/skills` and `.claude/agents` itself — and a second reading of a directory is a second
 * definition of the roster, which is the defect ARC-02-S07 exists to close (P-12). So the reading
 * lives here, the two callers differ only in what they do with the result, and neither can drift.
 *
 * A problem here THROWS rather than exiting: the generator turns it into its `exit 2` sentence and
 * the doctor turns it into a FAIL line. A `process.exit` in a library would take the doctor's whole
 * report down over one unreadable skill file — the opposite of what a diagnostic is for.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { parseFrontmatter } from '../../../packages/contract/lib/frontmatter.mjs';

/**
 * Frontmatter that does not parse is a roster problem, not a crash.
 *
 * `parseFrontmatter` throws its own error type. Left alone it escapes both callers — the generator
 * would print a stack instead of its `gen-roster:` sentence, and the doctor's E-17 would become
 * "check crashed" with no file named. Wrapped, both say which file and why.
 */
const frontmatterOf = (text, rel) => {
  try {
    return parseFrontmatter(text, rel);
  } catch (e) {
    throw new RosterError(`${rel}: ${e.message}`);
  }
};

/** Raised for anything that makes the listing unreadable. The caller decides the exit code. */
export class RosterError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RosterError';
  }
}

/**
 * Skills that are reference knowledge rather than a roster persona.
 *
 * Declared here AND derivable from the skill's `**Fires:**` line, and the collection fails if the
 * two disagree. One declaration would be enough to print the summary line; two that must agree is
 * what stops a reworded Fires line from silently turning the companion into an ordinary on-demand
 * skill and moving the persona count. Same idiom as the server key's four declarations (L07).
 */
export const REFERENCE_SKILLS = new Set(['now-assist-genai']);

/**
 * How a skill's `**Fires:**` prose maps to the roster's six classifications.
 *
 * Ordered: the first match wins, because several lines say two true things. `atf-author` fires
 * post-build "and on demand" — post-build is the one that puts it in the protocol, so it is
 * checked first. A line that matches nothing is a hard failure (below), never `unknown`: an
 * unclassifiable skill is a skill whose triggers nobody can look up, and printing a placeholder
 * would put that in a published table.
 */
export const FIRES_RULES = [
  ['gateway', /Phase 1 Step 5/i],
  ['reference', /to ground the/i],
  ['post-build consult', /post-build per taxonomy/i],
  ['routing-time consult', /routing-time consult|§3\.1/i],
  ['builder', /On dispatch from the Chief Architect/i],
  ['on demand', /on demand|upstream of the whole routing protocol/i],
];

const posix = (p) => p.split('\\').join('/');
const lf = (s) => s.replace(/\r\n/g, '\n');

function read(root, rel) {
  const p = join(root, rel);
  if (!existsSync(p)) throw new RosterError(`${posix(rel)} is missing`);
  return readFileSync(p, 'utf8');
}

function classify(firesLine, rel) {
  for (const [label, re] of FIRES_RULES) if (re.test(firesLine)) return label;
  throw new RosterError(`${posix(rel)}: the **Fires:** line matches no classification — `
    + `${JSON.stringify(firesLine)}.\n`
    + '  Add a rule to FIRES_RULES, or word the line like the others. It is never guessed.');
}

export function collectSkills(root) {
  const dir = join(root, '.claude', 'skills');
  if (!existsSync(dir)) throw new RosterError('.claude/skills is missing');
  const names = readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory()).map((e) => e.name).sort();
  return names.map((name) => {
    const rel = `.claude/skills/${name}/SKILL.md`;
    const text = lf(read(root, rel));
    const { data } = frontmatterOf(text, rel);
    const fires = text.split('\n').find((l) => l.startsWith('**Fires:**'));
    // S03 made `## Triggers` the first H2 with all three fields; a missing line is that
    // contract broken, and the collection says so rather than papering over it.
    if (!fires) throw new RosterError(`${posix(rel)}: no "**Fires:**" line — S03 requires one in ## Triggers`);
    const firesAs = classify(fires.replace('**Fires:**', '').trim(), rel);
    const declaredReference = REFERENCE_SKILLS.has(name);
    if (declaredReference !== (firesAs === 'reference')) {
      throw new RosterError(`${posix(rel)}: classified "${firesAs}" from its **Fires:** line, but `
        + `REFERENCE_SKILLS ${declaredReference ? 'lists' : 'does not list'} it. The two `
        + 'declarations must agree — reword the line or change the set, deliberately.');
    }
    return {
      name: data.name ?? name,
      dir: name,
      description: data.description ?? '',
      version: data.metadata?.version ?? '',
      firesAs,
      isReference: declaredReference,
    };
  });
}

export function collectAgents(root) {
  const dir = join(root, '.claude', 'agents');
  if (!existsSync(dir)) throw new RosterError('.claude/agents is missing');
  const files = readdirSync(dir).filter((f) => f.endsWith('.md')).sort();
  return files.map((file) => {
    const rel = `.claude/agents/${file}`;
    const { data } = frontmatterOf(lf(read(root, rel)), rel);
    const skills = Array.isArray(data.skills) ? data.skills : [data.skills].filter(Boolean);
    return { name: data.name ?? file.replace(/\.md$/, ''), description: data.description ?? '', skills };
  });
}

/**
 * Everything `--json` prints, which is everything E-17 reports.
 *
 * `problems` is the same list `--check` prints: a count that disagrees with the `roster` block of
 * `engine.config.json`, an agent preloading a skill that does not exist, and an agent that
 * does not preload its own persona. The doctor turns a non-empty list into a FAIL; the generator
 * exits 1 on it.
 */
export function collectRoster(root) {
  const config = JSON.parse(read(root, 'engine.config.json'));
  const declared = config.roster ?? {};
  const utility = new Set(declared.utility ?? []);

  const skills = collectSkills(root);
  const agents = collectAgents(root);

  const problems = [];
  const rosterSkills = skills.filter((s) => !utility.has(s.dir));
  if (declared.skills !== undefined && declared.skills !== rosterSkills.length) {
    problems.push(`\`roster.skills\` ${declared.skills} ≠ ${rosterSkills.length} found`);
  }
  if (declared.agents !== undefined && declared.agents !== agents.length) {
    problems.push(`\`roster.agents\` ${declared.agents} ≠ ${agents.length} found`);
  }
  const known = new Set(skills.map((s) => s.name));
  for (const a of agents) {
    for (const s of a.skills) {
      if (!known.has(s)) problems.push(`.claude/agents/${a.name}.md preloads "${s}", which is not a skill`);
    }
    // AG-05: the persona arrives through frontmatter. An agent that does not preload the skill of
    // its own name has no persona, and the "Sub-agent" column would then be claiming one.
    if (!a.skills.includes(a.name)) {
      problems.push(`.claude/agents/${a.name}.md does not preload its own persona skill "${a.name}"`);
    }
  }

  return { skills, agents, utility, declared, rosterSkills, problems };
}
