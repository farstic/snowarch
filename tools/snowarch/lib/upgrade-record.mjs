// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-09-C199 — what an upgrade-check record says, for both of its readers.
//
// `.local/upgrade-check.json` has two readers. E-28 judged a record by three rules for "this is not a currency
// measurement" (ARC-09-C47) and one for "this release is already the newest" (ARC-09-C210); the SessionStart banner
// judged it by none, so a record an upgrade wrote, one carried from another tree, one naming a prerelease and one no
// newer than this release all nudged a checkout that was not behind, while E-28 said nothing of the kind. One judge
// now answers for both. Each reader says what `here` is, and that is the only thing they do differently.
//
// IMPORTS NOTHING. The banner loads this on its own path, on a 300 ms budget, so the two functions it needs from
// `semver.mjs` are carried here, and `tests/upgrade-record.test.mjs` holds them equal to the originals.

/** How old a record may be before it says nothing (ARC-09-S07): `upgrade-check.mjs`'s MAX_AGE_MS, held equal by a test. */
export const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** `semver.mjs`'s `parseSemver`, carried: `v2.1.0` → `[2,1,0]`, and a prerelease is marked rather than dropped. */
export function parseTag(tag) {
  const m = /^v(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(String(tag));
  if (!m) return null;
  return { tag, parts: [Number(m[1]), Number(m[2]), Number(m[3])], pre: m[4] ?? null };
}

const isNumeric = (id) => /^\d+$/.test(id);

/** `semver.mjs`'s `comparePre`, carried: two prerelease strings of the same triple, ascending (§11.4). */
function comparePre(a, b) {
  const x = a.split('.');
  const y = b.split('.');
  for (let i = 0; i < Math.max(x.length, y.length); i += 1) {
    if (i >= x.length) return -1;
    if (i >= y.length) return 1;
    if (x[i] === y[i]) continue;
    const [nx, ny] = [isNumeric(x[i]), isNumeric(y[i])];
    if (nx && ny) return Number(x[i]) < Number(y[i]) ? -1 : 1;
    if (nx !== ny) return nx ? -1 : 1;
    return x[i] < y[i] ? -1 : 1;
  }
  return 0;
}

/** `semver.mjs`'s `compareSemver`, carried: negative when `a` is older, and a throw for anything it cannot order. */
export function compareTags(a, b) {
  const [x, y] = [a, b].map((v) => {
    const s = String(v);
    const parsed = parseTag(s.startsWith('v') ? s : `v${s}`);
    if (!parsed) throw new Error(`semver: "${s}" is not a version this product can order`);
    return parsed;
  });
  for (let i = 0; i < 3; i += 1) if (x.parts[i] !== y.parts[i]) return x.parts[i] < y.parts[i] ? -1 : 1;
  if (x.pre === y.pre) return 0;
  if (x.pre === null) return 1;
  if (y.pre === null) return -1;
  return comparePre(x.pre, y.pre);
}

/**
 * What `record` says on a tree whose release is `here`.
 *
 * `here` is this tree's exact release tag, or null when that is not known. E-28 asks `git describe --tags
 * --exact-match`, and never under `--no-network`; the banner, which spawns nothing, reads the version of record and
 * has no answer on a development tree.
 *
 *   measurement  false when the record is not evidence about currency, and `why` is the rule's own sentence
 *   current      its `latestTag` is no newer than `here` (ARC-09-C210)
 *   speak        a fresh measurement that says behind, of a release newer than `here`: the one record that nudges
 *
 * `now` is epoch milliseconds, and a record from the future is not fresh: a clock that went backwards must not pin a
 * nudge on.
 */
export function recordSays(record, { here = null, now = Date.now(), maxAgeMs = MAX_AGE_MS } = {}) {
  const not = (why) => ({ speak: false, measurement: false, current: false, why });
  if (!record) return not(null);
  // 1. An upgrade wrote it. It knows which tag it moved to and never asked what exists.
  if (record.source === 'upgrade') return not("the last record is an upgrade's, not a currency check");
  // 2. It describes a tree this one is not, and says nothing when `here` is not known rather than guessing.
  if (record.localTag && here && record.localTag !== here) {
    return not(`stale record from an interrupted upgrade (it describes ${record.localTag}, this tree is ${here})`);
  }
  // 3. Its `latestTag` is a PRERELEASE, which a currency check's own live rule never stores, so the record cannot be
  //    a currency measurement, whoever wrote it and whether or not they stamped a source.
  if (record.latestTag && parseTag(record.latestTag)?.pre) {
    return not(`the last record names a prerelease (${record.latestTag}), which a currency check never stores`);
  }
  // ARC-09-C210 — a record no newer than this tree's release is up to date, whichever tree wrote it.
  let current = false;
  try { current = Boolean(here) && compareTags(record.latestTag, here) <= 0; } catch { current = false; }
  const at = Date.parse(record.checkedAt ?? '');
  const age = now - at;
  const fresh = !Number.isNaN(at) && age >= 0 && age < maxAgeMs;
  return { speak: record.behind === true && Boolean(record.latestTag) && !current && fresh,
    measurement: true, current, why: null };
}
