// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * The annotated tag's message: built here, and parsed here.
 *
 * ARC-09-S01. The tag is the only artefact that outlives the working tree — a release downloaded
 * six months later is a tarball and a tag, and everything a verifier needs about what was released
 * has to be readable from it. So the message carries the contract sha, the docs pin and the three
 * floors, and `./snowarch version` (S04), `release.yml` (S03) and `./snowarch upgrade` (S07) all
 * read them back through `parseTagMessage` rather than each writing its own parser against a shape
 * they would eventually disagree about.
 *
 * The two functions are a round trip, asserted as one in `tests/release.test.mjs`: a builder whose
 * output its own parser cannot read is the failure mode that would only surface in S07, on a user's
 * machine, during an upgrade.
 */

/** The trailer order the story fixes, and the order `git show` will print. */
export const TRAILERS = Object.freeze(['contract', 'docs-pin', 'claude-floor', 'node-floor', 'git-floor']);

const SHA256 = /^[0-9a-f]{64}$/;
const SHA1 = /^[0-9a-f]{40}$/;

/**
 * Six lines: the subject, a blank, and the five trailers.
 *
 * Validated rather than trusted. A tag is created once and read for years; a `contract:` line
 * holding an empty string, or a `docs-pin:` holding an abbreviated sha, is a tag that looks right
 * in `git show` and answers no question a verifier asks.
 */
export function buildTagMessage({ version, contract, docsPin, floors }) {
  if (!version) throw new Error('tag: no version');
  if (!SHA256.test(String(contract ?? ''))) {
    throw new Error(`tag: contract is not a sha256: ${JSON.stringify(contract)}`);
  }
  if (!SHA1.test(String(docsPin ?? ''))) {
    throw new Error(`tag: docs-pin is not a 40-hex gitlink: ${JSON.stringify(docsPin)}`);
  }
  for (const key of ['claudeCode', 'node', 'git']) {
    if (!floors?.[key]) throw new Error(`tag: floors.${key} is missing`);
  }
  return [
    `snowarch v${version}`,
    '',
    `contract: ${contract}`,
    `docs-pin: ${docsPin}`,
    `claude-floor: ${floors.claudeCode}`,
    `node-floor: ${floors.node}`,
    `git-floor: ${floors.git}`,
    '',
  ].join('\n');
}

/**
 * The message, read back. Returns `null` when the text is not one of ours.
 *
 * Tolerant about what surrounds it and strict about what it extracts: `git show` prints the message
 * inside a commit-shaped page, `git tag -l --format=%(contents)` prints it bare, and a caller
 * should not have to know which it has. What it will not do is guess — a missing trailer comes back
 * absent rather than as an empty string that a comparison would silently accept.
 */
export function parseTagMessage(text) {
  if (typeof text !== 'string' || text.length === 0) return null;
  const version = /^snowarch v(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)\s*$/m.exec(text)?.[1];
  if (!version) return null;

  const trailer = (name) => new RegExp(`^${name}:[ \\t]*(\\S+)\\s*$`, 'm').exec(text)?.[1];
  const contract = trailer('contract');
  const docsPin = trailer('docs-pin');
  const floors = {
    claudeCode: trailer('claude-floor'),
    node: trailer('node-floor'),
    git: trailer('git-floor'),
  };
  return {
    version,
    ...(contract ? { contract } : {}),
    ...(docsPin ? { docsPin } : {}),
    floors: Object.fromEntries(Object.entries(floors).filter(([, v]) => v !== undefined)),
  };
}

/** What a reader needs before it trusts a tag: every mandatory field, in the right shape. */
export function tagIsComplete(parsed) {
  return Boolean(parsed
    && SHA256.test(parsed.contract ?? '')
    && SHA1.test(parsed.docsPin ?? '')
    && parsed.floors?.claudeCode && parsed.floors?.node && parsed.floors?.git);
}

/**
 * Is this tag a prerelease?
 *
 * ARC-09-C22. The Release for `v2.0.0-rc.0` was created with `prerelease=false`, so a rehearsal tag
 * sat in the Releases list looking exactly like a shipped version — and "Latest" is what a reader
 * of a repository's Releases page trusts. Semver §9: a prerelease is a version with a hyphen and a
 * dot-separated identifier after the patch number. The tag's leading `v` is optional here because
 * every caller has one and forgetting to strip it would silently answer "not a prerelease".
 */
export function isPrerelease(tag) {
  return /^v?\d+\.\d+\.\d+-[0-9A-Za-z.]+$/.test(String(tag).trim());
}
