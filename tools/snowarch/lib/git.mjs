// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * The git questions this product asks, in one place, with one rule about failure.
 *
 * ARC-09-S04. Four callers wanted "which tag, which commit, is it dirty" and each would have
 * reached for `execFileSync('git', …)` with its own idea of what a non-zero exit means. S01 already
 * learned what that costs: its helper returned `''` for a failed command, so a `git status
 * --porcelain` that could not run read as a CLEAN TREE and a release proceeded on a repository git
 * itself could not describe. **A refusal to answer and an answer of "nothing" are different
 * values.** Here a failed command throws, and every caller that can live without an answer asks
 * for `{ allowFail: true }` and gets `null`.
 *
 * No shell, ever: on Windows `git` is `git.exe` and a shell would bring quoting rules with it. The
 * timeout is five seconds — long enough for a cold index on a slow disk, short enough that
 * `version` never hangs a terminal.
 */
import { execFileSync } from 'node:child_process';

import { childEnv } from './spawn-env.mjs';
import { which } from './which.mjs';

const TIMEOUT_MS = 5_000;

/** Resolved once per process: `which` walks PATH, and `version` asks several questions. */
let resolved;
function gitBinary({ env = process.env, platform = process.platform } = {}) {
  resolved ??= which('git', { env, platform }) ?? 'git';
  return resolved;
}

/** For tests that change PATH between cases — the cache is a performance detail, not a contract. */
export const resetGitBinary = () => { resolved = undefined; };

/**
 * Run git in `root`. Returns trimmed stdout, or `null` when the caller allowed a failure.
 *
 * `childEnv` rather than a bare `process.env`: every child of this product is told which checkout
 * it belongs to, and a git invoked with somebody else's `CLAUDE_PROJECT_DIR` is a git answering
 * about somebody else's repository.
 */
export function git(root, args, { allowFail = false, env = process.env, platform = process.platform } = {}) {
  try {
    return execFileSync(gitBinary({ env, platform }), args, {
      cwd: root,
      encoding: 'utf8',
      timeout: TIMEOUT_MS,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: childEnv(root, {}, env),
      maxBuffer: 16 * 1024 * 1024,
    }).trim();
  } catch (e) {
    if (allowFail) return null;
    const detail = String(e.stderr ?? '').split('\n')[0] || e.message;
    throw new Error(`git ${args.join(' ')} failed — ${detail}`);
  }
}

/**
 * The nearest `v*` tag and how far past it HEAD is.
 *
 * `--match 'v*'` matters and is not decoration: this repository carries `import/*` tags from the
 * two predecessor histories, and a `describe` without the filter would name one of those as the
 * release a user is on. `--long` so the format is the same whether or not HEAD is the tag itself —
 * a parser with two shapes is a parser that is wrong on one of them.
 *
 * `null` when no `v*` tag is reachable: a development checkout, or a `--depth 1` clone where the
 * tags were never fetched. Both are honest answers to "which release is this", and neither is an
 * error.
 */
export function describe(root, opts = {}) {
  const out = git(root, ['describe', '--tags', '--long', '--match', 'v*', '--abbrev=7'],
    { ...opts, allowFail: true });
  if (!out) return null;
  const m = /^(.*)-(\d+)-g([0-9a-f]+)$/.exec(out);
  if (!m) return null;
  return { name: m[1], distance: Number(m[2]), exact: Number(m[2]) === 0, short: m[3] };
}

/**
 * ARC-09-C154 — `v<version>` when that tag points at HEAD, in `describe`'s shape, or `null`. A second `v*` tag on the
 * same commit — a release's negative-test tag, fetched by an upgrade — is what `describe` named on 2.1.0, while the
 * integrity check used `v2.1.0`; the version of record decides which tag this checkout is. One `git` process, in place
 * of `describe` on a released checkout; a development version has no such tag and asks nothing.
 */
export function versionTag(root, version, opts = {}) {
  if (typeof version !== 'string' || version === '' || /-dev(\.\d+)?$/.test(version)) return null;
  const out = git(root, ['tag', '--points-at', 'HEAD'], { ...opts, allowFail: true });
  const want = `v${version}`;
  return String(out ?? '').split('\n').some((t) => t.trim() === want) ? { name: want, distance: 0, exact: true, short: null } : null;
}

/** A shallow clone cannot see its own history, and says so rather than reporting "no tag". */
export const isShallow = (root, opts = {}) =>
  git(root, ['rev-parse', '--is-shallow-repository'], { ...opts, allowFail: true }) === 'true';

/** The annotated tag's raw message, or `null` for a lightweight tag or no tag at all. */
export function tagMessage(root, name, opts = {}) {
  if (!name) return null;
  const type = git(root, ['cat-file', '-t', `refs/tags/${name}`], { ...opts, allowFail: true });
  if (type !== 'tag') return null;
  return git(root, ['cat-file', '-p', `refs/tags/${name}`], { ...opts, allowFail: true });
}

/** The submodule gitlink AS COMMITTED — not the checked-out HEAD, which is the doctor's question. */
export function gitlink(root, path, opts = {}) {
  const out = git(root, ['ls-tree', 'HEAD', path], { ...opts, allowFail: true });
  return /^\d+ commit ([0-9a-f]{40})\t/.exec(out ?? '')?.[1] ?? null;
}

/**
 * Where HEAD is and whether anything is uncommitted.
 *
 * `dirty` counts untracked files too: a report that called a tree clean while an extra file sat in
 * it would be describing a checkout nobody else can reproduce.
 */
export function branchState(root, opts = {}) {
  const sha = git(root, ['rev-parse', 'HEAD'], { ...opts, allowFail: true });
  if (!sha) return { sha: null, short: null, branch: null, detached: false, dirty: false };
  const named = git(root, ['rev-parse', '--abbrev-ref', 'HEAD'], { ...opts, allowFail: true });
  const detached = named === 'HEAD' || named === null;
  const porcelain = git(root, ['status', '--porcelain'], { ...opts, allowFail: true });
  return {
    sha,
    short: sha.slice(0, 7),
    branch: detached ? null : named,
    detached,
    dirty: porcelain === null ? false : porcelain !== '',
  };
}
