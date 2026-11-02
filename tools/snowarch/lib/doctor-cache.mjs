// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-06-S08 — `.local/doctor-last.json`: what the SessionStart banner reads.
//
// The banner has to print a verdict in under 300 ms, on a machine that may have no Node at all, so
// it cannot run checks — it reads the last ones. That makes this file a CONTRACT rather than a
// convenience: ARC-08-S01's schema may add keys, never rename these.
//
// It goes through the same write-time secret guard as the bootstrap state, and for the same reason:
// a step three stories from now will have a probe result it wants to keep, and the obvious place to
// put a URL is a `detail` string.
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { LEFT_OUT } from './doctor/left-out.mjs';
import { doctorCachePath, doctorInputsPath, localDir, localPathFrom } from './local-paths.mjs';
import { isSecretKey, redact } from './redact.mjs';
import { writeJsonAtomic } from './settings-local.mjs';

/**
 * `.local/` follows `SNOWARCH_STATE_ROOT` (ARC-07-C43); everything else is a file in the repository.
 *
 * PER-ENTRY rather than per-root, because this module addresses both kinds: `INPUT_FILES` below mixes
 * the store, the recorded mode and the licence, which are state, with `.mcp.json`, the settings files and
 * `engine.config.json`, which are the checkout. Moving all seven would make a redirected run compare
 * mtimes of files that are not there and re-run the doctor for ever.
 *
 * Named `pathIn` and not `at`: `cacheStale` below has a local `const at` for a parsed timestamp, and a
 * module helper shadowed by a local of the same name is a trap for whoever edits that block next.
 */
const pathIn = (root, ...parts) => localPathFrom(root, join(...parts));

export const CACHE_VERSION = 1;
export const CACHE_FILE = join('.local', 'doctor-last.json');
export const cachePath = doctorCachePath;

/**
 * The seven files whose mtime decides whether the cache still describes this checkout.
 *
 * MTIMES, not hashes: the banner has ~300 ms and no Node on some machines, and seven `stat` calls
 * are the cheapest question that can be asked. They are the seven inputs a doctor answer depends on
 * — the registration, both settings files, the store, the config, the recorded mode and the licence —
 * so a change to any of them is a reason to re-run rather than to read.
 *
 * ARC-11-C12 — the licence, because it decides E-31: a licence installed after the cache was written left
 * the banner on the cached E-31 FAIL for up to MAX_AGE_MS (the owner's rc.3 sitting). The revocation list is
 * NOT an input, though it decides E-31 too: every live start's background refresh rewrites its cache, so it
 * would re-run the doctor at every start. After a revocation lands, the cached Doctor line can show E-31 ok
 * for up to a day, while the banner's Licence line, read fresh, says revoked.
 */
export const INPUT_FILES = Object.freeze({
  mcpJsonMtime: ['.mcp.json'],
  settingsMtime: ['.claude', 'settings.json'],
  settingsLocalMtime: ['.claude', 'settings.local.json'],
  storeMtime: ['.local', 'instances.json'],
  engineConfigMtime: ['engine.config.json'],
  bootstrapStateMtime: ['.local', 'bootstrap-state.json'],
  licenceMtime: ['.local', 'licence.json'],
});

export const INPUTS_FILE = join('.local', 'doctor-last.inputs.json');
export const inputsPath = doctorInputsPath;

/** `{ mcpJsonMtime: 1757…, … }` — `null` for a file that is not there, which is itself an input. */
export function collectInputs(root, { stat = statSync, exists = existsSync } = {}) {
  const out = {};
  for (const [key, parts] of Object.entries(INPUT_FILES)) {
    const p = pathIn(root, ...parts);
    out[key] = exists(p) ? Math.round(stat(p).mtimeMs) : null;
  }
  return out;
}

/**
 * Is the cache still describing this checkout? ONE rule, for the banner (S08) and for `--fix` (F7).
 *
 * A missing inputs file is stale, not fresh: it means the cache was written by a build that did
 * not record what it depended on, and "assume fine" is exactly the failure R-14 describes.
 */
export function cacheStale(root, { now = Date.now(), maxAgeMs = null, read = readFileSync,
  exists = existsSync, inputs = null } = {}) {
  if (!exists(cachePath(root))) return { stale: true, reason: 'no cache' };
  if (!exists(inputsPath(root))) return { stale: true, reason: 'no inputs file' };
  let recorded;
  try {
    recorded = JSON.parse(read(inputsPath(root), 'utf8'));
  } catch {
    return { stale: true, reason: 'inputs file is not valid JSON' };
  }
  const current = inputs ?? collectInputs(root);
  for (const key of Object.keys(INPUT_FILES)) {
    if (recorded[key] !== current[key]) return { stale: true, reason: `${key} changed` };
  }
  if (maxAgeMs !== null) {
    try {
      const at = Date.parse(JSON.parse(read(cachePath(root), 'utf8')).at);
      if (Number.isFinite(at) && now - at > maxAgeMs) return { stale: true, reason: 'too old' };
    } catch {
      return { stale: true, reason: 'cache is not valid JSON' };
    }
  }
  return { stale: false, reason: null };
}

/**
 * The keys ARC-08 may rely on. Named here rather than left implicit, so a rename is a visible
 * change to a list rather than a silent break in a file nobody reads until the banner goes blank.
 */
export const COMPATIBILITY_KEYS = Object.freeze(['version', 'at', 'writer', 'mode', 'checks', 'summary']);

/**
 * ARC-09-C200 — the keys the DOCTOR's own cache carries: COMPATIBILITY_KEYS and `modeLine`, which
 * U7 reads from the cache its doctor wrote in this run. Not in COMPATIBILITY_KEYS, because every
 * writer must produce those, and the bootstrap's cache and the launchers' have no Mode line to write.
 */
export const REPORT_CACHE_KEYS = Object.freeze([...COMPATIBILITY_KEYS, 'modeLine']);

/** `{ ok, warn, fail }` from the checks themselves — never a count kept in parallel with them. */
export function summarise(checks) {
  const summary = { ok: 0, warn: 0, fail: 0 };
  for (const c of checks) if (c.status in summary) summary[c.status] += 1;
  return summary;
}

/**
 * Write the cache, 0600 and atomically.
 *
 * `writer` says who produced it — `bootstrap` here, `doctor` in ARC-08 — because a banner reading a
 * cache written by a run that skipped half the checks should be able to tell.
 */
export function writeDoctorCache(root, { mode, checks, engineVersion = null, contractSha = null,
  instance = null, server = null, writer = 'bootstrap', now = new Date() }) {
  const payload = {
    version: CACHE_VERSION,
    at: now.toISOString(),
    writer,
    engineVersion,
    contractSha,
    mode,
    ...(instance ? { instance } : {}),
    ...(server ? { server } : {}),
    checks,
    summary: summarise(checks),
  };
  // The cache's own guard, not the state file's — see `assertCacheStorable`. A secret-shaped key,
  // a redactable value or an instance address fails the write rather than reaching a file that,
  // unlike the store, things read casually. A documentation URL is allowed through and stored.
  assertCacheStorable(payload, 'doctor-last');
  mkdirSync(localDir(root), { recursive: true, mode: 0o700 });
  // 0600: it names a configured instance and its probe results. Not a secret, but not the sort of
  // thing another account on a shared machine has any business reading either.
  writeJsonAtomic(cachePath(root), payload, { mode: 0o600 });
  return payload;
}

/**
 * The report as this FILE may hold it — which is less than the report as a caller may read it.
 *
 * `server.instances[].username` is masked (`s***@corp.example.com`) and is still an ADDRESS
 * SHAPE, which the write-time guard refuses on sight — rightly: this file is read casually, pasted
 * into issues and copied between machines, and the guard's value is that it has no exceptions. The
 * banner does not need an account name to print a verdict, so the cache does not carry one. A live
 * `--json` run still returns it; a stored answer does not.
 *
 * Found the first time a CONFIGURED store met the cache: every live install would otherwise have
 * had no cache at all, and the banner no verdict to show.
 */
export function forStorage(report) {
  const server = report.server;
  if (!server?.instances?.length) return report;
  return {
    ...report,
    server: {
      ...server,
      instances: server.instances.map(({ username: _username, ...rest }) => rest),
    },
  };
}

/**
 * The cache's own storability guard — deliberately NOT the state file's.
 *
 * ARC-09-C9. `writeReportCache` used `assertStorable` from `state.mjs`, whose `URLISH` clause
 * refuses any `scheme://` at all. That is right for the state file, which records what was
 * configured and has no reason to quote prose. It is wrong for a doctor report, which
 * legitimately quotes documentation: E-00's remedy names the Claude Code install page, and a
 * missing corpus names the repo to clone. The consequence was not a redacted field, it was NO
 * CACHE AT ALL — the throw abandoned the whole write — so on any machine without Claude Code on
 * PATH every session paid the banner's re-run path and `/snowarch status` read nothing, silently.
 * Older than C8; C8 only exposed it, because the fixtures used to run `--quick`, which omits E-00.
 *
 * What the cache refuses:
 *   - a KEY that names a secret — exactly as the state file does;
 *   - a VALUE the redactor would rewrite — credentials, `KEY=value` text, addresses;
 *   - a VALUE carrying an INSTANCE URL. This clause is not redundant: `register()` is called only
 *     from `instance-file.mjs` and only for `password`/`clientSecret`, so an instance host is NOT
 *     registered and `redact()` returns it unchanged — measured, not assumed. Without this clause
 *     the cache would store `https://dev12345.service-now.com` verbatim.
 * Documentation URLs pass, and are stored verbatim; that is the point of the change.
 */
// The SHAPE, not one TLD: `service-now.<anything>` catches a real instance, a fixture's
// `service-now.invalid`, and a future domain nobody has told this file about. `servicenow.com`
// (no hyphen) is the product's documentation domain and is deliberately NOT here.
// Exported since ARC-08-C1: the `--json` boundary masks the same shape, and two definitions of
// "an instance address" would be two answers to the question this regex exists to settle.
export const INSTANCE_HOST = /\bhttps?:\/\/[^\s/?#]*\.(?:service-now\.[a-z]{2,}|servicenowservices\.com)\b/i;

export function cacheSensitiveValue(value) {
  if (typeof value !== 'string') return null;
  if (INSTANCE_HOST.test(value)) return 'it carries an instance address';
  if (redact(value) !== value) return 'the redactor would rewrite it';
  return null;
}

export function assertCacheStorable(value, path = 'doctor-last') {
  if (Array.isArray(value)) {
    value.forEach((v, i) => assertCacheStorable(v, `${path}[${i}]`));
    return value;
  }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (isSecretKey(k)) {
        throw new Error(`refusing to write ${path}.${k}: the key names a secret — `
          + 'the doctor cache holds a report, never a credential');
      }
      assertCacheStorable(v, `${path}.${k}`);
    }
    return value;
  }
  const why = cacheSensitiveValue(value);
  if (why) {
    throw new Error(`refusing to write ${path}: ${why} — `
      + 'the doctor cache may quote documentation, never a credential or an instance address');
  }
  return value;
}

/**
 * ARC-11-C7 — a check this run LEFT OUT by name keeps the verdict the last run that ran it cached.
 *
 * The SessionStart banner's re-run leaves out E-32, which reads every covered file, and the banner then prints the
 * verdict `status` or `doctor --quick` cached. Without this, the banner's own run would overwrite that verdict with a
 * skip, and the next session would have nothing to print. A check no earlier run cached stays the skip it is.
 */
function carryLeftOut(checks, previous) {
  const before = new Map((previous?.checks ?? []).filter((c) => c?.detail !== LEFT_OUT).map((c) => [c.id, c]));
  return checks.map((c) => (c.detail === LEFT_OUT && before.has(c.id) ? before.get(c.id) : c));
}

const readPrevious = (root) => {
  try { return JSON.parse(readFileSync(cachePath(root), 'utf8')); } catch { return null; }
};

export function writeReportCache(root, report, { writer = 'doctor', now = new Date() } = {}) {
  const stored = forStorage(report);
  const payload = {
    version: CACHE_VERSION,
    at: (now instanceof Date ? now : new Date(now)).toISOString(),
    writer,
    engineVersion: report.version ?? null,
    contractSha: report.engine?.contractSha ?? null,
    mode: report.mode ?? null,
    modeLine: report.modeLine ?? null,
    ...(stored.server ? { server: stored.server } : {}),
    checks: carryLeftOut((stored.checks ?? []).map(({ id, status, detail, remedy = null }) =>
      ({ id, status, detail, ...(remedy ? { remedy } : {}) })), readPrevious(root)),
    summary: stored.summary ?? summarise(stored.checks ?? []),
    report: stored,
  };
  assertCacheStorable(payload, 'doctor-last');
  mkdirSync(localDir(root), { recursive: true, mode: 0o700 });
  writeJsonAtomic(cachePath(root), payload, { mode: 0o600 });
  const inputs = collectInputs(root);
  writeJsonAtomic(inputsPath(root), inputs, { mode: 0o600 });
  return { payload, inputs };
}
