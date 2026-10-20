// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * Reading and writing the store. The server only ever reads; the wizard (ARC-07) and the
 * doctor's `--fix` (ARC-08) are the writers, through `saveStore` here.
 */
import { chmodSync, closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, statSync, writeSync, } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { dirname, join } from 'node:path';
import { parseStore } from './schema.js';
import { maskPath, shellRemedy } from './paths.js';
import { cliSpelling } from '../cli/tty.js';
export * from './paths.js';
export * from './schema.js';
const isWindows = process.platform === 'win32';
/**
 * POSIX mode check.
 *
 * THE FILE is what holds the password, so any group or world bit on it is a refusal.
 *
 * THE DIRECTORY is a different risk, and the first version of this got it wrong: it
 * refused on any `0o077` directory bit, which rejects a 0600 store sitting in an ordinary
 * 0755 folder — and `/tmp`, which is 1777, and is the path the story's own criterion 1
 * uses. A 0600 file is unreadable whatever its directory. What a directory bit actually
 * buys an attacker is group/world WRITE: the ability to replace the file or plant a
 * symlink in its place. So:
 *
 *   - group/world WRITE on the directory, without the sticky bit → REFUSE. Sticky (1777,
 *     as on /tmp) means only the owner can unlink or rename another user's entry, which
 *     removes exactly that attack.
 *   - any other group/world bit on the directory → WARN and load. Worth telling someone
 *     about; not worth refusing a correctly protected file over.
 *
 * Every path in the message is masked at construction: `maskPath` for the prose, and
 * `shellRemedy` for the `Run:` clause so the remedy is pasteable AND carries no absolute
 * path — checkout-relative inside the checkout, `~` under HOME, as given elsewhere.
 * Masking a whole sentence afterwards misses every occurrence but the first, which is how
 * the raw home directory used to reach the log; and masking only to `~` left an absolute
 * path whenever the checkout was not under HOME.
 *
 * Skipped entirely on Windows, where permissions are ACL-inherited and the POSIX mode bits
 * Node reports are synthetic (01 §13).
 */
export function checkFileModes(path) {
    if (isWindows || !existsSync(path))
        return {};
    const fileMode = statSync(path).mode & 0o777;
    const dir = dirname(path);
    const dirStat = existsSync(dir) ? statSync(dir) : null;
    const dirMode = dirStat ? dirStat.mode & 0o777 : 0;
    const sticky = dirStat ? (dirStat.mode & 0o1000) !== 0 : false;
    const oct = (m) => m.toString(8).padStart(4, '0');
    const shown = maskPath(path);
    if ((fileMode & 0o077) !== 0) {
        return { error: { code: 'STORE_PERMISSIONS_TOO_OPEN',
                message: `Refusing to load ${shown}: file mode ${oct(fileMode)} is group/world-readable. `
                    + shellRemedy('chmod 600', path) } };
    }
    const dirWritable = (dirMode & 0o022) !== 0;
    if (dirWritable && !sticky) {
        return { error: { code: 'STORE_PERMISSIONS_TOO_OPEN',
                message: `Refusing to load ${shown}: directory mode ${oct(dirMode)} is group/world-writable `
                    + `without the sticky bit, so the file can be replaced. ${shellRemedy('chmod 700', dir)}` } };
    }
    if ((dirMode & 0o077) !== 0) {
        return { warning: `store directory ${maskPath(dir)} is mode ${oct(dirMode)}`
                + `${sticky ? ' (sticky)' : ''}; the file itself is ${oct(fileMode)}. `
                + `Consider — ${shellRemedy('chmod 700', dir).replace(/^Run(, from the checkout)?: /, (m) => (m.includes('checkout') ? 'from the checkout: ' : ''))}` };
    }
    return {};
}
export function loadStore(path) {
    if (!existsSync(path)) {
        return { error: { code: 'STORE_NOT_FOUND', message: `store not found: ${maskPath(path)}` } };
    }
    const modes = checkFileModes(path);
    if (modes.error)
        return { error: modes.error };
    let raw;
    try {
        raw = JSON.parse(readFileSync(path, 'utf8'));
    }
    catch (e) {
        return { error: { code: 'STORE_UNREADABLE', message: `${maskPath(path)}: ${e.message}` } };
    }
    const parsed = parseStore(raw);
    if ('error' in parsed) {
        return { error: { ...parsed.error, message: `${maskPath(path)}: ${parsed.error.message}` } };
    }
    // The stored flags are returned AS WRITTEN, not completed.
    //
    // ARC-04-S02 completed them here ("absent means false, normalise once"), which was true
    // for gating and wrong for everything else: it destroys the difference between a store
    // that OMITS `flags` and one that declares all six as "false". ARC-04-S03 needs that
    // difference — a preset instance with no flags key must not be reported as disagreeing
    // with its own preset. Completion now happens at the point of use, in `expandPreset`,
    // which is where "absent means false" is actually the question being asked.
    return modes.warning ? { store: parsed.store, warning: modes.warning } : parsed;
}
/**
 * Atomic write: temp file in the same directory, fsync, rename over the target.
 *
 * Same directory because rename is only atomic within a filesystem. fsync before rename
 * because a rename can land before the data does, leaving a valid name over a truncated
 * file after a crash. `renameSync` replaces an existing file on Windows too — the
 * windows-latest cell in tests/store/atomic.test.ts is what proves that here rather than
 * on the documentation's word.
 */
/** Keys a caller may never patch through `updateInstance`. Credentials are set, not edited. */
export const CREDENTIAL_KEYS = Object.freeze(['auth', 'password', 'clientSecret', 'clientId']);
/**
 * ARC-07-C31 slice 3 — RENDERED INTO CHAT, AND STILL THE OPERATOR'S OWN SHELL.
 *
 * This sentence leaves as a `ServiceNowError` and reaches the MCP client, which is Claude, which
 * renders it into a conversation rather than into a terminal. That invites the conclusion that no
 * shell is involved and the spelling does not matter. It is the wrong conclusion: the operator reads
 * it and types it on the machine THIS SERVER IS RUNNING ON, so `cliSpelling()` is the right source.
 */
/** One caller, `line 144` below, so a default is within the rule and named. */
export class CredentialPatchRefused extends Error {
    constructor(key, cli = cliSpelling()) {
        super(`updateInstance refuses a patch containing "${key}" — credentials are written by `
            + `${cli} instance set-credentials, never by a patch`);
        this.name = 'CredentialPatchRefused';
    }
}
/**
 * Change ONE entry's non-credential fields, atomically.
 *
 * Added by ARC-08-S06 for the doctor's `--fix`, which writes the flags a store entry never stated
 * — and which must be unable to touch anything else. That is enforced here rather than promised by
 * the caller: a patch naming `auth`, `password`, `clientSecret` or `clientId` is REFUSED, at any
 * depth, so the whole class of "the fixer had a bug and rewrote a credential" cannot happen through
 * this door. Credentials are written by `instance set-credentials`, which probes before it saves.
 *
 * The write is `saveStore`'s: same temp-file-then-rename, same 0600, same everything the wizard
 * gets. A second writer with its own idea of atomicity is how a store ends up half-written.
 */
export function updateInstance(path, label, patch) {
    for (const key of Object.keys(patch)) {
        if (CREDENTIAL_KEYS.includes(key))
            throw new CredentialPatchRefused(key);
    }
    const loaded = loadStore(path);
    if ('error' in loaded)
        return loaded;
    const entry = loaded.store.instances?.[label];
    // Not a `StoreError`: that type's codes are about the FILE, and "there is no entry called that"
    // is about the request. Widening the file's error vocabulary for it would put a request-shaped
    // code in front of every reader of a store failure.
    if (!entry)
        return { unknownInstance: label };
    const next = {
        ...loaded.store,
        instances: { ...loaded.store.instances, [label]: { ...entry, ...patch } },
    };
    saveStore(path, next);
    return { store: next };
}
export function saveStore(path, store) {
    const dir = dirname(path);
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    const tmp = join(dir, `.instances.json.tmp-${process.pid}-${randomBytes(6).toString('hex')}`);
    const fd = openSync(tmp, 'wx', 0o600);
    try {
        writeSync(fd, `${JSON.stringify(store, null, 2)}\n`);
        fsyncSync(fd);
    }
    finally {
        closeSync(fd);
    }
    try {
        renameSync(tmp, path);
    }
    catch (e) {
        rmSync(tmp, { force: true });
        throw e;
    }
    if (!isWindows)
        chmodSync(path, 0o600);
}
