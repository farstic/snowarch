export declare const SYSTEM_SID = "S-1-5-18";
export declare const ADMINISTRATORS_SID = "S-1-5-32-544";
export declare const CREATOR_OWNER_SID = "S-1-3-0";
export interface RunResult {
    status: number | null;
    stdout: string;
    stderr: string;
}
/** A system command. The default runs it; a test supplies its own and no case here ever starts icacls. */
export type Run = (file: string, args: string[]) => RunResult;
/** Who holds an allow entry besides the account, SYSTEM and Administrators — as names — and whether any of them can read. */
export interface Exposure {
    who: string[];
    read: boolean;
}
export type LockResult = {
    ok: true;
} | {
    ok: false;
    reason: string;
};
export type EnsureResult = {
    state: 'private';
} | {
    state: 'locked';
    was: Exposure | null;
} | {
    state: 'failed';
    reason: string;
};
export interface AclTools {
    /** The platform these tools act for; anything but `win32` asks nothing of the system. */
    readonly platform: NodeJS.Platform;
    /** The account's SID, from whoami, once. */
    userSid(): string | null;
    read(path: string): {
        ok: true;
        exposure: Exposure;
    } | {
        ok: false;
        reason: string;
    };
    lock(path: string, opts: {
        dir: boolean;
    }): LockResult;
    /** Read it; leave it alone if no one else can read it, lock it if they can (or if it could not be read). */
    ensurePrivate(path: string, opts: {
        dir: boolean;
    }): EnsureResult;
}
/**
 * The SID in `whoami /user /fo csv /nh`: `"HOST\name","S-1-5-21-…"`. The name is localised and may hold digits and commas, so the
 * SID is what ends the line, not what first looks like one.
 */
export declare function parseWhoamiSid(text: string): string | null;
/**
 * The account and SYSTEM, full control, and no inheritance. A folder passes it to what is created in it `(OI)(CI)`; a file takes no
 * flags. `*` tells icacls the grant is a SID.
 */
export declare function lockArgs(path: string, sid: string, { dir }: {
    dir: boolean;
}): string[];
export interface Ace {
    type: string;
    flags: string;
    rights: string;
    trustee: string;
}
/** The entries of the DACL in `sddl`, in order; a full descriptor's owner, group and SACL are not read. Empty for text that is no SDDL. */
export declare function parseSddl(sddl: string): Ace[];
/** Whether an access mask — hex, or symbolic pairs such as `SDGXGWGR` — includes reading the data. Unparsable counts as reading. */
export declare function canRead(rights: string): boolean;
/**
 * Who holds an allow entry on this object besides the account, SYSTEM and Administrators. Denies are not counted; an allow for anyone
 * else is, whatever its rights, because a folder where another account may write is one where the store can be replaced.
 * `nameOf` gives a name to a trustee this module has no name for (the system's resolver, or the SID itself).
 */
export declare function exposureOf(aces: Ace[], userSid: string, nameOf?: (trustee: string) => string): Exposure;
/** Names as a sentence joins them: `A`, `A and B`, `A, B and C`. */
export declare function nameList(names: readonly string[]): string;
/** `BUILTIN\Users can read it` — or `… can change it` when none of them can read. */
export declare function exposureSentence(e: Exposure, subject?: string): string;
export interface AclOptions {
    platform?: NodeJS.Platform;
    run?: Run;
    tmpdir?: string;
    env?: NodeJS.ProcessEnv;
}
export declare function createAclTools(options?: AclOptions): AclTools;
/** The tools for this process: made once, so the account is asked once. */
export declare function realAclTools(): AclTools;
/**
 * A folder this product names and owns: the checkout's `.local` and the per-user `snowarch`. Any other folder is the user's — a store an
 * environment variable points into a folder of their own — and the lock on it goes no further than the store's own file.
 */
export declare const isProductFolder: (dir: string) => boolean;
/**
 * A private folder: `mkdir -p` with mode 0700, as it has always been, and on Windows — when this call CREATED the folder — locked to
 * the account and SYSTEM. Only the folder asked for is locked, not the folders made on the way to it; one that already existed is left
 * exactly as it was. A lock that fails does not stop the caller: the folder exists, and the result carries the reason.
 */
export declare function makePrivateDir(dir: string, acl?: AclTools): {
    created: boolean;
    lock: LockResult | null;
};
