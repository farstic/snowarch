// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * `./snowarch upgrade` — seven numbered steps, and nothing happens before the sixth line.
 *
 * ARC-09-S07. An upgrade is the moment a user is most entitled to know what is about to happen to
 * their checkout, and least able to check afterwards: by the time something is wrong the tree has
 * moved. So the plan is computed BEFORE the tree is touched — which files changed between HEAD and
 * the tag, which bootstrap steps that makes stale, whether the store's schema moves, whether the
 * installed Claude Code still clears the tag's floor — and printed as one block with a `[Y/n]`
 * under it. Everything up to that point is reads.
 *
 * Three promises hold whatever happens after it:
 *
 *   **Credentials are never read or written by this command.** `.local/instances.json` is opened by
 *   exactly one thing in an upgrade: S06's migration, in B06, when the release changes the store's
 *   schema — announced in the plan, with its 0600 backup, before the user says yes.
 *
 *   **A failure leaves the tree at the new tag with the state file saying which step stopped.**
 *   Re-running finishes the job; that is the resume rule (S05), not a special path here.
 *
 *   **The banner never fetches.** This command writes `.local/upgrade-check.json`; the SessionStart
 *   hook reads it. A banner that could fetch would be a banner that could hang a session start.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';

import { CACHE_FILE } from '../doctor-cache.mjs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { localDir, storePath } from '../local-paths.mjs';

import { EXIT_FAIL, EXIT_OK, EXIT_PREREQ, EXIT_USAGE } from '../exit.mjs';
import { branchState, describe, git, isShallow, versionTag } from '../git.mjs';
import { askOnce, isYes } from '../ask.mjs';
import { childEnv, NO_PROMPT_ENV } from '../spawn-env.mjs';
import { loadConfig, root as defaultRoot, version as readVersion } from '../config.mjs';
import { loadState, notHereReason, recordedHere } from '../state.mjs';
// ARC-08-C29 — the runner's own step list, so the plan and the run are one computation.
import { STEPS, outputMissingOf } from '../steps/index.mjs';
import { checkGit, checkNode, makeExec } from '../steps/B00.mjs';
import { nodeInfo, stepContext } from '../bootstrap.mjs';
import { engineChecks } from '../doctor/checks/index.mjs';
import { nonOkLines } from '../doctor/panel.mjs';
import { formatVersion, meetsFloor } from '../versions.mjs';
import { writeUpgradeCheck } from '../upgrade-check.mjs';
import { manifestSays, refreshManifest, refreshWithUpgrade } from '../licence/fetch.mjs';
import { DISTRIBUTION_FROM, MANIFESTS_FROM, archiveDiffers, checkTree, signedRelease, writeManifestCache }
  from '../licence/manifest.mjs';
import { hashFor, INPUTS, STEP_IDS } from '../inputs.mjs';

/**
 * What U7 says about a doctor report — the tally AND the checks it counted, as one list.
 *
 * ARC-09-C46. U7 printed `DOCTOR: 31 ok, 3 warn, 1 fail (4 skip)` and stopped, so the owner's rc.5
 * upgrade told them a check had failed and not which one; they ran `./snowarch doctor` again to
 * learn it was E-27. The lines were already in `report` and were thrown away with it. That is
 * ARC-08-C3's defect one command over — "a count is what you write when you have the list and do
 * not print it" — and B09 fixed it for the bootstrap, which is why the renderer is imported rather
 * than written a second time.
 *
 * A FUNCTION, and the tally is inside it, because the defect was that the two were separable: a
 * caller could print the number and skip the list, and for one release that is exactly what it did.
 * Now there is nothing to skip — the count and what it counted are one return value.
 *
 * WARNINGS TOO, not only failures, which is wider than the brief and deliberately so. The next row
 * on this list is about an E-28 WARN printed by this very step whose wording cannot now be
 * recovered, because the tally was all that reached the transcript. A run of this command is
 * evidence about a warning as often as about a failure.
 */
export function doctorLines(report, checks = null) {
  if (!report?.summary) return [];
  const { ok = 0, warn = 0, fail = 0, skip = 0 } = report.summary;
  // THE TALLY AND THE WORDS COME FROM DIFFERENT PLACES (ARC-09-C56). The tally is a count and
  // carries no label, so it stays with the run that measured it; taking it from `checks` would be
  // taking a different run's arithmetic. The words are this terminal's, when we have that copy.
  const source = checks ? { checks } : report;
  return [`DOCTOR: ${ok} ok, ${warn} warn, ${fail} fail (${skip} skip)`, ...nonOkLines(source)];
}

/**
 * The doctor cache, but only if THIS RUN wrote it — otherwise `null`.
 *
 * Read from `.local/doctor-last.json`, which `doctor/index.mjs` writes from the unmasked report —
 * the `--json` on stdout is masked at the boundary for a different audience.
 *
 * ONE DEFINITION OF FRESHNESS. Both readers below are about the same file, the same run and the
 * same question, so the age test lives here once. A second freshness rule beside this one is how
 * two readers of one cache drift into disagreeing about which run they are describing.
 */
function readCacheThisRun(root, { read = readFileSync, notBefore = null } = {}) {
  try {
    const cache = JSON.parse(read(join(root, CACHE_FILE), 'utf8'));
    // WHICH RUN WROTE IT. Every bootstrapped tree has a cache from an earlier doctor, so a read with
    // no notion of when would hand back yesterday's answer — tally and all — as this run's.
    // `>=` and not `>`: the doctor stamps the cache from its own clock, and a run fast enough to
    // land on the start instant is this run, not a stale one.
    if (notBefore !== null) {
      const at = Date.parse(cache?.at ?? '');
      if (!Number.isFinite(at) || at < notBefore) return null;
    }
    return cache;
  } catch { return null; }
}

/**
 * The Mode line the doctor wrote for THIS MACHINE, or `null`.
 *
 * Returns `null` on any unreadable or shapeless cache: a caller that prints nothing is honest, and
 * one that falls back to the masked line prints `<label>` as though it were the instance's name.
 */
export function readCachedModeLine(root, { read = readFileSync, notBefore = null } = {}) {
  const line = readCacheThisRun(root, { read, notBefore })?.modeLine;
  return typeof line === 'string' && line.length > 0 ? line : null;
}

/**
 * The non-ok checks the doctor cached for THIS MACHINE, titled, or `null` (ARC-09-C56).
 *
 * The cache stores `{id, status, detail, remedy?}` and DROPS `title`, so the title is resolved by
 * id from the registry that owns it. A copy of the titles kept beside the registry would be the
 * second copy of a sentence this repository keeps removing.
 *
 * There IS a titled copy in the cache — `payload.report` mirrors the whole stored report — but it
 * is not in `COMPATIBILITY_KEYS`, which pins `checks` and not `report`. Reading the mirror would
 * build a user-facing line on a key nothing promises to keep.
 *
 * An id the registry cannot name is left WITHOUT a title, and `nonOkLines` is what omits it from
 * the line — the `?? null` below is a normalisation, not the fallback, and degrading it proves
 * nothing because `undefined` is as falsy as `null` at the template that reads it. `registry.mjs`
 * refuses id reuse ("ids are never reused"), so an unresolvable id can only ever mean a RETIRED
 * check — never the wrong title — and `SV-99 WARN: <detail>` is a true line where `undefined` is
 * a broken one.
 */
export function readCachedChecks(root, { read = readFileSync, notBefore = null,
  titles = checkTitles } = {}) {
  const checks = readCacheThisRun(root, { read, notBefore })?.checks;
  if (!Array.isArray(checks) || checks.length === 0) return null;
  const byId = titles();
  return checks.map((c) => ({ ...c, title: byId.get(c.id) ?? null }));
}

/** `id → title`, from the registry that defines them. Built once; the registry is static. */
let TITLES = null;
function checkTitles() {
  if (TITLES === null) TITLES = new Map(engineChecks().map((c) => [c.id, c.title]));
  return TITLES;
}

/** `--check` found a newer release. A code, so a script can ask without parsing prose. */
export const EXIT_BEHIND = 4;

/** The fetch is the one call here that talks to another machine, and it gets its own budget. */
export const FETCH_TIMEOUT_MS = 120_000;

/**
 * ARC-07-C31 slice 4 — a function of the reader's shell, the shape every other usage now has.
 * `cli.mjs` resolves a `usage` that is a function and threads the one `where` it built.
 */
export const USAGE = (where) => [
  `usage: ${spellings(where).cli} upgrade [--to vX.Y.Z] [--check] [--yes] [--pre] [--force-floor]`,
  '',
  '  --check        fetch the tags, say whether a newer release exists, change nothing (exit 4 when behind)',
  '  --to vX.Y.Z    a specific release tag (checks it out detached; the summary says how to return)',
  '  --yes          accept the plan without asking (needed when stdin is closed or is not a terminal)',
  '  --pre          consider prerelease tags',
  '  --force-floor  upgrade even though the release wants a newer Claude Code',
].join('\n');

export const DIRTY =
  'upgrade: tracked files are modified — commit or stash them first (git stash); nothing was changed';
export const NOTHING_CHANGED = 'upgrade: nothing changed';

/**
 * ARC-09-C120 — why an untracked file stops an upgrade, said beside the refusal. The owner's rc.3 upgrade failed at
 * U5 on exactly this, with no reason on screen.
 */
export const UNTRACKED_REASON =
  'git refuses to overwrite an untracked file the target tracks, even with identical content';

/** A NUL-separated list from git (`-z`), each path as git wrote it: no quoting, nothing trimmed. */
export const splitZ = (text) => String(text ?? '').split('\0').filter(Boolean);

/**
 * ARC-09-C120 — the untracked paths the target tracks, each of which would stop `git checkout` at U5.
 *
 * Compared as git's own `/`-separated strings on every platform, never joined with `path.sep`. Case-folded when the
 * checkout's `core.ignorecase` is true: there an untracked `Notes/sitting.txt` blocks the target's `notes/sitting.txt`,
 * while `git ls-files --others` prints `Notes/sitting.txt` (measured on APFS), so an exact comparison would miss it.
 */
export function untrackedBlockers(untracked, tracked, { ignoreCase = false } = {}) {
  const fold = ignoreCase ? (p) => p.toLowerCase() : (p) => p;
  const theirs = new Set(tracked.map(fold));
  return untracked.filter((p) => theirs.has(fold(p)));
}

/** At most ten paths, then how many more: a refusal is read, not scrolled. */
export const namePaths = (paths, max = 10) => (paths.length <= max
  ? paths.join(', ')
  : `${paths.slice(0, max).join(', ')} and ${paths.length - max} more`);

/**
 * git's own reason: its first line, and the next one when the first ends with a colon, because git's refusals put
 * what they refuse on the second line ("… would be overwritten by checkout:", then the path). `null` when git said
 * nothing.
 */
export function gitReason(stderr) {
  const lines = String(stderr ?? '').split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return null;
  return lines[0].endsWith(':') && lines[1] ? `${lines[0]} ${lines[1]}` : lines[0];
}

/**
 * ARC-09-C120 — a failed move's line is git's reason, quoted: calling every failure a divergence sent the reader to
 * resolve a history that was fine. ARC-09-C194 — the branch's move is a fast-forward to the verified tag now, and
 * whether it CAN fast-forward is asked before (`merge-base --is-ancestor`), so this is only ever a lock, a permission,
 * a missing object: git's own words.
 */
export function fastForwardFailureLine(stderr, { branch, target }) {
  return `upgrade: git could not fast-forward ${branch} to ${target} — ${gitReason(stderr) ?? 'git gave no reason'}; `
    + 'nothing else was changed';
}

/**
 * The `owner/name` of a GitHub URL in any of git's spellings (https, ssh, git://, scp-like), or `null` for any other
 * URL, a path or another host. A credential in the URL is never part of the answer. ARC-09-C201 — taken out of
 * `originLine`, unchanged, because U3 asks the same question of the same URL.
 */
export function githubRepoOf(url) {
  const at = /^(?:(?:https?|ssh|git):\/\/(?:[^@/]+@)?|[^@/\s]+@)github\.com[/:]([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/i
    .exec(String(url ?? '').trim());
  return at ? `${at[1]}/${at[2]}` : null;
}

/**
 * ARC-09-C185c — the line for an install whose origin is a GitHub repository other than the one releases are published
 * at (`repo`, the config's `owner/name`), or `null`. From 2.2.1 a final is published there, signed over that repository's
 * commit, so an origin elsewhere stops at U4 on another commit, or at U2 once it no longer answers; this says where to
 * point it. Only a GitHub URL is judged: an origin on another host is a mirror or a path, and is the reader's own
 * arrangement. A credential in the URL is never printed.
 */
export function originLine(url, repo, cli) {
  const at = githubRepoOf(url);
  if (!at || typeof repo !== 'string' || repo === '') return null;
  if (at.toLowerCase() === repo.toLowerCase()) return null;
  // An http(s) URL may carry a token as its user, with or without a password; an ssh user is a login name, kept.
  const shown = String(url).trim().replace(/^(https?:\/\/)[^@/]+@/i, '$1');
  const home = `https://github.com/${repo}.git`;
  return `upgrade: origin is ${shown}, and releases are published at ${home} — git remote set-url origin ${home}, `
    + `then run ${cli} upgrade again`;
}

/**
 * What git's failure was, in the words of a remedy.
 *
 * Git's own stderr is printed too, always and first: it is the truth, and a classifier that
 * replaced it would be deciding what the user is allowed to see. What this adds is the sentence a
 * reader can act on — and only when the shape is recognised, because a confident wrong remedy
 * costs more than none (R-3, and `03`'s proxy findings).
 *
 * ARC-09-C207 — the sentence is `reason`, and each caller frames it: the upgrade's `line` below heads it with
 * `upgrade: `, and the doctor's E-28 shows it as it is, because a doctor line headed "upgrade:" claims a command that
 * never ran. `reason` is `null` for a shape this does not recognise.
 */
export function gitFetchReason(stderr = '', { remote = 'origin' } = {}) {
  const text = String(stderr);
  const host = /could not resolve host:?\s*(\S+)/i.exec(text)?.[1] ?? remote;
  if (/could not resolve host/i.test(text)) {
    return { kind: 'dns', reason: `DNS failure for ${host} — check the network; if you are `
      + 'behind a corporate proxy, git reads HTTPS_PROXY / http.proxy '
      + '(docs/TROUBLESHOOTING.md#proxy_unreachable)' };
  }
  if (/SSL certificate problem|unable to get local issuer|self[- ]signed certificate/i.test(text)) {
    return { kind: 'tls', reason: 'TLS certificate not trusted — a TLS-intercepting proxy '
      + 'needs its CA in git (http.sslCAInfo) and in Node (NODE_EXTRA_CA_CERTS); see '
      + 'docs/TROUBLESHOOTING.md#tls_ca_untrusted' };
  }
  if (/\b407\b|proxy authentication required/i.test(text)) {
    return { kind: 'proxy-auth', reason: 'the proxy demanded authentication (407) — put the '
      + 'credentials in HTTPS_PROXY, or ask for an exception for this host '
      + '(docs/TROUBLESHOOTING.md#proxy_auth_required)' };
  }
  // ARC-09-C190 — the remote wanted a credential it was not given, or says it has no such repository, which is how a
  // private one answers a stranger. The fetch runs with prompts off, so this is git's answer at once, not a wait.
  // ARC-09-C207 — a plain 404 with no `remote:` line, a moved URL on a self-hosted server, is git's
  // "repository '<url>' not found": the URL sits between the words GitHub's own line keeps together.
  if (/could not read Username|Authentication failed|Repository not found|repository '[^']*' not found|terminal prompts disabled/i
    .test(text)) {
    return { kind: 'auth', reason: `${remote} asked for credentials, or was not found — it may be private or `
      + `moved; check it with git remote get-url ${remote}` };
  }
  // A refused connection is the shape a dead proxy makes, and it is the one AC 4 exercises.
  if (/connection refused|failed to connect|couldn't connect to server|unable to access/i.test(text)) {
    return { kind: 'proxy', reason: 'could not reach the remote — if you are behind a '
      + 'corporate proxy, git reads HTTPS_PROXY / http.proxy '
      + '(docs/TROUBLESHOOTING.md#proxy_unreachable)' };
  }
  return { kind: 'unknown', reason: null };
}

/** The upgrade's line for git's failure: `gitFetchReason`'s sentence, framed as the upgrade's own, or `null`. */
export function classifyGitFetchError(stderr = '', { remote = 'origin' } = {}) {
  const { kind, reason } = gitFetchReason(stderr, { remote });
  if (reason === null) return { kind, line: null };
  // Only the credential line ends by saying nothing was changed, as ARC-09-C190 wrote it; the others never did.
  return { kind, line: `upgrade: ${reason}${kind === 'auth' ? '; nothing was changed' : ''}` };
}

// ARC-09-S12 — `parseSemver` and `sortTags` moved to `lib/semver.mjs` and are re-exported here so
// every existing importer keeps working. The copy that lived here compared the prerelease as a
// string, so `rc.10` sorted below `rc.9` and this command would have offered a checkout on rc.9 the
// release it was already on. `checks/host.mjs` imports both from this module; the re-export is what
// makes moving the rule a one-file change rather than a rename across the tree.
// A re-export does NOT bind the names locally, and `releaseTags` below calls `sortTags` — the first
// version of this line was `export { … } from …` and every real tag resolution threw
// `sortTags is not defined`. Import, then export: one statement for the module's own use, one for
// the importers that already read these names from here.
import { compareSemver, parseSemver, sortTags } from '../semver.mjs';
import { allowedPhrase, bannerLine, licenceStatus, REFUSED, REMEDY } from '../licence/state.mjs';
import { LAST_UNENFORCED_RELEASE } from '../doctor/checks/licence.mjs';
import { spellings } from '../launcher-spelling.mjs';

export { parseSemver, sortTags };

/** The release tags this checkout knows about, newest first. */
export function releaseTags(root, { pre = false, opts = {} } = {}) {
  const out = git(root, ['tag', '--list', 'v*'], { ...opts, allowFail: true }) ?? '';
  const all = sortTags(out.split('\n').map((l) => l.trim()).filter(Boolean));
  return pre ? all : all.filter((t) => t.pre === null);
}

/**
 * The tag's own message, parsed — the product's proof that a tag is a RELEASE.
 *
 * Any tag can be called `v9.9.9`. A release tag of this product is annotated and carries the
 * `contract:` trailer S01 writes, so a target without one is refused by name rather than checked
 * out and discovered afterwards.
 */
export async function readTag(root, tag, { opts = {} } = {}) {
  const message = git(root, ['tag', '-l', '--format=%(contents)', tag], { ...opts, allowFail: true });
  if (!message) return null;
  const { parseTagMessage } = await import('../release/tag.mjs');
  return parseTagMessage(message);
}

/** The contract a TAG ships, without checking it out. */
export function contractAt(root, tag, { opts = {} } = {}) {
  const text = git(root, ['show', `${tag}:packages/snowarch/dist/contract.json`],
    { ...opts, allowFail: true });
  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
}

/**
 * Which steps this upgrade will re-run, and why — from S05's table, not from a second opinion.
 *
 * DIFFED, not hashed, and that is the whole reason this is not a call to `staleSteps()`: that
 * function answers "what is stale in this checkout NOW", and the plan has to answer "what will be
 * stale once the tree is at the tag" — before the tree moves, which is the only moment at which a
 * plan is worth reading. So the question is put to git: `git diff --name-only HEAD <tag>`,
 * restricted to the files S05's INPUTS table declares, which keeps ONE declaration of what a step
 * depends on even though two functions read it. The gitlink and the store schema are the two
 * inputs that are not plain files, and each is compared on its own terms below.
 */
export function stepsThatWillRun(root, tag, { ctx, opts = {} }) {
  const declared = new Map();
  for (const id of STEP_IDS) {
    for (const input of INPUTS[id].inputs) {
      if (input.kind !== 'file') continue;
      const ref = input.ref.startsWith('<') ? ctx.config.docs.areasFile : input.ref;
      if (!declared.has(ref)) declared.set(ref, new Set());
      declared.get(ref).add(id);
    }
  }
  const changed = (git(root, ['diff', '--name-only', 'HEAD', tag, '--', ...declared.keys()],
    { ...opts, allowFail: true }) ?? '').split('\n').map((l) => l.trim()).filter(Boolean);

  const reasons = new Map();
  for (const file of changed) {
    for (const id of declared.get(file) ?? []) {
      if (!reasons.has(id)) reasons.set(id, []);
      reasons.get(id).push(file);
    }
  }
  // The corpus moves by its GITLINK, which no `--name-only` diff of files reports as content.
  const here = git(root, ['ls-tree', 'HEAD', 'vendor/ServiceNowDocs'], { ...opts, allowFail: true });
  const there = git(root, ['ls-tree', tag, 'vendor/ServiceNowDocs'], { ...opts, allowFail: true });
  if (here && there && here !== there) {
    if (!reasons.has('B02')) reasons.set('B02', []);
    reasons.get('B02').push('the docs pin');
  }
  return [...reasons.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([step, files]) => ({ step, title: INPUTS[step].title, files }));
}

/**
 * ARC-08-C29 — THE SET THE RUNNER WILL DECIDE, computed before the user says Y.
 *
 * `stepsThatWillRun` below answers a DIFFERENT question from the one the bootstrap asks. It maps
 * CHANGED FILES to steps; the runner compares each step's INPUT HASH against the recorded state
 * and re-runs anything that differs, has no record, or did not finish. The two agree often enough
 * to look like one computation and they are not, and the owner's rc.6 → rc.9 upgrade is what that
 * costs: U4 promised `B04, B05, B08`, U6 ran eight steps, and **B06 — which U4 never mentioned —
 * started the instance wizard**. The list the user approves was not the list that runs.
 *
 * The old function's own comment names the obstacle, and it is real: the plan is read BEFORE U5
 * moves the tree, so the post-move inputs are not on disk to hash. `git worktree add --detach
 * <temp> <tag>` puts them there — a real checkout of the tag, sharing the object store, 0.4 s —
 * and the real `.local/` is symlinked in, because the store and the state do NOT move with the
 * tag. That tree is what the checkout will be at U6, so hashing it with `hashFor` — the runner's
 * own function, over the runner's own table — is the runner's decision, taken early.
 *
 * If the worktree cannot be made, this returns `null` and the caller says the plan is a
 * FILE-CHANGE ESTIMATE rather than silently printing a different computation under the same
 * heading. Two answers wearing one label is the defect this row exists to remove.
 */
/**
 * The ctx the plan asks its questions with — EXPORTED so a test asks them the same way.
 *
 * `mode` and `docs` come from the RECORDED state, because that is what the upgrade re-runs under:
 * an upgrade does not ask the two plan questions again, it repeats the answers already on disk.
 * `node` is this machine's, because it is this machine that will run the steps. Everything else is
 * `stepContext`'s, which is what the bootstrap hands its steps.
 *
 * Exported because the first version of `plan-agrees.test.mjs` built its own ctx to record the
 * "current" hashes and then compared them against ones built here — two constructions, disagreeing
 * about `state.registration`, and the test reported B07 stale on a tree where nothing had changed.
 * A test that constructs its own version of the thing under test is measuring its own copy.
 */
export function planContext({ root, config, ctx = {}, state = null }) {
  return {
    ...stepContext({ root, config, env: ctx.env ?? process.env, node: ctx.node ?? nodeInfo(),
      flags: { yes: true }, state, licence: ctx.licence }),
    mode: state?.mode ?? ctx.mode ?? 'design',
    docs: state?.docs?.mode ?? ctx.docs ?? 'sparse',
  };
}

/**
 * ARC-09-C140 — `manifestWritten`: U5 will write the target's verified manifest into the cache before U6, so B01's
 * output is not missing when the bootstrap asks, though the cache still holds the old release's while the plan is
 * made. Without it the plan would list B01 and the run would find it cached (ARC-08-C29). A move that does not write
 * it — a pull on a branch — leaves the question to the cache, as the runner will.
 */
/**
 * ARC-09-C196 — one step's verdict from its recorded status, or `null` when it is judged by its hash and outputs.
 *
 * Every status a step entry can carry, by name, because a status left out is the next loop: the runner's ok, warn
 * and fail (steps/index.mjs), `skipped` when runsWhen declined, and interrupt()'s `failed` with reason
 * `interrupted`; a status `interrupted` is read for older states, and nothing in this tree writes it.
 *
 * A WARN IS JUDGED TWO WAYS. The runner caches only ok, so on U4's path a warned step will run again and the plan
 * says so, in true words: "last run warned", not "did not finish". At the tag (`warnIsDone`) the question is
 * whether the move finished, and a warned step finished: it is judged by its hash, like ok.
 */
export function statusVerdict(recorded, { warnIsDone = false } = {}) {
  if (!recorded) return 'never recorded';
  if (recorded.status === 'ok') return null;
  if (recorded.status === 'warn') return warnIsDone ? null : 'last run warned';
  if (recorded.reason === 'interrupted' || recorded.status === 'interrupted') return 'last run interrupted';
  if (recorded.status === 'skipped') return 'last run skipped it';
  return 'last run did not finish';
}

export function rerunAtTag(root, tag, { ctx, state, run = spawnSync, keepWorktree = null, manifestWritten = false,
  warnIsDone = false } = {}) {
  const scratch = keepWorktree ? null : mkdtempSync(join(tmpdir(), 'snowarch-plan-'));
  const at = keepWorktree ?? join(scratch, 'at-tag');
  const added = keepWorktree !== null
    || run('git', ['worktree', 'add', '--detach', '--quiet', at, tag],
      { cwd: root, encoding: 'utf8', stdio: 'pipe' })?.status === 0;
  if (!added) {
    // The worktree failed, so the directory made for it is rubbish. Removed HERE rather than in
    // the `finally` below, which the early return never reaches.
    if (scratch) rmSync(scratch, { recursive: true, force: true });
    return null;
  }

  try {
    // The store and the state are the CHECKOUT's, not the tag's: an upgrade does not move them,
    // and B06's inputs are mostly about them. A worktree without them would read `storePresent=no`
    // and call B06 stale on every upgrade — the opposite of this row's point.
    // ARC-07-C43 head 2 — TWO ROOTS, and only one is this checkout's state. The SOURCE follows
    // `SNOWARCH_STATE_ROOT` because it IS the checkout's `.local/`; the link's LOCATION is a path
    // inside the worktree just created, which is another tree — redirecting that would put the
    // link somewhere the upgrade is not looking.
    const local = localDir(root);
    if (existsSync(local)) {
      try { symlinkSync(local, join(at, '.local'), 'dir'); } catch { /* already there */ }
    }

    let config = ctx.config;
    try { config = JSON.parse(readFileSync(join(at, 'engine.config.json'), 'utf8')); } catch { /* the tag's, or ours */ }

    // THE RUNNER'S OWN SHAPE, from the runner's own constructor. A spread of the upgrade
    // command's `{ root, config }` was missing `env`, and `B04.runsWhen` reads
    // `ctx.env.SNOWARCH_TEST_FORCE_DEPS` — so every real upgrade crashed at `[U4/7] plan`. A ctx
    // assembled at a call site is a ctx that drifts from what the steps read.
    //
    // `mode` and `docs` come from the RECORDED state, because that is what the upgrade re-runs
    // under: an upgrade does not ask the two questions again, it repeats the answers already on
    // disk. `node` is this machine's, because it is this machine that will run the steps.
    const tagCtx = planContext({ root: at, config, ctx, state });

    // ARC-09-C198 — the runner keeps none of the steps of a record that is not this checkout's, so the plan names
    // every step that record holds, and says which of the two it is; a step with no record keeps "never recorded".
    // The CHECKOUT's root, not the worktree's: the state is the checkout's, and so is the folder it names.
    const notHere = recordedHere(state, root, tagCtx.platform) ? null
      : (notHereReason(state) === 'other-folder' ? 'recorded in another folder' : 'recorded without a folder');

    const out = new Map();
    for (const step of STEPS) {
      if (step.runsWhen(tagCtx) === false) continue;
      if (step.cacheable === false) continue;   // B00 and B09 run every time and say so elsewhere
      const recorded = state?.steps?.[step.id];
      if (recorded && notHere) { out.set(step.id, notHere); continue; }
      const unfinished = statusVerdict(recorded, { warnIsDone });
      if (unfinished) { out.set(step.id, unfinished); continue; }
      let hash = null;
      try { hash = hashFor(step.id, tagCtx); } catch { hash = null; }
      if (hash === null) { out.set(step.id, 'inputs could not be read'); continue; }
      if (hash !== recorded.inputsHash) { out.set(step.id, 'inputs changed'); continue; }
      if (!(manifestWritten && step.id === 'B01') && outputMissingOf(step, tagCtx)) {
        out.set(step.id, 'the release manifest is not held');
      }
    }
    return out;
  } finally {
    if (keepWorktree === null) {
      run('git', ['worktree', 'remove', '--force', at], { cwd: root, encoding: 'utf8', stdio: 'pipe' });
      // AND THE DIRECTORY THAT HELD IT. Removing the worktree leaves the `mkdtemp` behind, so
      // every real plan left one empty `snowarch-plan-*` in the OS temp directory — measured at
      // five after one test file. `rmSync` after `worktree remove`, in the same `finally`, so an
      // exception between them still cleans up.
      if (scratch) rmSync(scratch, { recursive: true, force: true });
    }
  }
}

/**
 * The list the plan prints: the runner's SET, with the file diff's words where it has them.
 *
 * ARC-08-C29. Two computations answered the same heading and disagreed — U4 said `B04, B05, B08`
 * and the run went on to start B06's wizard. This is the one computation, with the readable half
 * kept: `rerunAtTag` decides WHICH steps, `stepsThatWillRun` explains WHY for the ones a file
 * change explains, and a step stale for any other reason carries the hash's own word instead of
 * vanishing from the line.
 */
export function planSteps(root, tag, { ctx, state, opts = {}, run = spawnSync, manifestWritten = false,
  warnIsDone = false } = {}) {
  const byFile = new Map(stepsThatWillRun(root, tag, { ctx, opts })
    .map((s) => [s.step, s]));
  const decided = rerunAtTag(root, tag, { ctx, state, run, manifestWritten, warnIsDone });

  // No worktree, no runner comparison: fall back to the file diff and SAY it is an estimate.
  if (decided === null) {
    return { steps: [...byFile.values()].map((s) => ({ ...s, why: 'files changed' })), estimate: true };
  }

  const steps = [...decided.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([step, why]) => ({
      step,
      title: INPUTS[step]?.title ?? step,
      files: byFile.get(step)?.files ?? [],
      why,
    }));
  return { steps, estimate: false };
}

/** What the store will do, said before it is done. */
/**
 * ARC-07-C31 slice 4 — one caller, `line 611` below, so a default is within the rule and named.
 */
export function storePlan(root, tag, { opts = {}, spell = spellings() } = {}) {
  const store = storePath(root);
  if (!existsSync(store)) return { line: 'store: none (no instance store in this checkout)' };
  let from = null;
  try { from = JSON.parse(readFileSync(store, 'utf8'))?.version ?? null; } catch { from = 'unreadable'; }
  const to = contractAt(root, tag, { opts })?.storeSchemaVersion ?? null;
  if (from === 'unreadable') {
    return { line: `store: the store is not valid JSON — run ${spell.cli} store migrate to see why`,
      blocked: true };
  }
  if (to === null) return { line: `store: schema v${from} → unknown (the tag ships no contract)` };
  if (to === from) return { line: `store: schema v${from} → v${to} (no migration)` };
  if (to < from) {
    return { line: `store: schema v${from} is NEWER than the target's v${to} — this is a downgrade`,
      blocked: true };
  }
  return { line: `store: schema v${from} → v${to} (1 migration; backup will be written)`,
    migrates: true };
}

/** Is the installed Claude Code new enough for what the tag asks? */
export function floorCheck(tagInfo, { exec }) {
  const want = tagInfo?.floors?.claudeCode ?? null;
  if (!want) return { line: null, below: false };
  const r = exec('claude', ['--version']);
  // ARC-09-C194 — absent or unreadable is BELOW, not unknown-and-through: the target's B00 refuses both unless its
  // Claude Code check is skipped, which only --force-floor asks for.
  if (!r.found || !r.ok) {
    return { line: `claude-floor ${want} (installed: not found — install Claude Code, or pass `
      + '--force-floor)', below: true, unknown: true };
  }
  const { ok: passes, found } = meetsFloor(r.stdout, want);
  if (!found) return { line: `claude-floor ${want} (installed version not understood)`, below: true, unknown: true };
  // `formatVersion`, because `meetsFloor` answers with a parsed OBJECT and a template literal
  // turns that into `[object Object]` — which is what the first run of this printed.
  const shown = formatVersion(found);
  return passes
    ? { line: `claude-floor ${want} (installed ${shown} ok)`, below: false }
    : { line: `claude-floor ${want} (installed ${shown} — BELOW the floor; upgrade Claude Code first)`,
      below: true };
}

/**
 * ARC-09-C194 — the git and Node floors the tag states, judged at U4 with B00's own predicates, or `null` when both
 * hold. The target's B00 judges them again after U5, where a refusal leaves the tree moved and the bootstrap not run,
 * and the next `upgrade` reads "up to date". Git is required in every mode and Node only for live, as B00 has it, and
 * an unreadable version refuses there too. No flag waives either: --force-floor covers Claude Code alone, the one check
 * B00 can skip.
 */
export function toolFloorRefusal(tagInfo, { exec, mode, platform = process.platform, locate = undefined }) {
  const floors = tagInfo?.floors ?? {};
  if (floors.git) {
    const r = checkGit({ exec, floors: { git: floors.git }, plat: platform });
    if (r.status === 'fail') return r.detail;
  }
  if (floors.node) {
    const r = checkNode({ exec, ...(locate ? { locate } : {}), floors: { node: floors.node }, plat: platform,
      mode: mode === 'live' ? 'live' : 'design-only' });
    if (r.status === 'fail') return r.detail;
  }
  return null;
}

const short = (sha) => (sha ? String(sha).slice(0, 7) : '—');

/** The plan block, exactly as the story writes it. */
export function renderPlan({ from, to, commits, date, tagInfo, floor, steps, store,
  restart = null, estimate = false }) {
  const lines = [`Upgrade plan: ${from} → ${to}`
    + `${commits === null ? '' : ` (${commits} commit${commits === 1 ? '' : 's'}`
      + `${date ? `, ${date}` : ''})`}`];
  lines.push(`  tag verified: contract ${short(tagInfo?.contract)}… · docs-pin `
    + `${short(tagInfo?.docsPin)} · ${floor.line ?? 'claude-floor not stated'}`);
  // ARC-08-C29 — the SET is the runner's decision, the REASON is whatever can be said about it.
  //
  // `files` is the readable half: `package-lock.json changed` tells a reader what moved. But a
  // step can be stale for reasons no file diff shows — a literal input, a last run that did not
  // finish — and those steps used to be absent from this line and present in the run. When the
  // set comes from the hash, the reason is the diff where there is one and the hash's own word
  // where there is not.
  lines.push(steps.length === 0
    ? '  steps that will re-run: none (only the preflight and the summary)'
    : `  steps that will re-run: ${steps.map((s) => `${s.step} ${s.title} `
      + `(${s.files?.length ? `${s.files.join(', ')} changed` : s.why})`).join('; ')}`);
  // Said out loud when the runner's own comparison could not be made, rather than printing a
  // different computation under the same heading.
  if (estimate) {
    lines.push('  (the list above is a file-change estimate: the tag could not be checked out to '
      + "compare the runner's own inputs)");
  }
  lines.push(`  ${store.line}`);
  lines.push('  credentials: untouched (.local/instances.json is never read or written by the upgrade)');
  if (restart) lines.push(`  after the upgrade: ${restart}`);
  return lines.join('\n');
}

/**
 * The step a previous run stopped at, or `null`.
 *
 * `fail` and `interrupted` both mean "this checkout is part-way through an install", which is the
 * state a resume exists for. A step that was SKIPPED is not one of them: `runsWhen` declining is a
 * decision, not an interruption.
 *
 * ARC-09-C196 — and `failed`, which is what `interrupt()` (steps/index.mjs) records for a Ctrl-C, with its reason
 * `interrupted` beside it. This tested `fail` and `interrupted` only, so an interrupted bootstrap read "up to date".
 */
export function failedStep(state) {
  for (const [id, entry] of Object.entries(state?.steps ?? {})) {
    if (entry?.status === 'fail' || entry?.status === 'failed' || entry?.status === 'interrupted') return id;
  }
  return null;
}

/**
 * ARC-11-C6 — what U4 tells a checkout with no licence in force before it moves to a release that refuses without one:
 * the state, what that release refuses, and E-31's remedy, with nothing after it (the owner's ruling from the rc.3
 * sitting, 2026-10-13). `null` when a licence is in force, and for a target at or below LAST_UNENFORCED_RELEASE. A
 * target this product cannot order is presumed to enforce, so the notice errs towards being said.
 */
export function licenceNotice({ licence, target, cli }) {
  if (!REFUSED.includes(licence.state)) return null;
  let enforces = true;
  try { enforces = compareSemver(target, LAST_UNENFORCED_RELEASE) > 0; } catch { /* unordered: presumed to enforce */ }
  if (!enforces) return null;
  return [
    `${bannerLine(licence)} — ${target} runs no MCP tool, and no command but ${allowedPhrase()}, without a licence in force.`,
    REMEDY(cli),
  ];
}

/**
 * ARC-11-C6 — the owner's ruling from the rc.3 sitting (2026-10-13): with no licence in force, a move to a release at or
 * below LAST_UNENFORCED_RELEASE is refused. A licence in force takes it (the owner's own case), and a move
 * forward is never refused, so fixes still reach an unlicensed install. A target this product cannot order is presumed
 * to enforce, as U4's notice presumes, so it is not refused.
 */
export function refusesTarget({ licence, target }) {
  if (!REFUSED.includes(licence.state)) return false;
  try { return compareSemver(target, LAST_UNENFORCED_RELEASE) <= 0; } catch { return false; }
}

/** The refusal, in the shape of every other licence refusal: the state and the code, then the remedy, and no reason. */
export const targetRefusalLines = ({ licence, target, cli }) => [
  `snowarch upgrade: licence ${licence.state}${licence.signatureValid ? ` (${licence.id})` : ''} (Code: LICENCE_NOT_VALID) `
    + `— upgrade --to ${target} does not run without a valid licence; nothing was changed`,
  REMEDY(cli),
];

/** `[U3/7] resolve target` — the step line, in the bootstrap's own shape. */
const stepLine = (n, title) => `[U${n}/7] ${title}`;

export async function upgradeCommand({ flags = {}, positional = [], log, root = defaultRoot,
  // ARC-07-C31 — `platform` for `loadState`'s spelling, and the ARGUMENT is all that changes here:
  // this file's own four launcher sites stay with the e2e-trigger slice.
  env = process.env, platform = process.platform,
  cwd = process.cwd(), exec = undefined, run = spawnSync,
  now = () => new Date(), ask = null, input = process.stdin } = {}) {
  if (positional.length > 0) {
    log.fail(`upgrade takes no positional arguments; did you mean --to ${positional[0]}?`);
    log.step(USAGE({ platform, env }));
    return EXIT_USAGE;
  }
  const opts = { env };
  const probe = exec ?? makeExec({ env });
  const config = loadConfig(root);
  const remote = 'origin';
  // ARC-09-C120 — git's stdout as git wrote it. `git()` trims it, which would cut a leading space off the first path
  // of a `-z` list. `null` when git failed.
  const gitRaw = (args) => {
    const r = run('git', args, { cwd: root, encoding: 'utf8', env: childEnv(root, env), stdio: 'pipe' });
    return r.status === 0 ? String(r.stdout ?? '') : null;
  };

  // ── U1 preflight ──────────────────────────────────────────────────────────────────────────
  log.step(stepLine(1, 'preflight'));
  const state = (() => {
    try { return loadState(root, spellings({ platform, env })); } catch { return null; }
  })();
  const dirty = git(root, ['status', '--porcelain', '--untracked-files=no'], { ...opts, allowFail: true });
  if (dirty === null) {
    log.fail('upgrade: this is not a git checkout — the upgrade moves a tree, and there is none');
    return EXIT_USAGE;
  }
  if (dirty.trim() !== '') {
    log.fail(DIRTY);
    // ARC-09-C120 — and which files. A refusal that names nothing sends the reader to `git status` to find out.
    const modified = splitZ(gitRaw(['diff', '--name-only', '-z', 'HEAD']));
    if (modified.length > 0) log.step(`modified: ${namePaths(modified)}`);
    return EXIT_USAGE;
  }
  const shallow = isShallow(root, opts);

  // ── U2 fetch ──────────────────────────────────────────────────────────────────────────────
  log.step(stepLine(2, `fetch tags from ${remote}`));
  const fetchArgs = ['fetch', '--tags', '--prune', ...(shallow ? ['--unshallow'] : []), remote];
  // ARC-09-C190 — with prompts off: a remote that wants a credential no helper holds fails now, with git's reason,
  // instead of waiting on a prompt until FETCH_TIMEOUT_MS. A helper's stored credential still applies.
  const fetched = run('git', fetchArgs, { cwd: root, encoding: 'utf8', env: childEnv(root, { ...env, ...NO_PROMPT_ENV }),
    timeout: FETCH_TIMEOUT_MS, stdio: 'pipe' });
  if (fetched.status !== 0) {
    const stderr = String(fetched.stderr ?? fetched.error?.message ?? '').trim();
    if (stderr) for (const line of stderr.split('\n')) log.step(line);
    const { line } = classifyGitFetchError(stderr, { remote });
    log.fail(line ?? 'upgrade: git could not fetch the release tags; nothing was changed');
    const moved = originLine(git(root, ['config', '--get', `remote.${remote}.url`], { ...opts, allowFail: true }),
      config.repo, spellings({ platform, env }).cli);
    if (moved) log.step(moved);
    return EXIT_FAIL;
  }

  // ── U3 resolve the target ─────────────────────────────────────────────────────────────────
  log.step(stepLine(3, 'resolve target'));
  const tags = releaseTags(root, { pre: Boolean(flags.pre), opts });
  const latest = tags[0]?.tag ?? null;
  const target = flags.to ?? latest;
  // ARC-09-C170 — which release this checkout is on, by the doctor's own rule (version-info.mjs): the version of record's
  // `v<version>` tag at HEAD first (ARC-09-C154), then `describe` over `v*` tags only. An `import/*` tag is never named,
  // and the plan and the doctor's Engine line cannot disagree about the same checkout.
  const found = versionTag(root, readVersion(root), opts) ?? describe(root, opts);
  const here = found?.exact ? found.name : null;
  const localTag = found?.name ?? null;
  const fromLabel = !found
    ? `a development tree at ${git(root, ['rev-parse', '--short=7', 'HEAD'], { ...opts, allowFail: true }) ?? 'an unknown commit'}`
    : found.exact ? found.name : `${found.name}+${found.distance} (${found.short})`;

  if (!target) {
    log.fail(`upgrade: ${remote} has no release tags${flags.pre ? '' : ' (prereleases need --pre)'}`);
    return EXIT_FAIL;
  }
  const tagInfo = await readTag(root, target, { opts });
  if (!tagInfo?.contract) {
    // ARC-09-C201 — TWO CAUSES, ONE SENTENCE BEFORE. `readTag` is empty for a tag that is not there and for one that is
    // no release alike, and the github.com/<config.repo> distribution carries finals only, from 2.2.1 on, so `--to` an
    // rc or an older release meets the first and was told the second. So git is asked whether the ref exists: U2's
    // `fetch --tags --prune` prunes no local tag (only --prune-tags would), so a tag absent now is absent from the
    // origin, and one present only here keeps the sentence below. The origin's URL decides which sentence prints and
    // is never part of one, so a credential in it cannot reach the line. Nothing has moved yet, and nothing does.
    const present = git(root, ['rev-parse', '--verify', '--quiet', `refs/tags/${target}`], { ...opts, allowFail: true });
    if (!present) {
      const url = git(root, ['config', '--get', `remote.${remote}.url`], { ...opts, allowFail: true });
      const ours = typeof config.repo === 'string' && config.repo !== ''
        && githubRepoOf(url)?.toLowerCase() === config.repo.toLowerCase();
      log.fail(ours
        ? `upgrade: ${target} is not a tag of github.com/${config.repo}, which carries final releases from 2.2.1 on`
        : `upgrade: ${target} is not a tag of this checkout's origin`);
      return EXIT_FAIL;
    }
    log.fail(`upgrade: ${target} is not a release tag of this product`);
    return EXIT_FAIL;
  }
  // ARC-11-C6 — refused here, before the check's cache is written or the tree moves, so "nothing was changed" holds.
  const licence = licenceStatus(root);
  const cli = spellings({ platform, env }).cli;
  if (refusesTarget({ licence, target })) {
    for (const line of targetRefusalLines({ licence, target, cli })) log.fail(line);
    return EXIT_PREREQ;
  }

  const behind = Boolean(latest && localTag !== latest);
  // ARC-09-C47 — this write KEEPS its verdict, and that is deliberate. It fetched the tags and
  // compared them, so `behind` here is a measurement; `upgrade --check` exists to refresh exactly
  // this record, and the banner's nudge reads it. Do not strip it for symmetry with `finish()`,
  // whose `behind` was a literal — the asymmetry IS the distinction this row is about.
  writeUpgradeCheck(root, { latestTag: latest, localTag, behind, remote, now,
    source: 'upgrade-check' });
  // ARC-11-C1 — the revocation list rides on the same user-started fetch, from its own explicit URL and
  // only with a licence installed: without one this is a no-op, and the run prints what it always did.
  refreshWithUpgrade(root, { config, env, now: now(), log });

  if (flags.check) {
    log.step(behind
      ? `${latest} available (you are on ${fromLabel})`
      : `up to date (${localTag ?? latest})`);
    return behind ? EXIT_BEHIND : EXIT_OK;
  }

  // Already at the target — but "the tree is there" and "the upgrade finished" are two different
  // claims, and the failure message this command prints says "re-run ./snowarch upgrade". A run
  // that answered `up to date` to that would be telling a user to type a command that does
  // nothing. So an unfinished bootstrap continues from U6 instead.
  const unfinished = here === target ? failedStep(state) : null;
  // ARC-09-C196 — AT THE TAG, "UP TO DATE" ONLY WHEN NOTHING IS LEFT TO RUN. A move whose bootstrap recorded nothing
  // (it died before its first entry, was killed, or the run stopped between U5 and U6) leaves every step recorded ok
  // against the OLD inputs, and this answered "up to date" with U6 and U7 never run. The plan U4 prints asks the
  // tag's own runner; here it is asked with `manifestWritten: false`, because the at-target path writes no manifest:
  // a cache without this release's is a step to run, and B01 refreshes it. Without a worktree the plan falls back to
  // the file diff, which is empty here, and the answer stays "up to date".
  const leftToRun = here === target && !unfinished
    ? planSteps(root, target, { ctx: { root, config }, state, opts, run, manifestWritten: false, warnIsDone: true }).steps
    : [];
  if (here === target && !unfinished && leftToRun.length === 0) {
    log.step(`up to date (${target})`);
    return EXIT_OK;
  }
  if (unfinished || leftToRun.length > 0) {
    log.step(unfinished
      ? `already at ${target}; the last run stopped at ${unfinished} — continuing from there`
      : `already at ${target}, with steps still to run (${leftToRun.map((st) => `${st.step}: ${st.why}`).join('; ')}) `
        + '— continuing from there');
    return finish({ root, env, log, run, target, latest, remote, now, state,
      skipClaudeCheck: Boolean(flags['force-floor']) });
  }

  // ── U4 the plan, computed before anything moves ───────────────────────────────────────────
  log.step(stepLine(4, 'plan'));
  // ARC-09-C120 — an untracked file the target tracks stops `git checkout` at U5, after the plan was accepted and with
  // no reason on screen: the owner's rc.3 upgrade. So the plan refuses first, by name, before anything moves.
  const blockers = untrackedBlockers(
    splitZ(gitRaw(['ls-files', '--others', '--exclude-standard', '-z'])),
    splitZ(gitRaw(['ls-tree', '-r', '--name-only', '-z', target])),
    { ignoreCase: git(root, ['config', '--get', '--bool', 'core.ignorecase'], { ...opts, allowFail: true }) === 'true' });
  if (blockers.length > 0) {
    const one = blockers.length === 1;
    log.fail(`upgrade: ${blockers.length} untracked file${one ? ' is' : 's are'} in the way of ${target}: `
      + `${namePaths(blockers)} — move ${one ? 'it' : 'them'} aside or commit ${one ? 'it' : 'them'}; nothing was changed`);
    log.step(UNTRACKED_REASON);
    return EXIT_USAGE;
  }
  // ARC-11-C7 — A TARGET FROM 2.1 ON MOVES ONLY WITH ITS SIGNED MANIFEST, and one that is the record of THIS tag: verified
  // with the shipped keys, and the same commit, files and hashes as the tag's own `git archive` here. Refused now, before
  // anything moves. The manifest is cached once the tree is the target, so the doctor at U7 checks the new tree against
  // its own release. A target before 2.1 was released without one, so it moves with a note.
  let manifest = null;
  if (signedRelease(target)) {
    const fetched = refreshManifest(root, { config, tag: target, env, now: now(), write: false });
    const why = fetched.outcome === 'fetched' ? archiveDiffers(root, target, fetched.entry.doc.manifest) : manifestSays(fetched);
    if (why) {
      log.fail(`upgrade: ${target} has no verified signed manifest (${why}) — nothing was changed`);
      // ARC-09-C185c — signed over another commit than the tag here: the tag came from somewhere else than the release.
      const local = git(root, ['rev-parse', `${target}^{commit}`], { ...opts, allowFail: true });
      if (fetched.outcome === 'fetched' && fetched.entry.doc.manifest.commit !== local) {
        const moved = originLine(git(root, ['config', '--get', `remote.${remote}.url`], { ...opts, allowFail: true }),
          config.repo, spellings({ platform, env }).cli);
        if (moved) log.step(moved);
      }
      return EXIT_FAIL;
    }
    log.step(manifestSays(fetched));
    manifest = fetched;
  } else {
    log.step(`${target} is from before ${MANIFESTS_FROM}, when releases began to carry a signed manifest: its files are not checked`);
  }
  const ctx = { root, config };
  // Read here rather than at U5, because the plan depends on it (ARC-09-C140). From ARC-09-C194 both moves, the
  // checkout and the branch's fast-forward to the verified tag, write the target's manifest at U5.
  const branch = branchState(root, opts);
  const onBranch = Boolean(branch.branch) && !branch.detached;
  // ARC-08-C29 — ONE COMPUTATION. `planSteps` asks the runner's own question (hash the tag's
  // inputs, compare with the recorded state) and falls back to the file diff only when the tag
  // cannot be checked out — in which case the plan says so rather than printing the other answer
  // under the same heading.
  const { steps, estimate } = planSteps(root, target, { ctx, state, opts,
    manifestWritten: manifest !== null });
  const store = storePlan(root, target, { opts, spell: spellings({ platform, env }) });
  const floor = floorCheck(tagInfo, { exec: probe });
  const commits = Number(git(root, ['rev-list', '--count', `HEAD..${target}`], { ...opts, allowFail: true }) ?? '');
  const date = git(root, ['log', '-1', '--format=%cs', target], { ...opts, allowFail: true });

  log.step(renderPlan({
    from: fromLabel, to: target,
    commits: Number.isFinite(commits) ? commits : null, date, tagInfo, floor, steps, store, estimate,
    restart: 'restart claude (the MCP server binary changed) — or run /mcp → servicenow → reconnect',
  }));

  if (store.blocked) {
    log.fail('upgrade: nothing was changed');
    return EXIT_FAIL;
  }
  const tools = toolFloorRefusal(tagInfo, { exec: probe, mode: state?.mode, platform });
  if (tools) {
    log.fail(`upgrade: ${target} needs what this machine does not have — ${tools}; nothing was changed `
      + '(--force-floor covers Claude Code only)');
    return EXIT_USAGE;
  }
  if (floor.below && !flags['force-floor']) {
    log.fail(floor.unknown
      ? `upgrade: Claude Code was not found, or its version not understood, and ${target} wants `
        + `${tagInfo.floors.claudeCode} or later — install or upgrade it first, or pass --force-floor; nothing was changed`
      : 'upgrade: the installed Claude Code is below the floor this release wants — upgrade it '
        + 'first, or pass --force-floor; nothing was changed');
    return EXIT_USAGE;
  }
  // ARC-11-C6 — said with --yes and without, before the question: the move is still the reader's to make.
  const notice = licenceNotice({ licence, target, cli });
  if (notice) for (const line of notice) log.step(line);

  if (!flags.yes) {
    // ARC-09-C109 — the reader is the shared one (`lib/ask.mjs`): one line, or `null` at end of input.
    // This used to be a reader of its own that returned '' at end of input, and '' is not a "no", so a
    // closed stdin (a CI step, `< /dev/null`, a pipe that ended) accepted the plan and moved the tree.
    // Enter, an empty LINE, is still the default yes; only the absence of any answer is refused, with
    // its own sentence and a non-zero exit, because a script that asked for an upgrade and got none must
    // not see 0.
    let answer;
    if (ask) {
      answer = await ask('Proceed? [Y/n]');
    } else {
      log.step('Proceed? [Y/n] ');
      answer = await askOnce(input)();
    }
    if (answer === null) {
      log.fail('upgrade: no answer on stdin (it is closed, or not a terminal) — nothing was changed; '
        + 'pass --yes to accept the plan without asking');
      return EXIT_USAGE;
    }
    // Anything that is not a yes is a no (design principle 10): the plan is a proposal.
    if (!isYes(answer)) {
      log.step(NOTHING_CHANGED);
      return EXIT_OK;
    }
  }

  // ── U5 move the tree ──────────────────────────────────────────────────────────────────────
  log.step(stepLine(5, `move the checkout to ${target}`));
  /*
   * ARC-07-C39 — THE RETURN REF IS ONE THE CHECKOUT ACTUALLY HAS, and `main` often is not.
   *
   * This said `git checkout ${branch.branch ?? 'main'}`. On a clone made with `--branch v2.0.5` there is no
   * local `main` at all — the clone has one remote-tracking branch and the tag — so the command handed to
   * the reader fails with `error: pathspec 'main' did not match any file(s) known to git`, at the exact
   * moment the message exists to unstick them. `branch.branch` is read BEFORE the move, so it is
   * right whenever they were on a branch; when they were already detached it is null, and the honest answer
   * is where HEAD actually was — the tag if it was at one, otherwise the sha, both of which always resolve.
   *
   * AND IT SAYS WHAT MOVING HEAD DOES TO THE STORE: nothing. That is the question a reader mid-upgrade
   * actually has, and a remedy that leaves it unanswered invites them to go looking for their credentials.
   */
  const returnTo = returnRef(branch, describe(root, opts));
  const before = git(root, ['rev-parse', 'HEAD'], { ...opts, allowFail: true });
  const byBranch = !flags.to && onBranch;
  const gitRun = (args) => run('git', args, { cwd: root, encoding: 'utf8', env: childEnv(root, env), stdio: 'pipe' });
  if (byBranch) {
    /*
     * ARC-09-C194 — A BRANCH MOVES TO THE VERIFIED TAG. This pulled `origin <branch>`: the branch went wherever the
     * remote branch was, U4's verified manifest was never asked about the tree it landed on, and finish() reported a
     * move to the tag. A main that leads or lags its newest tag put a branch install on a commit nobody signed. Now the
     * branch fast-forwards to the tag's own commit, U2 having fetched it, or nothing moves.
     */
    const commit = git(root, ['rev-parse', '--verify', '--quiet', `${target}^{commit}`], { ...opts, allowFail: true });
    if (!commit || gitRun(['merge-base', '--is-ancestor', 'HEAD', commit]).status !== 0) {
      log.fail(`upgrade: ${branch.branch} cannot fast-forward to ${target} — resolve with git, or use --to ${target} `
        + 'to check out the release tag; nothing was changed');
      return EXIT_FAIL;
    }
    const merged = gitRun(['merge', '--ff-only', '--quiet', commit]);
    if (merged.status !== 0) {
      log.fail(fastForwardFailureLine(merged.stderr ?? merged.error?.message, { branch: branch.branch, target }));
      return EXIT_FAIL;
    }
  } else {
    // ARC-09-C120 — through `run`, so git's own reason reaches the line that reports the failure: `git()` with
    // `allowFail` dropped it, and "could not check out" alone left the reader to guess.
    const checkedOut = gitRun(['checkout', '--quiet', target]);
    if (checkedOut.status !== 0) {
      const reason = gitReason(checkedOut.stderr ?? checkedOut.error?.message);
      log.fail(`upgrade: git could not check out ${target}${reason ? ` — ${reason}` : ''}; nothing else was changed`);
      return EXIT_FAIL;
    }
  }
  // ARC-11-C7 — the tree is checked after U5 and before U6: what git checked out against what the owner signed, so a
  // tree that differs (a file the checkout left, a filter, a covered directory with more in it) stops the upgrade
  // before the bootstrap runs on it. The cache is not written yet, so git alone takes the tree back.
  if (manifest) {
    const tree = checkTree(root, manifest.entry.doc.manifest);
    if (!tree.ok) {
      const n = tree.modified.length;
      const back = byBranch ? `git reset --keep ${before}` : `git checkout ${returnTo}`;
      log.fail(`upgrade: the tree at ${target} is not what its signed manifest records — ${n} file${n === 1 ? '' : 's'} `
        + `differ${n === 1 ? 's' : ''}, the first ${tree.modified[0].path} (${tree.modified[0].why}); the upgrade stops before the `
        + `bootstrap — return with: ${back}`);
      return EXIT_FAIL;
    }
    writeManifestCache(root, manifest.entry);
  }
  if (byBranch) {
    log.step(`${branch.branch} is at ${target}`);
  } else {
    // ARC-09-C194 and C203: which return the line names, and why, is returnLine's.
    log.step(returnLine({ cli, here, target, manifest, returnTo }));
  }
  log.step('your instance store lives in .local/, which git ignores, so no checkout touches it');

  return finish({ root, env, log, run, target, latest, remote, now, state,
    skipClaudeCheck: Boolean(flags['force-floor'] && floor.below) });
}

/**
 * ARC-07-C39 — the ref a reader can actually check out to get back.
 *
 * `git checkout main` was wrong on the clone shape the row names: `git clone --branch v2.0.5` leaves HEAD
 * detached at the tag with no local `main` at all, so the command failed with
 * `error: pathspec 'main' did not match any file(s) known to git` at the moment the message existed to
 * unstick the reader. The order is what the checkout HAS: the branch they were on (read before the move, so
 * it is still true), else the tag HEAD was exactly at, else the sha — and a sha always resolves, which is why
 * it is the floor rather than a name that might not exist.
 *
 * Exported for the cases: every state is one line here, and a fixture can check that what this returns
 * RESOLVES in a real repository rather than that the sentence matches a string.
 */
export function returnRef(branch, described) {
  if (branch.branch) return branch.branch;
  if (described?.exact && described.name) return described.name;
  return branch.short;
}

/**
 * What U5 says on the detached path, to return to where this tree was.
 *
 * ARC-09-C194 — once the target's manifest is cached, `git checkout` back leaves the cache naming the target, so
 * integrity reads 'other' and every command is refused. From a release, the way back is the upgrade, which fetches,
 * verifies and caches that release's own; a tree that was not on one has no manifest to disagree with.
 *
 * ARC-09-C203 — UNLESS THE TARGET'S OWN CODE CANNOT RUN THAT UPGRADE. The printed upgrade runs under the target, and a
 * target below `distributionFrom` predates ARC-09-C192: it refuses a newer release's manifest. The D3 drill: from
 * v2.2.1-rc.2, `--to v2.2.0`, then the printed `upgrade --to v2.2.1-rc.2` was refused. Such a target is left by a fresh
 * install, which always works. A 2.2.1 release candidate compares below 2.2.1 and is counted with it.
 */
export function returnLine({ cli, here, target, manifest, returnTo, distributionFrom = DISTRIBUTION_FROM }) {
  if (!manifest || !here) return `HEAD is detached at ${target} — return with: git checkout ${returnTo}`;
  let below = false;
  try { below = compareSemver(target, distributionFrom) < 0; } catch { below = false; }
  return below
    ? `HEAD is detached at ${target} — ${target} checks releases by its own older rule: return to ${here} by a fresh `
      + 'install (docs/MIGRATION.md)'
    : `HEAD is detached at ${target} — return with: ${cli} upgrade --to ${here}`;
}

/**
 * U6 and U7 — the half that runs whether this is a move or a continuation.
 *
 * Extracted because an upgrade has two ways in: the ordinary one, which plans and moves the tree
 * first, and a RE-RUN after a step failed, where the tree is already at the target and planning a
 * move that has happened would be a lie in a box. Both end here, so both end the same way.
 */
export async function finish({ root, env, log, run, target, latest, remote, now, state,
  // ARC-07-C31 slice 4 — `platform` beside the `env` this already had; the two sentences below are a
  // terminal's, so the reader's own shell, and both come from ONE spelling rather than two calls.
  platform = process.platform,
  // ARC-09-C194 — --force-floor's promise kept: the target's bootstrap skips the Claude Code check it would refuse.
  skipClaudeCheck = false }) {
  const spell = spellings({ platform, env });
  log.step(stepLine(6, 'bootstrap (only the steps whose inputs changed)'));
  const mode = state?.mode === 'live' ? 'live' : 'design';
  const bootstrap = run(process.execPath, [join(root, 'tools/snowarch/bin/snowarch.mjs'),
    'bootstrap', '--mode', mode, '--yes', ...(skipClaudeCheck ? ['--skip-claude-check'] : [])],
  { cwd: root, stdio: 'inherit', env: childEnv(root, env) });
  if (bootstrap.status !== 0) {
    // ARC-09-C196 — not "the state file records the step": a bootstrap that died before its first entry, or was
    // killed, recorded none. The re-run is right either way, because the at-target path asks the plan.
    log.fail(`upgrade: the bootstrap stopped (exit ${bootstrap.status ?? 'abnormally'}) — the tree `
      + `is at ${target}; re-run ${spell.cli} upgrade or ${spell.bootstrap}`);
    return EXIT_FAIL;
  }

  // ── U7 the doctor, and the cache ──────────────────────────────────────────────────────────
  log.step(stepLine(7, 'doctor'));
  // Taken BEFORE the spawn, from the injected clock: the cache is only this run's if it was written
  // at or after this instant.
  const startedAt = Number(now());
  const doctor = run(process.execPath, [join(root, 'tools/snowarch/bin/snowarch.mjs'),
    'doctor', '--json', '--no-cache', '--write-cache'],
  { cwd: root, encoding: 'utf8', env: childEnv(root, env), stdio: ['ignore', 'pipe', 'pipe'] });
  let report = null;
  try { report = JSON.parse(doctor.stdout ?? ''); } catch { report = null; }

  // THE MODE LINE COMES FROM THE CACHE, NOT FROM THE `--json` STDOUT WE JUST PARSED.
  //
  // `<label>` is not an unfilled template: it is `LABEL_MASK` from `doctor/json-boundary.mjs`, and
  // masking `--json` is deliberate and right — that is the form which TRAVELS, an issue template
  // asks a stranger to paste it, so labels and hosts leave as `<label>` / `<host>`. U7 was printing
  // that copy to the user's own terminal, which is the one audience that owns the words: the owner
  // saw `instance=<label> (<label>)` here and `instance=pdi (pdi)` from `./snowarch doctor` a
  // second later (sitting, 2026-09-23).
  //
  // The unmasked line is already on disk and we already asked for it: `doctor/index.mjs` caches the
  // report BEFORE `maskForJson` runs, and the spawn above passes `--write-cache`. So this reads the
  // copy meant for this machine. No second doctor run, and no reconstruction of a line the doctor
  // owns — `modeLine` carries the preset and the doctor's own tally, which this command does not
  // know and must not invent.
  //
  // A MASK IS WORSE THAN SILENCE, so there is no fallback to `report.modeLine`: it reads as a value.
  // ...AND IT HAS TO BE THIS RUN'S. Reading the cache fixed the mask and opened this one step down:
  // the file is there on every bootstrapped tree, so a failed doctor — the upgrade that broke
  // something, when the closing line matters most — would be closed with yesterday's line as though
  // it had just been measured. ARC-07-C9's class (a recorded value rendered as fresh) one step from
  // where it was fixed, and the split B09 gets right.
  //
  // Four conditions, and each is a way the line could be about a different run: the doctor exited 0,
  // its report parsed, it did not report a `cacheError` (it tried to write and could not), and the
  // file is stamped at or after the moment we started it. Otherwise silence.
  const wroteThisRun = doctor.status === 0 && report !== null && !report.cacheError;

  // ARC-09-C56 — the lines UNDER the tally are this terminal's copy too, under the same binding.
  //
  // C53 fixed the Mode line and left these reading the masked stdout, and the REMEDY is the sharper
  // half of what that costs: a detail saying `<label>` is a fact rendered vaguely, but a remedy
  // saying `./snowarch instance test <label>` is a command-shaped string that FAILS when pasted —
  // in the one place the product is telling somebody what to do next.
  //
  // Falling back to the stdout rather than to silence, which is the opposite of the Mode line's
  // answer and deliberately so: a masked LINE still names the check, its status and its remedy's
  // shape, so it degrades to vague-but-true. A masked Mode line degrades to false, because
  // `instance=<label>` reads as the instance's name. Silence costs a reader the check entirely.
  const cachedChecks = wroteThisRun ? readCachedChecks(root, { notBefore: startedAt }) : null;
  for (const line of doctorLines(report, cachedChecks)) log.step(line);

  const cachedModeLine = wroteThisRun ? readCachedModeLine(root, { notBefore: startedAt }) : null;
  if (cachedModeLine) log.step(cachedModeLine);

  // ARC-09-C47 — NO CURRENCY VERDICT HERE. This used to write `behind: false` as a literal,
  // because an upgrade had just finished, and overwrite the measurement U7's doctor had made
  // moments earlier. An upgrade knows which tag it moved to; it does not know whether a newer
  // release exists, and it had not asked. It records what it did and leaves currency to the check
  // that defines it.
  writeUpgradeCheck(root, { localTag: target, remote, now, source: 'upgrade' });
  return EXIT_OK;
}
