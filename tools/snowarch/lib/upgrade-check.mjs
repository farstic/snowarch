// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * `.local/upgrade-check.json` — what the banner reads, and what nobody else may make it do.
 *
 * ARC-09-S07. The banner's contract is the point of this file: the SessionStart hook must be able
 * to say "a newer release exists" in under 300 ms on a machine that may have no Node, which means
 * it cannot fetch, cannot ask git, and cannot wait. So it reads ONE file that somebody else wrote
 * — `upgrade`, `upgrade --check`, or E-28 — and the writing is always a thing the user started.
 *
 * Three keys are the hook's contract and may never be renamed: `behind`, `latestTag`, `checkedAt`
 * (ARC-08-S08). The rest is this story's superset, for a reader who runs `cat` on it and for
 * `--check`'s own output. A file is not a promise that a fetch ever succeeded: `behind: false`
 * with a `checkedAt` from last month is the honest answer "nothing has been checked lately", and
 * the FRESHNESS rule below is what turns it into silence rather than into a stale nudge.
 */
import { chmodSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { upgradeCheckPath } from './local-paths.mjs';

export const CACHE_FILE = join('.local', 'upgrade-check.json');

/**
 * How old a check may be before the banner stops mentioning it.
 *
 * Seven days, and the direction matters: an EXPIRED cache produces no nudge, never a nudge with a
 * caveat. A banner that says "a newer release is available (probably, a fortnight ago)" is a line
 * a reader learns to ignore, and then the one that matters is ignored too.
 */
export const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** How often the doctor's release-currency check may refresh it. */
export const REFRESH_AFTER_MS = 24 * 60 * 60 * 1000;

// ARC-07-C43 head 2 — `local-paths.mjs` owns it; `writeUpgradeCheck` creates `dirname(path)`.
export const cachePath = upgradeCheckPath;

/** The cache, or `null`. A malformed file is an absent one — never a crash in a hook. */
export function readUpgradeCheck(root) {
  try {
    const raw = JSON.parse(readFileSync(cachePath(root), 'utf8'));
    return raw && typeof raw === 'object' && typeof raw.behind === 'boolean' ? raw : null;
  } catch { return null; }
}

/** Is this cache recent enough to say anything with? */
export function isFresh(cache, { now = () => new Date(), maxAgeMs = MAX_AGE_MS } = {}) {
  if (!cache?.checkedAt) return false;
  const at = Date.parse(cache.checkedAt);
  if (Number.isNaN(at)) return false;
  const age = now().getTime() - at;
  // A cache from the FUTURE is not fresh either: a clock that moved backwards would otherwise
  // pin a nudge on for ever.
  return age >= 0 && age < maxAgeMs;
}

/** Should the doctor spend a fetch on this? */
export const needsRefresh = (cache, { now = () => new Date(), afterMs = REFRESH_AFTER_MS } = {}) =>
  !isFresh(cache, { now, maxAgeMs: afterMs });

/**
 * Write it, atomically, 0600.
 *
 * 0600 for the same reason every other `.local/` file is: this one carries a remote name, and a
 * remote can carry a username. Atomic because a hook reads it on every session start, and a
 * half-written file read at the wrong moment is a session that starts with a parse error.
 */
export function writeUpgradeCheck(root, { latestTag = null, localTag = null, localDistance = null,
  behind = false, remote = 'origin', source = 'currency', now = () => new Date() } = {}) {
  const body = {
    checkedAt: now().toISOString(),
    remote,
    localTag,
    localDistance,
    latestTag,
    behind,
    // ARC-09-C47 — WHO WROTE THIS, and therefore what it is evidence of.
    //
    // Three writers share this file and they do not all measure currency. E-28 and the plan phase
    // fetch the tags and compare; `finish()` wrote `behind: false` as a literal because an upgrade
    // had just happened. A reader could not tell a measurement from an assertion, so it reported
    // the assertion as currency for 24 hours.
    //
    // Not a renamed key and not a repurposed one: `behind`, `latestTag` and `checkedAt` are the
    // hook's frozen contract (ARC-08-S08) and are untouched. Omitting `latestTag` instead would
    // have been read as "a check ran and found no releases" — the ARC-09-C32 branch — which is a
    // different false statement, quieter than the one being removed.
    source,
  };
  const path = cachePath(root);
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const tmp = `${path}.tmp-${process.pid}`;
  writeFileSync(tmp, `${JSON.stringify(body, null, 2)}\n`, { mode: 0o600 });
  renameSync(tmp, path);
  if (process.platform !== 'win32') chmodSync(path, 0o600);
  return body;
}
