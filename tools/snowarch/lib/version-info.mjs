// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * Everything `./snowarch version` reports, as one object, from one place.
 *
 * ARC-09-S04. The doctor's report header used to read the version and the contract sha for itself,
 * which meant two programs answering "what is this checkout" from two readers — and the moment they
 * disagreed, `/snowarch status` would quote one of them and the tag would say the other. One
 * function now, called by the command and by the doctor.
 *
 * Every value comes from a FILE or from git, and never from a literal here: the version from the
 * root `package.json`, the floors and the docs pin from `engine.config.json`, the contract sha
 * computed over the built artefact and compared with the pin the contract loader reads. A hard-coded
 * floor in this file would be a second declaration of a number the bootstrap enforces, and the two
 * would part company.
 *
 * NO NETWORK. The old server's CLI fetched a registry record on every invocation and nagged about a
 * stranger's package; `version` is the command a person runs when something is wrong, and it must
 * work on a train.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { branchState, describe, gitlink, isShallow, tagMessage, versionTag } from './git.mjs';
import { loadConfig, version as readVersion } from './config.mjs';
import { parseTagMessage } from './release/tag.mjs';
import { spellings } from './launcher-spelling.mjs';

/** The corpus path is config's, not a literal — ARC-03 owns where the submodule lives. */
const DOCS_PATH = 'vendor/ServiceNowDocs';

/** The pin file the contract gate writes. Read through the same path the loader uses. */
function pinnedContract(root) {
  const p = join(root, 'packages/contract/required-tools.json');
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, 'utf8')).contractSha256 ?? null; } catch { return null; }
}

function builtContract(root) {
  const p = join(root, 'packages/snowarch/dist/contract.json');
  if (!existsSync(p)) return null;
  return createHash('sha256').update(readFileSync(p)).digest('hex');
}

/**
 * The facts, gathered. Pure enough to test: `git` is injected for the cases a fixture cannot make.
 *
 * Mismatches are REPORTED, not thrown: this is the command someone runs when they already suspect
 * something is wrong, and a crash tells them less than a line that names both values. The doctor is
 * what turns a mismatch into a FAIL.
 */
export function versionInfo(root, { env = process.env, platform = process.platform,
  full = true, config: given = null } = {}) {
  // ARC-09-C209 — the doctor passes the configuration it already read, unvalidated, because a key `loadConfig`
  // requires may be the very thing E-06 is about to report: thrown from here, it ended the doctor in a stack trace.
  // The `version` command passes nothing and keeps `loadConfig`'s refusal, which names the keys it misses.
  const config = given ?? loadConfig(root);
  const opts = { env, platform };

  const contractSha = builtContract(root);
  const contractPinned = pinnedContract(root);
  const docsPinConfig = config.docs?.pin ?? null;
  const link = gitlink(root, DOCS_PATH, opts);

  // `full: false` is the DOCTOR's call, and it is about spawns rather than tidiness. The header
  // takes `version`, `tag.name` and `contractSha`; the tag's MESSAGE, the shallow hint and the
  // commit state are for the human lines, and each costs a `git` process. The doctor is what the
  // SessionStart banner runs before a session's first word, and a process spawn on Windows is not
  // cheap: five of them took the banner's median from 910 ms to 1188 ms, then to 1010 ms against a
  // 1000 ms budget. Two remain on this path — `describe` and `ls-tree`. ARC-09-C154 keeps the count: on a released
  // checkout `v<version>` at HEAD answers in one process instead of `describe`, which is the fallback, unchanged; a
  // development version goes straight to `describe`, as before.
  const version = readVersion(root);
  const found = versionTag(root, version, opts) ?? describe(root, opts);
  const raw = found && full ? tagMessage(root, found.name, opts) : null;
  const parsed = raw ? parseTagMessage(raw) : null;

  return {
    // ── ARC-06-S02's five keys, unchanged in name and type ──────────────────────────────────
    version,
    contractSha,
    docsPin: docsPinConfig,
    docsFamily: config.docs?.family ?? null,
    floors: config.floors ?? {},

    // ── what ARC-09-S04 adds, beside them ───────────────────────────────────────────────────
    tag: found
      ? {
        name: found.name,
        distance: found.distance,
        exact: found.exact,
        message: parsed
          ? { contract: parsed.contract ?? null, docsPin: parsed.docsPin ?? null, floors: parsed.floors }
          : null,
      }
      : null,
    // A shallow clone has no tags to describe; saying "no release tag" without saying why sends a
    // reader looking for a bug in the product.
    shallow: found ? false : (full ? isShallow(root, opts) : false),
    // `git status --porcelain` walks the WORKING TREE, and this one has 35,000 corpus files in it:
    // 300 ms on a warm index, more on a cold one. The command asks; the header does not.
    commit: full ? branchState(root, opts) : null,
    contractPinned,
    contractMatches: Boolean(contractSha && contractPinned && contractSha === contractPinned),
    docsPinConfig,
    docsPinGitlink: link,
    docsPinMatches: Boolean(link && docsPinConfig && link === docsPinConfig),
  };
}

/** `2.1.214` → `Claude Code ≥ 2.1.214`, in the order the config declares them. */
export const floorLine = (floors) => Object.entries(floors)
  .map(([k, v]) => `${k === 'claudeCode' ? 'claude' : k} ≥ ${v}`).join(' · ');

/**
 * The six lines — SEVEN on a tagged checkout, where a seventh compares the tag's message with the
 * tree (ARC-09-C17b: the count is part of what distinguishes the two shapes, and a test and two CI
 * steps had "six" written into them).
 *
 * Line 1 is ARC-06-S02's, byte for byte — four programs quote it and a test pins it.
 */
  // ARC-07-C31 — A DEFAULT IS ALLOWED HERE BECAUSE THERE IS EXACTLY ONE CALLER, NAMED: `tools/snowarch/lib/cli.mjs:82`, the `version` command.
  // The rule this row settled is that a default needs literally one caller and a comment saying
  // which; everything else takes the spelling required. `loadState` is why the rule is that
  // narrow — it had ten callers and seven held a ctx, and a default would have handed each the
  // process.
export function renderVersion(info, spell = spellings()) {
  const lines = [];

  const floors = Object.entries(info.floors)
    .map(([k, v]) => `${k === 'claudeCode' ? 'Claude Code' : k} ≥ ${v}`).join(', ');
  lines.push(`snowarch ${info.version} · contract ${info.contractSha ? info.contractSha.slice(0, 12) : 'not built'} · `
    + `docs pin ${info.docsPin.slice(0, 7)} (${info.docsFamily}) · floors: ${floors}`);

  // tag:
  if (!info.tag) {
    lines.push(info.shallow
      ? 'tag:        none (shallow clone — tags unreachable; git fetch --tags --unshallow)'
      : 'tag:        none (no release tag reachable — development checkout)');
  } else if (info.tag.exact) {
    lines.push(`tag:        ${info.tag.name} (exact)`);
  } else {
    const n = info.tag.distance;
    lines.push(`tag:        ${info.tag.name}+${n} (${n} commit${n === 1 ? '' : 's'} past ${info.tag.name})`);
  }

  // commit: — always present for the command, which asks for the state; `null` only for the
  // doctor's header, which does not render lines.
  const c = info.commit ?? { short: null, branch: null, detached: false, dirty: false };
  const where = c.detached ? 'detached' : (c.branch ?? 'unknown');
  lines.push(`commit:     ${c.short ?? 'unknown'} (${where}, ${c.dirty ? 'dirty' : 'clean'})`);

  // contract:
  if (!info.contractSha) {
    lines.push('contract:   missing — packages/snowarch/dist/contract.json is not built');
  } else {
    const verdict = info.contractMatches
      ? 'matches engine pin'
      : 'DOES NOT match engine pin (run npm run contract)';
    lines.push(`contract:   sha256:${info.contractSha.slice(0, 4)}…${info.contractSha.slice(-4)}  `
      + `packages/snowarch/dist/contract.json — ${verdict}`);
  }

  // docs-pin:
  const pinVerdict = info.docsPinMatches
    ? 'gitlink matches engine.config.json'
    : `gitlink ${info.docsPinGitlink ? `${info.docsPinGitlink.slice(0, 7)} ` : ''}`
      + `≠ engine.config.json (run ${spell.cli} docs verify)`;
  lines.push(`docs-pin:   ${info.docsPin.slice(0, 7)} (${info.docsFamily}) — ${pinVerdict}`);

  // floors:
  lines.push(`floors:     ${floorLine(info.floors)}`);

  // The tag's own record, when there is one — and whether this checkout is still that release.
  if (info.tag?.message?.contract) {
    const m = info.tag.message;
    const differs = (m.contract && m.contract !== info.contractSha)
      || (m.docsPin && m.docsPin !== info.docsPinGitlink);
    lines.push(`tag says:   contract ${m.contract.slice(0, 4)}…${m.contract.slice(-4)} · `
      + `docs-pin ${(m.docsPin ?? '').slice(0, 7)}${differs ? ' (differs — checkout is not the release)' : ''}`);
  }

  return lines;
}
