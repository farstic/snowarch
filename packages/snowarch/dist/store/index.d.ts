import { type Store, type StoreError } from './schema.js';
export * from './paths.js';
export * from './schema.js';
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
export declare function checkFileModes(path: string): {
    error?: StoreError;
    warning?: string;
};
export declare function loadStore(path: string): {
    store: Store;
    warning?: string;
} | {
    error: StoreError;
};
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
export declare const CREDENTIAL_KEYS: readonly string[];
/**
 * ARC-07-C31 slice 3 — RENDERED INTO CHAT, AND STILL THE OPERATOR'S OWN SHELL.
 *
 * This sentence leaves as a `ServiceNowError` and reaches the MCP client, which is Claude, which
 * renders it into a conversation rather than into a terminal. That invites the conclusion that no
 * shell is involved and the spelling does not matter. It is the wrong conclusion: the operator reads
 * it and types it on the machine THIS SERVER IS RUNNING ON, so `cliSpelling()` is the right source.
 */
/** One caller, `line 144` below, so a default is within the rule and named. */
export declare class CredentialPatchRefused extends Error {
    constructor(key: string, cli?: string);
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
export declare function updateInstance(path: string, label: string, patch: Record<string, unknown>): {
    store: Store;
} | {
    error: StoreError;
} | {
    unknownInstance: string;
};
export declare function saveStore(path: string, store: Store): void;
