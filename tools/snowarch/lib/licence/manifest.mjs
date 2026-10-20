// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-11-C7 — the build-integrity manifest: what a release ships, signed, and a tree checked against it.
 *
 * A MANIFEST FILE is `{ format, manifest, signature }`, signed as a licence is: an Ed25519 signature over the
 * canonical JSON of `manifest` alone, by a key the product ships (`core.mjs`). The body is
 *
 *   tag       the release tag, `v<version>`;
 *   commit    the commit the tag names;
 *   covers    what is covered: a path ending in `/` is a directory and everything under it, any other is one file;
 *   excludes  directories under a covered one that are not covered (`tools/snowarch/tests/`);
 *   ignores   basenames that are never the product's, written by an operating system rather than by anyone
 *             changing the product (`.DS_Store`);
 *   files     every covered file, its path relative to the root with `/` separators, mapped to the sha256 of its
 *             bytes as hex.
 *
 * THE COVERAGE IS SIGNED. A tree is checked against the `covers`, `excludes` and `ignores` its manifest carries, not
 * against what this file says today, so a later release can change the coverage without making an older one fail.
 *
 * THE BYTES ARE A CHECKOUT'S, never git's blobs. `.gitattributes` makes every covered text file LF on every platform
 * and `*.ps1` CRLF, so a checkout on any of the three writes the same bytes, and those are the bytes `git archive`
 * writes too. The signer reads them from `git archive <tag>`, parsed here, with no temporary tree. The content is
 * all that is hashed: a mode bit is not, because Windows has none (the architect's rulings, 2026-10-13).
 *
 * MODIFIED is any difference: a covered file whose bytes differ, a covered file that is gone, and a file under a
 * covered directory that the manifest does not list. `.claude/skills` and `.claude/agents` are the product's roster,
 * and a user's own work lives under `clients/` and in project rules, never in the roster.
 */
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { releaseManifestPath } from '../local-paths.mjs';
import { signBody } from './core.mjs';
import {
  COVERAGE, MANIFEST_FORMAT, hashBytes, isCovered,
} from '../../../../packages/snowarch/dist/licence/integrity.js';

/**
 * ARC-11-C141 — THE READING HALF IS THE SERVER BUILD'S, re-exported here so every engine caller keeps its import
 * (the architect's ruling Q1: one verifier, by identity, not a parity pair). What stays below is the signer's half:
 * the tar reader, the manifest made from `git archive`, the signature, the push gate's comparison, and the cache's
 * writer. A caller under `SNOWARCH_STATE_ROOT` passes `local: localDir(root)` to the readers.
 */
export {
  COVERAGE, MANIFEST_FORMAT, cachedManifest, checkTree, hashBytes, integrityLine, integrityRemedy, integrityStatus,
  isCovered, isDevVersion, readManifest, readManifestCache, releaseTagOf, tagCommit,
} from '../../../../packages/snowarch/dist/licence/integrity.js';

/** A full commit sha, as `git rev-parse` prints it. */
const COMMIT = /^[0-9a-f]{40}$/;

/** A manifest file's content: the format, the manifest, and its signature. */
export const signManifest = (manifest, privateKeyPem) => ({
  format: MANIFEST_FORMAT, manifest, signature: signBody(manifest, privateKeyPem),
});

// ── The signer's side: `git archive <tag>`, read without a temporary tree ─────────────────────────────────────────

const field = (block, start, length) => {
  const raw = block.subarray(start, start + length);
  const end = raw.indexOf(0);
  return raw.subarray(0, end === -1 ? raw.length : end).toString('utf8');
};

/** `key=value` records from a pax header's data: `<length> <key>=<value>\n`, repeated. */
function paxRecords(data) {
  const out = {};
  let at = 0;
  while (at < data.length) {
    const space = data.indexOf(0x20, at);
    if (space === -1) break;
    const length = Number(data.subarray(at, space).toString('utf8'));
    if (!Number.isInteger(length) || length <= 0) break;
    const record = data.subarray(space + 1, at + length - 1).toString('utf8');
    const eq = record.indexOf('=');
    if (eq !== -1) out[record.slice(0, eq)] = record.slice(eq + 1);
    at += length;
  }
  return out;
}

/**
 * Every entry of a tar stream, as `{ path, type, data }`: what `git archive --format=tar` writes, a pax global
 * header, ustar entries, and a pax extended header where a path does not fit.
 */
export function tarEntries(buffer) {
  const entries = [];
  let at = 0;
  let pending = {};
  while (at + 512 <= buffer.length) {
    const block = buffer.subarray(at, at + 512);
    if (block.every((b) => b === 0)) break;
    const size = Number.parseInt(field(block, 124, 12).trim() || '0', 8);
    const type = String.fromCharCode(block[156] || 0x30);
    const data = buffer.subarray(at + 512, at + 512 + size);
    at += 512 + Math.ceil(size / 512) * 512;
    if (type === 'g') continue;
    if (type === 'x') { pending = paxRecords(data); continue; }
    const prefix = field(block, 345, 155);
    const name = field(block, 0, 100);
    const path = pending.path ?? (prefix ? `${prefix}/${name}` : name);
    pending = {};
    entries.push({ path, type, data });
  }
  return entries;
}

/**
 * The manifest body for `tag`, from `git archive` in `root`: the bytes a checkout of the tag writes. Throws when
 * git cannot read the tag, and when a covered path is anything but a regular file — a link would hash as its
 * target's text in the archive and as its target's bytes in a checkout, so no one manifest could hold it.
 */
export function manifestFromArchive(root, tag, { coverage = COVERAGE, run = spawnSync } = {}) {
  const git = (args, opts = {}) => run('git', args, { cwd: root, maxBuffer: 1 << 28, ...opts });
  const commit = String(git(['rev-parse', '--verify', '--quiet', `${tag}^{commit}`], { encoding: 'utf8' }).stdout ?? '').trim();
  if (!COMMIT.test(commit)) throw new Error(`no commit named ${tag} here`);
  // Only the covered paths the tag has: `git archive` refuses a pathspec that matches nothing, and a tree may lack one.
  const specs = coverage.covers.map((c) => c.replace(/\/$/, ''));
  const present = String(git(['ls-tree', '--name-only', '-z', commit, '--', ...specs], { encoding: 'utf8' }).stdout ?? '')
    .split('\0').filter(Boolean);
  const files = {};
  if (present.length === 0) {
    return { tag, commit, covers: [...coverage.covers], excludes: [...coverage.excludes], ignores: [...coverage.ignores],
      files };
  }
  const archive = git(['archive', '--format=tar', commit, '--', ...present]);
  if (archive.status !== 0) throw new Error(`git archive ${tag} failed: ${String(archive.stderr ?? '').trim()}`);
  for (const entry of tarEntries(archive.stdout)) {
    if (entry.type === '5' || !isCovered(entry.path, coverage)) continue;
    if (entry.type !== '0') throw new Error(`${entry.path} is not a regular file in ${tag}`);
    files[entry.path] = hashBytes(entry.data);
  }
  return { tag, commit, covers: [...coverage.covers], excludes: [...coverage.excludes], ignores: [...coverage.ignores],
    files };
}

/**
 * Why `manifest` is not the record of `tag`'s own tree, or `null` when it is: the same commit, files and hashes as
 * `git archive <tag>` gives here. The release's push gate and `upgrade`'s U4 both ask it, before anything leaves or
 * moves.
 *
 * ARC-09-C192 — ON THE MANIFEST'S OWN COVERAGE, as the header says a tree is checked. With this release's COVERAGE in
 * its place, a 2.2.0 install read 2.2.1's archive with 2.2.0's nine covers and found 72 files the 455-file manifest
 * held and its own reading did not: every release that covers more than the install was refused, and so was every move
 * back to one that covers less. `readManifest` has already checked the three lists before a manifest reaches here.
 */
export function archiveDiffers(root, tag, manifest, { run } = {}) {
  const coverage = { covers: manifest.covers, excludes: manifest.excludes, ignores: manifest.ignores };
  const local = manifestFromArchive(root, tag, { coverage, ...(run ? { run } : {}) });
  if (manifest.commit !== local.commit) {
    return `the published manifest names ${manifest.commit.slice(0, 7)}, and ${tag} here is ${local.commit.slice(0, 7)}`;
  }
  const paths = [...new Set([...Object.keys(manifest.files), ...Object.keys(local.files)])].sort();
  const differ = paths.filter((p) => manifest.files[p] !== local.files[p]);
  if (differ.length === 0) return null;
  return `${differ.length} file${differ.length === 1 ? '' : 's'} in the published manifest differ${differ.length === 1 ? 's' : ''} `
    + `from ${tag}'s own, the first ${differ[0]}`;
}

// ── The cache's writer, and the first release that carries a manifest ──────────────────────────────────────────────

/** Write the cache whole, atomically, 0600, as the revocation list's cache is written. */
export function writeManifestCache(root, { tag, doc, checkedAt, source }) {
  const path = releaseManifestPath(root);
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const tmp = `${path}.tmp-${process.pid}`;
  writeFileSync(tmp, `${JSON.stringify({ tag, checkedAt, source, doc }, null, 2)}\n`, { mode: 0o600 });
  renameSync(tmp, path);
  if (process.platform !== 'win32') chmodSync(path, 0o600);
}

/** The first release a manifest is signed for. `upgrade` allows a target before it without one (ARC-11-C7). */
export const MANIFESTS_FROM = '2.1.0';

/** Is `tag` (`v<major>.<minor>.<patch>`, a prerelease included) at or past MANIFESTS_FROM? */
export function signedRelease(tag) {
  const at = /^v(\d+)\.(\d+)\.(\d+)/.exec(String(tag ?? ''));
  if (!at) return false;
  const [from, here] = [MANIFESTS_FROM.split('.').map(Number), at.slice(1).map(Number)];
  for (let i = 0; i < 3; i++) if (here[i] !== from[i]) return here[i] > from[i];
  return true;
}

/**
 * The first final release installed from farstic/snowarch (ARC-09-C185b): it is staged there, and its manifest is signed
 * from that clone. An rc never is (the owner's rule: rc and dev stay in the engineering repository, farstic/snowarch
 * carries finals, one commit each).
 */
export const DISTRIBUTION_FROM = '2.2.1';

/** Is `tag` a FINAL release, `v<major>.<minor>.<patch>` with no prerelease, at or past DISTRIBUTION_FROM? */
export function distributedRelease(tag) {
  const at = /^v(\d+)\.(\d+)\.(\d+)$/.exec(String(tag ?? ''));
  if (!at) return false;
  const [from, here] = [DISTRIBUTION_FROM.split('.').map(Number), at.slice(1).map(Number)];
  for (let i = 0; i < 3; i++) if (here[i] !== from[i]) return here[i] > from[i];
  return true;
}

/**
 * E-32's remedy for a shipped file that is not as signed, spelled for `cli`: one wording, read by every check that
 * finds a shipped file wrong in an install (ARC-09-C185a), so a user meets one repair, not several.
 */
export const restoreRemedy = (cli) => `Put the signed files back with ${cli} doctor --fix; ${cli} doctor --json lists every one.`;
/** The command that remedy runs. */
export const restoreCommand = (cli) => `${cli} doctor --fix`;
