// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-11-C1 — the revocation list, fetched by git over HTTPS from its explicit URL (ruling (b), R2).
 *
 * WHERE. `engine.config.json` → `licence.revocations { repo, ref, path }`: by default the public
 * repository `farstic/snowarch-licences`, branch `main`, file `revocations.json`. An `owner/name` is
 * GitHub over HTTPS; anything else is used as written, which is how the tests point at a local bare
 * repository. Never `origin`: a fork's own remote must not be able to substitute its list.
 *
 * WHEN. Only when somebody asked: `licence check --refresh`, `upgrade` and `upgrade --check` (with a
 * licence installed), and every live server start with a licence installed (the architect's ruling
 * (a): "revoke → it stops at the next start"). The SessionStart hook never fetches.
 *
 * THREE OUTCOMES, kept apart:
 *   fetched     — the branch and the file are there. The text is returned UNVERIFIED; `refreshList`
 *                 verifies it before anything uses it.
 *   none        — the repository answered with no `ref` branch, or no file on it. That is the owner's
 *                 new, empty repository before the first push: "no list", silently.
 *   unreachable — offline, a wrong URL, a proxy, the time budget spent. The cached list stands.
 *
 * NEVER A PROMPT. A public repository needs no credentials, so git is denied every way of asking for
 * one: no terminal prompt, no askpass program, no credential helper (a GUI helper on Windows would
 * open a window from a background refresh). A repository that wants a password is unreachable.
 *
 * The server keeps its own copy, asynchronous and on a 3-second budget; the outcomes and the cache
 * rules are the same.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { newerList, readList } from './core.mjs';
import { PRODUCT_KEYS } from './keys.mjs';
import { readManifest, writeManifestCache } from './manifest.mjs';
import { heldList, readLicenceText, readListCache, writeListCache } from './state.mjs';
import { NO_PROMPT_ENV } from '../spawn-env.mjs';
import { which } from '../which.mjs';

/** The CLI's whole budget for one fetch, across its three git calls. */
export const FETCH_BUDGET_MS = 15_000;

const NO_HELPER = Object.freeze(['-c', 'credential.helper=']);
const OWNER_NAME = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;

/** `owner/name` is GitHub over HTTPS; anything else is a URL or path, used as written. */
export const repoUrl = (repo) => (OWNER_NAME.test(repo) ? `https://github.com/${repo}.git` : repo);

/** `{ url, ref, path }` from the config, or `null` when no list is configured. */
export function listSource(config) {
  const r = config?.licence?.revocations;
  if (!r || typeof r !== 'object' || typeof r.repo !== 'string' || r.repo === '') return null;
  return {
    url: repoUrl(r.repo),
    ref: typeof r.ref === 'string' && r.ref !== '' ? r.ref : 'main',
    path: typeof r.path === 'string' && r.path !== '' ? r.path : 'revocations.json',
  };
}

const firstLine = (r) => String(r.stderr || r.error?.message || 'git failed').trim().split('\n')[0];

/** Fetch the list's text. Never throws; see the header for the three outcomes. */
export function fetchList({ url, ref = 'main', path = 'revocations.json', timeoutMs = FETCH_BUDGET_MS,
  env = process.env, run = spawnSync } = {}) {
  const deadline = Date.now() + timeoutMs;
  const git = which('git', { env }) ?? 'git';
  const childEnv = { ...env, ...NO_PROMPT_ENV };
  const step = (args) => {
    const left = deadline - Date.now();
    if (left <= 0) return { status: null, stdout: '', stderr: `no answer within ${timeoutMs} ms` };
    return run(git, [...NO_HELPER, ...args], { env: childEnv, encoding: 'utf8', timeout: left,
      stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  };

  const heads = step(['ls-remote', url, `refs/heads/${ref}`]);
  if (heads.status !== 0) return { status: 'unreachable', detail: firstLine(heads) };
  if (String(heads.stdout ?? '').trim() === '') return { status: 'none', detail: `no ${ref} branch yet` };

  const tmp = mkdtempSync(join(tmpdir(), 'snowarch-licences-'));
  try {
    const dest = join(tmp, 'list');
    const clone = step(['clone', '--quiet', '--depth', '1', '--branch', ref, '--single-branch', '--no-tags',
      '--no-checkout', url, dest]);
    if (clone.status !== 0) return { status: 'unreachable', detail: firstLine(clone) };
    const show = step(['-C', dest, 'show', `HEAD:${path}`]);
    // No exit status: the deadline killed it, or left it no time to run. The repository never answered, so
    // nothing was checked (ARC-11-C11). A status means git answered: the file is not on the branch.
    if (show.status === null) return { status: 'unreachable', detail: firstLine(show) };
    if (show.status !== 0) return { status: 'none', detail: `no ${path} on ${ref} yet` };
    return { status: 'fetched', text: String(show.stdout) };
  } finally {
    rmSync(tmp, { recursive: true, force: true, maxRetries: 3 });
  }
}

/**
 * Fetch, verify and cache. Never throws and never fails anything: every outcome is a value.
 *
 *   updated     — a verified list with a higher version than the one held; it is now the cache.
 *   unchanged   — the same version as the one held.
 *   older       — a lower version: ignored (rollback protection), the held list stays.
 *   none        — nothing published yet; the held list, if any, stays.
 *   refused     — published, but it does not verify; ignored, and the cache is not touched.
 *   unreachable — the cache is not touched, not even its date: nothing was checked.
 *   unconfigured — no list in the config; nothing was fetched.
 */
export function refreshList(root, { config, keys = PRODUCT_KEYS, now = new Date(), env = process.env,
  timeoutMs = FETCH_BUDGET_MS, fetcher = fetchList } = {}) {
  const source = listSource(config);
  if (!source) return { outcome: 'unconfigured', version: null };
  const cache = readListCache(root);
  const held = heldList(cache, keys);
  const result = fetcher({ ...source, timeoutMs, env });
  const write = (list) => writeListCache(root, { list, checkedAt: now.toISOString(),
    source: `${source.url} ${source.ref}:${source.path}` });

  if (result.status === 'unreachable') return { outcome: 'unreachable', version: held?.version ?? null, detail: result.detail };
  if (result.status === 'none') {
    write(held ? cache.list : null);
    return { outcome: 'none', version: held?.version ?? null };
  }
  const fetched = readList(result.text, { keys });
  if (!fetched.ok) return { outcome: 'refused', version: held?.version ?? null, reason: fetched.reason };
  if (newerList(held, fetched) === fetched) {
    write(JSON.parse(result.text));
    return { outcome: 'updated', version: fetched.version, previous: held?.version ?? null };
  }
  write(cache.list);
  return { outcome: fetched.version === held.version ? 'unchanged' : 'older', version: held.version,
    fetchedVersion: fetched.version };
}

/** What a refresh did, in one line — `licence check --refresh` and `upgrade` print the same words. */
const SAYS = {
  updated: (r) => `revocation list: version ${r.version} fetched${r.previous ? ` (it was version ${r.previous})` : ''}`,
  unchanged: (r) => `revocation list: version ${r.version}, unchanged`,
  older: (r) => `revocation list: the published list (version ${r.fetchedVersion}) is older than the one held `
    + `(version ${r.version}) — ignored`,
  none: (r) => `revocation list: no revocation list is published yet${r.version ? ` — kept version ${r.version}` : ''}`,
  refused: (r) => `revocation list: the published list does not verify (${r.reason}) — ignored`,
  unreachable: (r) => `revocation list: could not be reached (${r.detail}) — `
    + `${r.version ? `kept version ${r.version}` : 'none held'}`,
  unconfigured: () => 'revocation list: none configured (engine.config.json → `licence.revocations`)',
};
export const refreshSays = (r) => SAYS[r.outcome](r);

/**
 * `upgrade` and `upgrade --check` refresh the list as well — but ONLY WHEN A LICENCE IS INSTALLED.
 *
 * With no licence there is nothing a list could revoke, so the fetch would be a network call and a
 * line of output for nothing; and "everything keeps working exactly as now" is the owner's first
 * requirement, so a checkout with no licence upgrades exactly as it did before ARC-11. Never fails the
 * upgrade: every outcome is one line.
 */
export function refreshWithUpgrade(root, { config, env = process.env, now = new Date(), log, keys = PRODUCT_KEYS,
  fetcher = fetchList } = {}) {
  if (readLicenceText(root) === null) return null;
  const r = refreshList(root, { config, keys, now, env, fetcher });
  if (r.outcome !== 'unconfigured') log.step(refreshSays(r));
  return r;
}

// ── ARC-11-C7 — a release's signed manifest, over the same transport ───────────────────────────────────────────────

/**
 * `{ url, ref, dir }` for the release manifests, or `null`. `licence.manifests` when the config names one; otherwise
 * the revocation list's repository and branch with `releases/`, because the owner signs both into one repository. A
 * manifest is `<dir>/<tag>.json`.
 */
export function manifestSource(config) {
  const own = config?.licence?.manifests;
  const named = (r) => r && typeof r === 'object' && typeof r.repo === 'string' && r.repo !== '';
  const from = named(own) ? own : (named(config?.licence?.revocations) ? config.licence.revocations : null);
  if (!from) return null;
  return {
    url: repoUrl(from.repo),
    ref: typeof from.ref === 'string' && from.ref !== '' ? from.ref : 'main',
    dir: from === own && typeof own.dir === 'string' && own.dir !== '' ? own.dir : 'releases',
  };
}

/**
 * Fetch `tag`'s signed manifest, verify it, and cache it. Never throws; every outcome is a value:
 *
 *   fetched      — it verifies and it is `tag`'s; it is now the cache, unless `write` is false;
 *   none         — no manifest is published for `tag`;
 *   refused      — one is published and it does not verify, or it is another release's: ignored, the cache untouched;
 *   unreachable  — the cache untouched;
 *   unconfigured — no repository in the config.
 *
 * `write: false` verifies without caching, and returns the entry: `upgrade` reads the TARGET's at U4, before the tree
 * moves, and caches it once the tree is the target.
 */
export function refreshManifest(root, { config, tag, keys = PRODUCT_KEYS, now = new Date(), env = process.env,
  timeoutMs = FETCH_BUDGET_MS, fetcher = fetchList, write = true } = {}) {
  const source = manifestSource(config);
  if (!source) return { outcome: 'unconfigured', tag };
  const path = `${source.dir}/${tag}.json`;
  const result = fetcher({ url: source.url, ref: source.ref, path, timeoutMs, env });
  if (result.status === 'unreachable') return { outcome: 'unreachable', tag, detail: result.detail };
  if (result.status === 'none') return { outcome: 'none', tag };
  const read = readManifest(result.text, { keys });
  if (!read.ok) return { outcome: 'refused', tag, reason: read.reason };
  if (read.manifest.tag !== tag) return { outcome: 'refused', tag, reason: `it is ${read.manifest.tag}'s` };
  const entry = { tag, doc: JSON.parse(result.text), checkedAt: now.toISOString(), source: `${source.url} ${source.ref}:${path}` };
  if (write) writeManifestCache(root, entry);
  return { outcome: 'fetched', tag, files: Object.keys(read.manifest.files).length, entry };
}

/** What a manifest refresh did, in one line: the bootstrap, `licence check --refresh` and `upgrade` print it. */
const MANIFEST_SAYS = {
  fetched: (r) => `release manifest: ${r.tag} fetched (${r.files} file${r.files === 1 ? '' : 's'})`,
  none: (r) => `release manifest: none is published for ${r.tag}`,
  refused: (r) => `release manifest: the one published for ${r.tag} does not verify (${r.reason}) — ignored`,
  unreachable: (r) => `release manifest: could not be reached (${r.detail})`,
  unconfigured: () => 'release manifest: none configured (engine.config.json → licence)',
};
export const manifestSays = (r) => MANIFEST_SAYS[r.outcome](r);
