// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * What each bootstrap step depends on, in one table — and therefore what makes it stale.
 *
 * ARC-09-S05. The resume rule is simple and load-bearing: a step whose inputs have not changed
 * since it last succeeded is skipped. Everything hard about it is the word "inputs", and until now
 * each step answered that question in its own file, which meant ten answers, ten places to get one
 * wrong, and no way to show a user the set.
 *
 * One table now. A row says which committed inputs a step reads, in which order, and WHY — the
 * why is the part a reader needs, because the interesting decisions here are the things
 * deliberately NOT hashed:
 *
 *   **The corpus is hashed by its GITLINK, not its contents.** 35,000 files read to decide whether
 *   to skip a step, and an unrelated `touch` would invalidate it. The gitlink changes exactly when
 *   the corpus is meant to be different.
 *
 *   **The store is hashed by mtime and size, never by content.** Credentials are never hashed,
 *   read or rewritten by any step other than the wizard and the migration. AC 2 is the proof: edit
 *   a password in place, same length, restore the mtime, and every step stays fresh — because
 *   nothing looked.
 *
 *   **`dist/` is hashed as bytes**, because a contract that changed is a server that behaves
 *   differently, and that is exactly when B05 and B08 must run again.
 *
 * Determinism across platforms is the other requirement, and it is why files are hashed as BYTES
 * with no line-ending normalisation: `.gitattributes` keeps every hashed file LF in every checkout,
 * and a test asserts that the hashed set is covered by it. A file that arrived CRLF on Windows
 * would hash differently there, and AC 4 — the same commit hashing the same on three OSes — would
 * be false in a way nobody would notice until a resume misbehaved on one platform.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { contractSha } from './config.mjs';
import { gitlink as headGitlink } from './git.mjs';
import { ABSENT, FILE, TEXT, hashInputs } from './steps/inputs.mjs';

export { ABSENT, FILE, TEXT, hashInputs };

/** The four kinds a row may name. The kind is what the rendered table shows a reader. */
export const KINDS = Object.freeze(['file', 'gitlink', 'json-path', 'literal']);

/** Where the corpus lives, and where the store lives. Neither is spelled twice below. */
const CORPUS = 'vendor/ServiceNowDocs';
const STORE = '.local/instances.json';

/**
 * The corpus gitlink, from HEAD.
 *
 * From HEAD and not the working tree, because the gitlink is a COMMITTED input: a submodule
 * somebody moved locally without committing is a dirty checkout, not a different corpus, and
 * `git status` is B00's business rather than this table's.
 *
 * ARC-09-S04's `lib/git.mjs` is the seam — one place that spawns git, where a failed command
 * throws rather than coming back as an empty answer. `ABSENT` when there is no gitlink at all,
 * which is a state (no submodule) rather than a failure.
 */
const gitlinkOf = (root) => headGitlink(root, CORPUS) ?? ABSENT;

/**
 * The store's shape — never its content. `mtime+size` is the whole of what is read.
 *
 * Truncated to the SECOND, which is a deliberate coarsening and the granularity every tool that
 * restores an mtime actually preserves. `mtimeMs` carries a sub-millisecond fraction on APFS and
 * ext4; `utimesSync` takes a Date and ROUNDS it, `cp -p` and tar keep whole seconds, and Windows
 * 100 ns ticks do not survive the round trip either. A finer stamp would call a restored backup
 * "changed" and re-run B08 every time somebody restored one.
 *
 * What it costs is two writes of the SAME byte length inside one second — which for this file is
 * the wizard rewriting a credential in place, and re-running the doctor over that is precisely the
 * behaviour this row exists to avoid. The cost is a doctor report one run stale; the cost the other
 * way is reading credentials to decide whether to read credentials.
 */
export function storeStamp(root) {
  const p = join(root, STORE);
  if (!existsSync(p)) return 'none';
  const s = statSync(p);
  return `${Math.floor(s.mtimeMs / 1000)}:${s.size}`;
}

/** The schema version THIS BUILD reads, from the contract `dist/` ships. */
export function storeSchemaVersion(root) {
  const p = join(root, 'packages', 'snowarch', 'dist', 'contract.json');
  if (!existsSync(p)) return 'not-built';
  try {
    const v = JSON.parse(readFileSync(p, 'utf8'))?.storeSchemaVersion;
    return Number.isInteger(v) ? String(v) : 'unknown';
  } catch { return 'unreadable'; }
}

/** The store's declared schema version, which is a shape question, not a credential one. */
export function storeVersion(root) {
  const p = join(root, STORE);
  if (!existsSync(p)) return 'none';
  // The VERSION field only. Parsing the file is not reading its credentials, and the parse is
  // wrapped because a store somebody hand-edited into invalid JSON is a state, not a crash.
  try { return String(JSON.parse(readFileSync(p, 'utf8'))?.version ?? 'unknown'); }
  catch { return 'unreadable'; }
}

/**
 * One row per step.
 *
 * `inputs` is the DECLARATION — what the row depends on, for the reader and for the generated
 * table. `resolve(ctx)` turns it into the tagged strings `hashInputs` understands, which is the one
 * hashing implementation in the product.
 */
export const INPUTS = Object.freeze({
  B00: {
    step: 'B00',
    title: 'preflight',
    inputs: [],
    why: 'Asks the MACHINE — git, Node, Claude Code, disk — and a machine is not a committed input. '
      + 'It runs every time, which is why a second run on an unchanged checkout still runs it.',
    resolve: () => [],
  },

  B01: {
    step: 'B01',
    title: 'workspace and registration files',
    inputs: [
      { kind: 'file', ref: '.mcp.json', why: 'the server registration this checkout ships' },
      { kind: 'file', ref: '.claude/settings.json', why: 'the committed permissions' },
      { kind: 'literal', ref: 'mode', why: 'design-only and live write different toggles' },
    ],
    why: 'ALSO RUNS WHEN ITS OUTPUT IS GONE (ARC-09-C140): on a release tree, when `.local/release-manifest.json` holds '
      + 'no signed manifest that verifies and is this release\'s, B01 runs and fetches it, whatever its inputs say. '
      + 'The cache is what B01 writes, so it is not hashed here: a hash taken before the fetch would differ from the '
      + 'one after it, and B01 would run again on the next bootstrap.',
    resolve: (ctx) => [FILE('.mcp.json'), FILE('.claude/settings.json'), TEXT(`mode=${ctx.mode}`)],
  },

  B02: {
    step: 'B02',
    title: 'the documentation corpus',
    inputs: [
      { kind: 'file', ref: '<config.docs.areasFile>', why: 'which areas the sparse checkout takes' },
      { kind: 'gitlink', ref: 'vendor/ServiceNowDocs', why: 'the pinned commit — NOT the 35,000 files' },
      { kind: 'literal', ref: 'docs', why: 'sparse, full or skip' },
    ],
    resolve: (ctx) => [
      FILE(ctx.config.docs.areasFile),
      TEXT(`gitlink=${gitlinkOf(ctx.root)}`),
      TEXT(`docs=${ctx.docs}`),
    ],
  },

  B03: {
    step: 'B03',
    title: 'the mode toggle',
    inputs: [{ kind: 'literal', ref: 'mode', why: 'the only thing this step writes' }],
    resolve: (ctx) => [TEXT(`mode=${ctx.mode}`)],
  },

  B04: {
    step: 'B04',
    title: 'runtime dependencies',
    inputs: [
      { kind: 'file', ref: 'package-lock.json', why: 'the exact tree npm would install' },
      { kind: 'literal', ref: 'node major', why: 'a different major is a different install' },
    ],
    resolve: (ctx) => [FILE('package-lock.json'), TEXT(`node=${ctx.node.major ?? 'none'}`)],
  },

  B05: {
    step: 'B05',
    title: 'the contract',
    inputs: [
      { kind: 'file', ref: 'packages/snowarch/dist/contract.json', why: 'bytes — a changed contract is a changed server' },
      { kind: 'file', ref: 'packages/contract/required-tools.json', why: 'the pin it is checked against' },
    ],
    resolve: () => [
      FILE('packages/snowarch/dist/contract.json'),
      FILE('packages/contract/required-tools.json'),
    ],
  },

  B06: {
    step: 'B06',
    title: 'the instance store',
    inputs: [
      { kind: 'json-path', ref: '.local/instances.json#version', why: 'the schema, which decides whether a migration is due' },
      { kind: 'literal', ref: 'store present', why: 'absent and empty are different states' },
      { kind: 'literal', ref: 'instance file given', why: 'an `--instance-file` run writes an entry' },
      { kind: 'literal', ref: 'mode', why: 'design-only never touches the store' },
      { kind: 'json-path', ref: 'packages/snowarch/dist/contract.json#storeSchemaVersion', why: 'the schema this build reads — a release that changes it makes exactly this step stale' },
    ],
    why: 'MIGRATE, DON\'T RE-WIZARD: a store whose schema is behind makes this step stale so the '
      + 'migration runs — and a store whose CONTENTS changed does not, because re-running the '
      + 'wizard over somebody\'s credentials is never the right answer to "something moved".',
    resolve: (ctx) => [
      TEXT(`storeVersion=${storeVersion(ctx.root)}`),
      TEXT(`storePresent=${existsSync(join(ctx.root, STORE)) ? 'yes' : 'no'}`),
      TEXT(`instanceFile=${ctx.instanceFile ? 'yes' : 'no'}`),
      TEXT(`mode=${ctx.mode}`),
      // ARC-09-S06: the real number, from the contract. A release that changes the store's shape
      // moves this one value, which makes exactly B06 stale — and B06's answer to being stale is
      // the MIGRATION, not the wizard. `not-built` is a state (design-only before B04), not a
      // failure, and it hashes as itself so a built checkout and an unbuilt one differ.
      TEXT(`storeSchemaVersion=${storeSchemaVersion(ctx.root)}`),
    ],
  },

  B07: {
    step: 'B07',
    title: 'the local toggles',
    inputs: [
      { kind: 'literal', ref: 'mode', why: 'which server list the toggle goes in' },
      { kind: 'literal', ref: 'node present', why: 'no Node means the hook is disabled' },
      { kind: 'literal', ref: 'hooks disabled', why: 'S-05: the launcher may have turned them off' },
      { kind: 'literal', ref: 'registration', why: 'project or user changes what is written' },
    ],
    resolve: (ctx) => [
      TEXT(`mode=${ctx.mode}`),
      TEXT(`node=${ctx.node.present ? 'yes' : 'no'}`),
      TEXT(`hooks=${ctx.state.hooksDisabledByBootstrap ? 'disabled' : 'default'}`),
      TEXT(`registration=${ctx.state.registration}`),
    ],
  },

  B08: {
    step: 'B08',
    title: 'the doctor',
    inputs: [
      { kind: 'file', ref: 'packages/snowarch/dist/contract.json', why: 'by sha — a different server answers differently' },
      { kind: 'literal', ref: 'store mtime+size', why: 'NEVER the content: see the credential rule above' },
      { kind: 'literal', ref: 'mode', why: 'design-only skips the server section' },
    ],
    why: 'B08 calls the doctor (ARC-08-S05). This row answers "must the bootstrap run it again"; '
      + 'the doctor CACHE answers "may the banner reuse the last report" (`cacheStale()`, seven '
      + 'mtimes). Two mechanisms for two consumers — do not merge them.',
    resolve: (ctx) => [
      TEXT(`contract=${contractSha(ctx.root) ?? 'not-built'}`),
      TEXT(`storeMtime=${storeStamp(ctx.root)}`),
      TEXT(`mode=${ctx.mode}`),
    ],
  },

  B09: {
    step: 'B09',
    title: 'the summary',
    inputs: [],
    why: 'Prints what the run did. It has no inputs to be stale against and runs every time, '
      + 'which is the other half of "a second run does only B00 and B09".',
    resolve: () => [],
  },
});

/** The steps, in the order they run — the order the table renders in. */
export const STEP_IDS = Object.freeze(Object.keys(INPUTS));

/**
 * Does this step run whatever happens?
 *
 * A row with no inputs has nothing to be stale against — B00 asks the machine, B09 prints what the
 * run did — so `staleSteps()` leaves them out and the runner marks them `cacheable = false`. Two
 * spellings of one fact, and this is the one the table owns.
 */
export const alwaysRuns = (step) => (INPUTS[step]?.inputs.length ?? 0) === 0;

/** A step's hash, from the table. The row is the only declaration of what it depends on. */
export function hashFor(step, ctx) {
  const row = INPUTS[step];
  if (!row) throw new Error(`inputs: no table row for ${step}`);
  return hashInputs(ctx.root, row.resolve(ctx));
}
