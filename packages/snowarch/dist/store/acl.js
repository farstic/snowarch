// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-09-C272 — who may read the store on Windows, and how it is made private.
//
// On POSIX the store is 0600 in a 0700 folder. On Windows a mode is a flag that means something else, the store was whatever its
// folder inherited, and a folder made directly under `C:\` inherits `BUILTIN\Users` read and `Authenticated Users` modify (measured
// on a windows-latest runner, 2026-11-12), so every other account on the computer could read the basic-auth password. This module is
// the whole of the answer:
//
//   - `lockArgs` / `createAclTools().lock`: `icacls <path> /inheritance:r /grant:r *<account SID>:… *S-1-5-18:…` — the account and
//     SYSTEM, by SID. By SID because a name does not survive a Microsoft or Entra account, a localised Windows or a domain.
//   - `parseSddl` / `exposureOf` / `exposureSentence` / `createAclTools().read`: who else holds an allow entry, read from the SDDL
//     `icacls /save` writes (UTF-16LE; the path on one line and the DACL on the next), so the verdict does not depend on a language,
//     and said in words ("BUILTIN\Users can read it"), never as the SDDL.
//   - `makePrivateDir`: the one way the server makes a private folder. The same `mkdir` mode 0700 as before and, on Windows, when it
//     created the folder, the lock. A folder it found is the user's: the lock on it is `instance add`'s and the doctor's to make, and
//     says so (tests/private-dir-guard.test.mjs keeps every other `mkdirSync` with a mode out of the tree).
//
// Every call that touches the system goes through `Run`, a seam, and the system's own `icacls.exe` and `whoami.exe` are named by full
// path: PATH is the user's, and a lock command that resolved through it would be a command somebody else could provide.
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir as osTmpdir } from 'node:os';
import { join, win32 } from 'node:path';
export const SYSTEM_SID = 'S-1-5-18';
export const ADMINISTRATORS_SID = 'S-1-5-32-544';
export const CREATOR_OWNER_SID = 'S-1-3-0';
const OWNER_RIGHTS_SID = 'S-1-3-4';
// ─── the account ─────────────────────────────────────────────────────────────
/**
 * The SID in `whoami /user /fo csv /nh`: `"HOST\name","S-1-5-21-…"`. The name is localised and may hold digits and commas, so the
 * SID is what ends the line, not what first looks like one.
 */
export function parseWhoamiSid(text) {
    const m = /"?(S-1-\d+(?:-\d+)+)"?\s*$/.exec(String(text ?? '').trim());
    return m ? m[1] : null;
}
// ─── the command ─────────────────────────────────────────────────────────────
/**
 * The account and SYSTEM, full control, and no inheritance. A folder passes it to what is created in it `(OI)(CI)`; a file takes no
 * flags. `*` tells icacls the grant is a SID.
 */
export function lockArgs(path, sid, { dir }) {
    const flags = dir ? '(OI)(CI)' : '';
    return [path, '/inheritance:r', '/grant:r', `*${sid}:${flags}F`, `*${SYSTEM_SID}:${flags}F`];
}
/** The entries of the DACL in `sddl`, in order; a full descriptor's owner, group and SACL are not read. Empty for text that is no SDDL. */
export function parseSddl(sddl) {
    const m = /D:[A-Z]*((?:\([^)]*\))*)/.exec(String(sddl ?? ''));
    if (!m)
        return [];
    const aces = [];
    for (const ace of m[1].matchAll(/\(([^)]*)\)/g)) {
        const parts = ace[1].split(';');
        if (parts.length >= 6)
            aces.push({ type: parts[0], flags: parts[1], rights: parts[2], trustee: parts[5] });
    }
    return aces;
}
/** Whether an access mask — hex, or symbolic pairs such as `SDGXGWGR` — includes reading the data. Unparsable counts as reading. */
export function canRead(rights) {
    if (/^0x[0-9a-f]+$/i.test(rights)) {
        const mask = Number.parseInt(rights.slice(2), 16);
        // FILE_READ_DATA / LIST_DIRECTORY (0x1), GENERIC_READ (0x80000000), GENERIC_ALL (0x10000000).
        return (mask & 0x1) !== 0 || (mask & 0x80000000) !== 0 || (mask & 0x10000000) !== 0;
    }
    if (/^([A-Z]{2})+$/.test(rights))
        return (rights.match(/../g) ?? []).some((r) => ['GR', 'GA', 'FA', 'FR'].includes(r));
    return true;
}
/** The accounts SDDL writes as two letters, with the names Windows gives them in English. SYSTEM, Administrators and the owner are here too. */
const ALIASES = {
    WD: 'Everyone', BU: 'BUILTIN\\Users', AU: 'NT AUTHORITY\\Authenticated Users', IU: 'NT AUTHORITY\\INTERACTIVE',
    NU: 'NT AUTHORITY\\NETWORK', SU: 'NT AUTHORITY\\SERVICE', AN: 'NT AUTHORITY\\ANONYMOUS LOGON', LS: 'NT AUTHORITY\\LOCAL SERVICE',
    NS: 'NT AUTHORITY\\NETWORK SERVICE', RC: 'NT AUTHORITY\\RESTRICTED', AC: 'ALL APPLICATION PACKAGES', PS: 'NT AUTHORITY\\SELF',
    SY: 'NT AUTHORITY\\SYSTEM', BA: 'BUILTIN\\Administrators', BG: 'BUILTIN\\Guests', PU: 'BUILTIN\\Power Users',
    AO: 'BUILTIN\\Account Operators', SO: 'BUILTIN\\Server Operators', PO: 'BUILTIN\\Print Operators', BO: 'BUILTIN\\Backup Operators',
    RE: 'BUILTIN\\Replicator', RD: 'BUILTIN\\Remote Desktop Users', NO: 'BUILTIN\\Network Configuration Operators',
    MU: 'BUILTIN\\Performance Monitor Users', LU: 'BUILTIN\\Performance Log Users', IS: 'IIS_IUSRS', CY: 'BUILTIN\\Cryptographic Operators',
    ER: 'BUILTIN\\Event Log Readers', RM: 'BUILTIN\\Remote Management Users', DU: 'Domain Users', DA: 'Domain Admins',
    DG: 'Domain Guests', DC: 'Domain Computers', CO: 'CREATOR OWNER', CG: 'CREATOR GROUP', OW: 'OWNER RIGHTS',
    LA: 'the local Administrator account', LG: 'the local Guest account',
};
/** What is never an exposure: the account itself (by SID, added at the call), SYSTEM, Administrators (who can take ownership anyway), the owner. */
const TOLERATED = new Set(['SY', 'BA', 'CO', 'OW', SYSTEM_SID, ADMINISTRATORS_SID, CREATOR_OWNER_SID, OWNER_RIGHTS_SID]);
const WELL_KNOWN_SIDS = {
    'S-1-1-0': 'Everyone', 'S-1-5-11': 'NT AUTHORITY\\Authenticated Users', 'S-1-5-32-545': 'BUILTIN\\Users',
    'S-1-5-4': 'NT AUTHORITY\\INTERACTIVE', 'S-1-5-2': 'NT AUTHORITY\\NETWORK', 'S-1-5-32-546': 'BUILTIN\\Guests',
};
/**
 * Who holds an allow entry on this object besides the account, SYSTEM and Administrators. Denies are not counted; an allow for anyone
 * else is, whatever its rights, because a folder where another account may write is one where the store can be replaced.
 * `nameOf` gives a name to a trustee this module has no name for (the system's resolver, or the SID itself).
 */
export function exposureOf(aces, userSid, nameOf = (t) => t) {
    const who = [];
    let read = false;
    for (const ace of aces) {
        if (!['A', 'XA', 'OA'].includes(ace.type))
            continue;
        if (ace.trustee === userSid || TOLERATED.has(ace.trustee))
            continue;
        // SDDL writes the built-in Administrator (RID 500) as the alias `LA`, not as a SID — and a hosted runner's account, and any machine whose
        // user is that account, is exactly that one (measured, 2026-11-12). It is the account itself, not another.
        if (ace.trustee === 'LA' && userSid.endsWith('-500'))
            continue;
        const name = ALIASES[ace.trustee] ?? WELL_KNOWN_SIDS[ace.trustee] ?? nameOf(ace.trustee);
        if (!who.includes(name))
            who.push(name);
        if (canRead(ace.rights))
            read = true;
    }
    return { who, read };
}
/** Names as a sentence joins them: `A`, `A and B`, `A, B and C`. */
export function nameList(names) {
    return names.length <= 2 ? names.join(' and ') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}
/** `BUILTIN\Users can read it` — or `… can change it` when none of them can read. */
export function exposureSentence(e, subject = 'it') {
    return `${nameList(e.who)} can ${e.read ? 'read' : 'change'} ${subject}`;
}
// ─── the tools ───────────────────────────────────────────────────────────────
const defaultRun = (file, args) => {
    const r = spawnSync(file, args, { encoding: 'utf8', windowsHide: true, timeout: 20_000 });
    if (r.error)
        return { status: null, stdout: '', stderr: r.error.message };
    return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
};
const firstLine = (text) => String(text ?? '').split(/\r?\n/).map((l) => l.trim()).find(Boolean) ?? '';
const NO_ACCOUNT = 'could not tell which account this is (whoami gave no SID)';
export function createAclTools(options = {}) {
    const platform = options.platform ?? process.platform;
    const run = options.run ?? defaultRun;
    const env = options.env ?? process.env;
    const system32 = win32.join(env.SystemRoot ?? 'C:\\Windows', 'System32');
    const exe = (name) => win32.join(system32, name);
    let sid;
    const userSid = () => {
        if (platform !== 'win32')
            return null;
        if (sid === undefined) {
            const r = run(exe('whoami.exe'), ['/user', '/fo', 'csv', '/nh']);
            sid = r.status === 0 ? parseWhoamiSid(r.stdout) : null;
        }
        return sid;
    };
    /** A name for a SID this module has none for, from the system; the SID itself when the system cannot say. */
    const resolve = (trustee) => {
        if (!/^S-1-\d+(?:-\d+)+$/.test(trustee))
            return trustee;
        const r = run(win32.join(system32, 'WindowsPowerShell', 'v1.0', 'powershell.exe'), ['-NoProfile', '-NonInteractive', '-Command',
            `([System.Security.Principal.SecurityIdentifier]'${trustee}').Translate([System.Security.Principal.NTAccount]).Value`]);
        const name = r.status === 0 ? firstLine(r.stdout) : '';
        return name || trustee;
    };
    const read = (path) => {
        if (platform !== 'win32')
            return { ok: true, exposure: { who: [], read: false } };
        const me = userSid();
        if (!me)
            return { ok: false, reason: NO_ACCOUNT };
        const file = join(options.tmpdir ?? osTmpdir(), `snowarch-acl-${process.pid}-${randomBytes(6).toString('hex')}.txt`);
        try {
            const r = run(exe('icacls.exe'), [path, '/save', file]);
            if (r.status !== 0)
                return { ok: false, reason: `icacls could not read the permissions of ${path}: ${firstLine(r.stderr) || firstLine(r.stdout)}` };
            let bytes;
            try {
                bytes = readFileSync(file);
            }
            catch {
                return { ok: false, reason: `icacls wrote no permissions for ${path}` };
            }
            const text = bytes.subarray(0, 2).equals(Buffer.from([0xff, 0xfe])) ? bytes.subarray(2).toString('utf16le') : bytes.toString('utf16le');
            const sddl = text.split(/\r?\n/).find((l) => l.startsWith('D:'));
            const aces = sddl ? parseSddl(sddl) : [];
            if (aces.length === 0)
                return { ok: false, reason: `icacls wrote no readable permissions for ${path}` };
            return { ok: true, exposure: exposureOf(aces, me, resolve) };
        }
        finally {
            rmSync(file, { force: true });
        }
    };
    const lock = (path, { dir }) => {
        if (platform !== 'win32')
            return { ok: true };
        const me = userSid();
        if (!me)
            return { ok: false, reason: NO_ACCOUNT };
        const r = run(exe('icacls.exe'), lockArgs(path, me, { dir }));
        if (r.status === 0)
            return { ok: true };
        return { ok: false, reason: r.status === null ? `icacls could not be run: ${firstLine(r.stderr)}` : `icacls exited ${r.status}: ${firstLine(r.stderr) || firstLine(r.stdout)}` };
    };
    const ensurePrivate = (path, opts) => {
        if (platform !== 'win32')
            return { state: 'private' };
        const seen = read(path);
        if (seen.ok && seen.exposure.who.length === 0)
            return { state: 'private' };
        const locked = lock(path, opts);
        if (!locked.ok)
            return { state: 'failed', reason: locked.reason };
        return { state: 'locked', was: seen.ok ? seen.exposure : null };
    };
    return { platform, userSid, read, lock, ensurePrivate };
}
let shared = null;
/** The tools for this process: made once, so the account is asked once. */
export function realAclTools() {
    shared ??= createAclTools();
    return shared;
}
// ─── the folder ──────────────────────────────────────────────────────────────
/**
 * A folder this product names and owns: the checkout's `.local` and the per-user `snowarch`. Any other folder is the user's — a store an
 * environment variable points into a folder of their own — and the lock on it goes no further than the store's own file.
 */
export const isProductFolder = (dir) => ['.local', 'snowarch'].includes(win32.basename(dir));
/**
 * A private folder: `mkdir -p` with mode 0700, as it has always been, and on Windows — when this call CREATED the folder — locked to
 * the account and SYSTEM. Only the folder asked for is locked, not the folders made on the way to it; one that already existed is left
 * exactly as it was. A lock that fails does not stop the caller: the folder exists, and the result carries the reason.
 */
export function makePrivateDir(dir, acl = realAclTools()) {
    const existed = existsSync(dir);
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    if (existed)
        return { created: false, lock: null };
    if (acl.platform !== 'win32')
        return { created: true, lock: null };
    return { created: true, lock: acl.lock(dir, { dir: true }) };
}
