import { spawnSync } from 'node:child_process';
import { type KeyRole, type ProductKey } from './core.js';
export declare const MANIFEST_FORMAT = "snowarch-manifest/1";
export interface Coverage {
    covers: readonly string[];
    excludes?: readonly string[];
    ignores?: readonly string[];
}
/** A verified manifest's body. */
export interface ManifestBody {
    tag: string;
    commit: string;
    covers: string[];
    excludes: string[];
    ignores: string[];
    files: Record<string, string>;
}
/**
 * What a release ships, and so what its manifest covers (ARC-11-C7; ARC-09-C185a). One definition: the signer
 * (`licence sign-release`), the distribution export and its guard read it, and each manifest stores the copy it was
 * signed with, which is what the verifier reads. A path ending in `/` is a directory; anything else is one file.
 */
export declare const COVERAGE: Readonly<{
    covers: readonly string[];
    excludes: readonly string[];
    ignores: readonly string[];
}>;
/** The sha256 of `bytes`, as hex. */
export declare const hashBytes: (bytes: Buffer | string) => string;
/**
 * Is `path` covered by `{ covers, excludes, ignores }`? An entry named exactly as an excluded directory is excluded
 * with it, so a link standing where that directory was is not an extra file.
 */
export declare function isCovered(path: string, { covers, excludes, ignores }: Coverage): boolean;
export type ReadManifest = {
    ok: true;
    manifest: ManifestBody;
    key: KeyRole;
} | {
    ok: false;
    reason: string;
};
/**
 * A manifest — its text or its parsed document — verified: `{ ok, manifest, key }`, or `{ ok: false, reason }`.
 * A manifest that does not verify is never used to judge a tree.
 */
export declare function readManifest(input: unknown, { keys }?: {
    keys?: readonly ProductKey[];
}): ReadManifest;
export interface TreeDifference {
    path: string;
    why: 'changed' | 'missing' | 'extra';
}
export interface TreeCheck {
    ok: boolean;
    checked: number;
    modified: TreeDifference[];
}
/**
 * The tree at `root` against a VERIFIED manifest body: `{ ok, checked, modified }`, `modified` sorted, each
 * `{ path, why }` with `why` one of `changed`, `missing` or `extra`.
 */
export declare function checkTree(root: string, manifest: ManifestBody): TreeCheck;
/** `.local/release-manifest.json` — this release's signed manifest, as last fetched, and when. */
export declare const manifestCachePath: (root: string, local?: string) => string;
export interface ManifestCache {
    tag?: string;
    checkedAt: string;
    source?: string;
    doc: unknown;
}
/** The cache, `{ tag, checkedAt, source, doc }`, or `null`. A malformed file is an absent one. */
export declare function readManifestCache(root: string, { local }?: {
    local?: string;
}): ManifestCache | null;
export type Held = {
    state: 'missing';
} | {
    state: 'invalid';
    reason: string;
} | {
    state: 'other';
    manifestTag: string;
} | {
    state: 'held';
    manifest: ManifestBody;
};
/**
 * What the cache holds for `tag`, the one reading of it (ARC-09-C140): E-32's verdict starts here, and B01's
 * `outputMissing` asks the same question, so the two cannot disagree about a cache. Offline; nothing is fetched.
 *
 *   missing   no cache, or a file that is not one;
 *   invalid   the cached manifest does not verify (`reason`);
 *   other     it verifies and is another release's (`manifestTag`);
 *   held      it verifies and is `tag`'s (`manifest`).
 */
export declare function cachedManifest(root: string, tag: string, { keys, local }?: {
    keys?: readonly ProductKey[];
    local?: string;
}): Held;
/** A development version: `2.1.0-dev`, and `2.1.0-dev.1` should one ever be cut. */
export declare const isDevVersion: (version: string) => boolean;
/** The commit this checkout's own `tag` names, or `null`: no git, no repository, or no such tag (a download). */
export declare function tagCommit(root: string, tag: string, { run }?: {
    run?: typeof spawnSync;
}): string | null;
/** This checkout's release tag, `v<version>`, or `null` for a development version or none. */
export declare function releaseTagOf(root: string): string | null;
export type IntegrityStatus = {
    state: 'dev';
    version: string;
} | {
    state: 'verified';
    version: string;
    tag: string;
    checked: number;
    modified: TreeDifference[];
} | {
    state: 'modified';
    version: string;
    tag: string;
    checked: number;
    modified: TreeDifference[];
} | {
    state: 'missing';
    version: string;
    tag: string;
} | {
    state: 'invalid';
    version: string | null;
    tag?: string;
    reason: string;
} | {
    state: 'other';
    version: string;
    tag: string;
    manifestTag: string;
    manifestCommit?: string;
    localCommit?: string;
};
/**
 * This checkout against its release's signed manifest, read from the cache: `{ state, version, tag, … }`.
 *
 *   dev       a development version, which no manifest is signed for;
 *   verified  the manifest is this release's, and every covered file is as signed;
 *   modified  the manifest is this release's, and `modified` lists what differs;
 *   missing   no manifest is held: none was fetched, or the cache was deleted;
 *   invalid   the cached manifest does not verify, or `package.json` names no version;
 *   other     the manifest is another release's (`manifestTag`), or another commit's than this checkout's own tag.
 *
 * Every state but `dev` and `verified` is a FAIL (the architect's ruling, 2026-10-13): a deleted or swapped manifest
 * is the cheapest tamper, and must read as one. One bounded `git` call, for the tag's commit; nothing is fetched.
 */
export declare function integrityStatus(root: string, { keys, commitOf, local }?: {
    keys?: readonly ProductKey[];
    commitOf?: (root: string, tag: string) => string | null;
    local?: string;
}): IntegrityStatus;
/** The `Integrity:` line a status names, for every state; E-32 reports it, `status` and the banner print it. */
export declare function integrityLine(s: IntegrityStatus): string;
/** The remedy for a state that is not `verified`, spelled for `cli`; `null` for `dev` and `verified`. */
export declare function integrityRemedy(s: IntegrityStatus, cli: string): string | null;
/** The two lines, and nothing else, that every caller prints. The CLAUDE.md sentence keys on their first words. */
export declare const RESTORED_PREFIX = "Integrity: restored \u2014 ";
export declare const CANNOT_RESTORE_PREFIX = "Integrity: cannot restore \u2014 ";
export type Ensured = {
    state: 'exempt';
    why: 'dev' | 'no-version' | 'not-engine';
    line: string;
    hashed: number;
} | {
    state: 'verified';
    tag: string;
    hashed: number;
} | {
    state: 'restored';
    tag: string;
    restored: string[];
    moved: string[];
    folder: string;
    staged: boolean;
    claudeChanged: boolean;
    line: string;
    hashed: number;
} | {
    state: 'refused';
    tag: string | null;
    reason: string;
    remedy: string;
    line: string;
    hashed: number;
    status: IntegrityStatus | null;
};
export interface EnsureOptions {
    /** The checkout's `.local/`; the engine passes its own, which honours SNOWARCH_STATE_ROOT. */
    local?: string;
    keys?: readonly ProductKey[];
    /** Hash every covered file (the server's start, `doctor`, `status`), instead of only what the stat key says moved. */
    full?: boolean;
    /** The launcher as the reader's shell spells it, for the remedy; this process's shell when absent. */
    cli?: string;
    now?: () => Date;
    run?: typeof spawnSync;
    /** The project directory whose `.local/` holds the audit trail; the server's own when absent. */
    projectDir?: string;
    /** Whether to restore at all: false reports what a restore would do and changes nothing. */
    restore?: boolean;
}
/** An engine checkout: the package can also run where there is no engine tree to check (Q2, 2026-10-14). */
export declare const isEngineCheckout: (root: string) => boolean;
export declare const verdictPath: (root: string, local?: string) => string;
export declare const lockPath: (root: string, local?: string) => string;
export declare const LOCK_STALE_MS = 30000;
export declare const LOCK_WAIT_MS = 2000;
/** Why a state the restore cannot act on refuses, worded for the line; E-32 reports the same two halves. */
export declare function refusalOf(s: IntegrityStatus, cli: string): {
    reason: string;
    remedy: string;
};
/** The line a restore prints, worded by the owner's ruling (R5): the same everywhere, the hook adding its restart. */
export declare function restoredLine({ restored, moved, tag, folder, staged, first }: {
    restored: string[];
    moved: string[];
    tag: string;
    folder: string;
    staged: boolean;
    first: string;
}): string;
/**
 * ARC-09-C149 — why the signed files of a modified tree cannot be put back, found before anything is tried, or `null`:
 * git cannot run, this checkout holds no `tag`, the tag names another commit than the manifest (`manifestCommit`, when
 * the caller has it), or a changed path is reached through a link that leaves the checkout. `restoreTree` asks it
 * first, and E-32 asks it before it offers `doctor --fix`, so the repair a user is offered is the one that runs.
 */
export declare function restoreBlocker(root: string, tag: string, modified: readonly TreeDifference[], { manifestCommit, run, cli }?: {
    manifestCommit?: string | null;
    run?: typeof spawnSync;
    cli?: string;
}): {
    reason: string;
    remedy: string;
} | null;
/**
 * THE ONE FUNCTION (C141): this checkout's integrity, restored when it can be, refused when it cannot.
 *
 *   exempt    a development tree, or no engine checkout here: nothing to check (Q2);
 *   verified  every covered file is as signed — from the stat key alone when nothing moved;
 *   restored  it was not, and now is: the line names what was put back and moved;
 *   refused   it is not, and cannot be: no manifest, one that does not verify or is another release's, no tag, or a
 *             restore that failed. Callers refuse as a refused licence does.
 */
export declare function ensureIntegrity(root: string, { local, keys, full, cli, now, run, projectDir, restore }?: EnsureOptions): Ensured;
