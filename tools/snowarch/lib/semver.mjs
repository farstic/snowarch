// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * One version comparator, for every place this product decides which release is newer.
 *
 * ARC-09-S12. `rehearse.sh 2.0.0-rc.10` refused to cut the release:
 *
 *   release: 2.0.0-rc.10 is not greater than the latest tag v2.0.0-rc.9
 *
 * The prerelease part was compared as a string, and `"rc.10" < "rc.9"` because `1` sorts before
 * `9`. Two copies had it — `compareVersions` in `scripts/lib/release/preflight.mjs` and `sortTags`
 * in `tools/snowarch/lib/commands/upgrade.mjs` — written independently, wrong identically, which is
 * what a rule stated twice does. The release check was the loud one; the quiet one was worse:
 * `sortTags` is what `./snowarch upgrade --pre` uses to pick the target, so a checkout on rc.9
 * would have been told rc.9 was the newest and never offered rc.10, and `E-28` would have agreed
 * with it because it reads the same order.
 *
 * So the rule lives here once, and both call sites import it. It is the rule from the
 * specification, not an approximation that happens to sort our tags:
 *
 *   §11.2  major, minor and patch compare numerically.
 *   §11.3  a version WITH a prerelease is lower than the same triple without one.
 *   §11.4  prerelease identifiers compare field by field —
 *            numeric fields numerically,
 *            alphanumeric fields lexically in ASCII order,
 *            a numeric field is ALWAYS lower than an alphanumeric one,
 *            and when every preceding field is equal, more fields beats fewer.
 *
 * Build metadata (`+…`) is deliberately absent: §10 says it is ignored for precedence, and this
 * product has never tagged one. A parser that silently accepted and ranked it would be inventing an
 * order the specification says does not exist.
 */

/** `v2.1.0` → `[2,1,0]`, and a prerelease is marked rather than dropped. */
export function parseSemver(tag) {
  const m = /^v(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(String(tag));
  if (!m) return null;
  return { tag, parts: [Number(m[1]), Number(m[2]), Number(m[3])], pre: m[4] ?? null };
}

/** Digits only — §11.4.1's "numeric identifier". `-` and letters make it alphanumeric. */
const isNumeric = (id) => /^\d+$/.test(id);

/**
 * §11.4 — the prerelease strings of two versions with the SAME triple. Ascending.
 *
 * Both callers have already established the triples are equal and that neither side is a release,
 * so this answers only the question the specification's own example is about:
 * `alpha < alpha.1 < alpha.beta < beta < beta.2 < beta.11 < rc.1`.
 */
export function comparePre(a, b) {
  const x = a.split('.');
  const y = b.split('.');
  for (let i = 0; i < Math.max(x.length, y.length); i += 1) {
    // "a larger set of pre-release fields has a higher precedence than a smaller set, if all of the
    // preceding identifiers are equal" — reaching the end of one list IS the comparison.
    if (i >= x.length) return -1;
    if (i >= y.length) return 1;
    if (x[i] === y[i]) continue;
    const [nx, ny] = [isNumeric(x[i]), isNumeric(y[i])];
    // THE BUG THIS FILE EXISTS FOR. `10` and `9` as strings put `10` first; as numbers they do not.
    if (nx && ny) return Number(x[i]) < Number(y[i]) ? -1 : 1;
    // "Numeric identifiers always have lower precedence than non-numeric identifiers."
    if (nx !== ny) return nx ? -1 : 1;
    return x[i] < y[i] ? -1 : 1;
  }
  return 0;
}

/**
 * Ascending: negative when `a` is older. Accepts `v2.0.0-rc.9` or `2.0.0-rc.9`.
 *
 * Throws on anything it cannot parse rather than ranking it. A comparator that returns `0` for a
 * string it did not understand reports "these are the same version", and `Array.sort` will believe
 * it — the failure would surface as a release ordered wrongly, nowhere near the unparsed input.
 */
export function compareSemver(a, b) {
  const [x, y] = [a, b].map((v) => {
    const s = String(v);
    const parsed = parseSemver(s.startsWith('v') ? s : `v${s}`);
    if (!parsed) throw new Error(`semver: "${s}" is not a version this product can order`);
    return parsed;
  });
  for (let i = 0; i < 3; i += 1) if (x.parts[i] !== y.parts[i]) return x.parts[i] < y.parts[i] ? -1 : 1;
  if (x.pre === y.pre) return 0;
  // §11.3 — a release outranks every prerelease of the same triple.
  if (x.pre === null) return 1;
  if (y.pre === null) return -1;
  return comparePre(x.pre, y.pre);
}

/** Highest first — the order the upgrade command and the doctor read a tag list in. */
export function sortTags(tags) {
  return tags.map(parseSemver).filter(Boolean).sort((a, b) => compareSemver(b.tag, a.tag));
}
