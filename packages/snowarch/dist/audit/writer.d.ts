/** Rotate at 10 MB, keeping three older files. */
export declare const MAX_BYTES: number;
export declare const KEEP = 3;
/** One group of warnings from a single call: how many, of what, on which table and fields. */
export interface AuditWarning {
    code: string;
    /** `null` when the table name was not identifier-shaped, so it is not recorded. */
    table: string | null;
    fields: string[];
    count: number;
}
export interface AuditEntry {
    /** ISO-8601. Passed in rather than taken here, so a caller can time a call precisely. */
    ts: string;
    instance: string;
    environment: string;
    tool: string;
    gate: string;
    table: string | null;
    sysId: string | null;
    query: string | null;
    /** `ok`, or the error code of the refusal or failure. */
    result: string;
    ms: number;
    /** Which surface made the call. ARC-07-S06 appends CLI lines through the same writer. */
    source: 'mcp' | 'cli';
    /** Free-text context for a call with no table — `"switch → prod"`. Never a payload. */
    note?: string;
    /**
     * Present only when the call came back with warnings. `result` stays `ok` for a write that
     * succeeded, or the error code for one that failed after it wrote; the warnings say what else
     * happened. Absent means none, not "not checked" for the two write paths the check covers.
     */
    warnings?: AuditWarning[];
    /**
     * ARC-11-C1 — the licence the call was made under, by id. Present only when the licence's signature
     * holds (revoked and expired included: the id is still authentic), and LAST, so a checkout without a
     * licence writes exactly the line it always wrote.
     */
    licence?: string;
}
/**
 * A line written by the CLI rather than by a tool call (ARC-07-S06).
 *
 * Same file, same rotation, same `ts` / `instance` / `environment` / `result` keys — a reader
 * following one instance's history should not need to know which surface made each change. What
 * differs is what there is to say: there is no tool, no gate, no table and no duration, so `tool`
 * is `null` and the MCP-only fields are absent rather than filled with zeroes that would read as
 * measurements. `action` says which sub-command, and `confirmedVia` records whether a production
 * raise was confirmed by a typed label or by `--confirm-label` on a CI command line — the one
 * distinction D-05's "typed" intent turns on.
 */
/**
 * ARC-11-C1 polish 2 — a call the router refused for the licence, a read or a write alike.
 *
 * The owner's rc.1 sitting found the trail empty after two refusals: the router refuses before the writer
 * runs, and a read writes no line. A refused attempt is evidence. The line carries no argument and no
 * value — no table, no sys_id, no query — because nothing was sent, and the tool's name is a declared one.
 */
export interface LicenceRefusalEntry {
    ts: string;
    instance: string;
    tool: string;
    gate: 'licence';
    result: 'LICENCE_NOT_VALID';
    /** The licence's id when its signature holds, else `missing`. */
    licence: string;
    state: 'revoked' | 'expired' | 'invalid' | 'missing' | 'scope';
}
/**
 * ARC-11-C141 — the product restored its own files (the owner's ruling, 2026-10-14: a change to them does not take
 * effect, and the user continues). Whichever process restored them writes this line: the server at its start, the
 * launcher, the SessionStart hook, or `doctor --fix`. Paths only, never contents.
 */
export interface IntegrityRestoreEntry {
    ts: string;
    gate: 'integrity';
    action: 'restored';
    tag: string;
    /** The signed files put back from the tag. */
    files: string[];
    /** The files the release does not ship, moved aside. */
    moved: string[];
    /** Where the replaced copies and the moved files are now, relative to the checkout when inside it. */
    folder: string;
}
/** ARC-11-C141 — a call the router refused because this checkout's own files could not be restored (Q8). */
export interface IntegrityRefusalEntry {
    ts: string;
    instance: string;
    tool: string;
    gate: 'integrity';
    result: 'INTEGRITY_NOT_VERIFIED';
    /** The tree's state: `missing`, `invalid`, `other`, or `unrestorable` for a restore that failed. */
    state: string;
    tag: string;
}
export interface CliAuditEntry {
    ts: string;
    instance: string;
    environment: string;
    tool: null;
    actor: 'cli';
    action: 'set-preset' | 'set-flags' | 'set-credentials' | 'set-default' | 'remove';
    result: string;
    preset?: string;
    prodWriteAck?: boolean;
    confirmedVia?: 'prompt' | 'flag';
}
/**
 * Where the file lives: beside the store in use, so the audit sits with the configuration it
 * records. `SNOW_AUDIT_FILE` overrides; `off` disables it entirely.
 *
 * Returns `null` when disabled. With no store on disk (env-defined instances) it falls back to
 * the project path — `<CLAUDE_PROJECT_DIR ?? cwd>/.local/` — rather than giving up, because an
 * env-configured instance is exactly the setup most likely to be doing something ad hoc.
 */
export declare function resolveAuditPath(): string | null;
/** True when the trail is switched off, so start-up can say so once. */
export declare const auditDisabled: () => boolean;
/** Test seam: the module-level "already warned" latch, reset between cases. */
export declare function resetAuditWarning(): void;
/**
 * Append one line. Never throws.
 *
 * A tool call that succeeded against the instance must not be reported as failed because the
 * local disk was full or read-only — the write already happened, and telling the caller
 * otherwise would be worse than losing the audit line.
 */
export declare function appendAudit(entry: AuditEntry | CliAuditEntry | LicenceRefusalEntry | IntegrityRestoreEntry | IntegrityRefusalEntry): void;
/** The last `n` lines, parsed. Unparseable lines are skipped rather than throwing. */
export declare function tailAudit(n?: number): AuditEntry[];
/** The name ARC-07/08's `snowarch audit tail` calls. Same function, story's spelling. */
export declare const readAuditTail: typeof tailAudit;
