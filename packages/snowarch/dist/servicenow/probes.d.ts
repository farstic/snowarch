import { type FlagName } from '../utils/permissions.js';
/**
 * The sentence every review screen prints ONCE, above the probe lines.
 *
 * A probe proves the account can READ the table family a flag unlocks. It does not prove a write
 * will be allowed: ServiceNow evaluates write ACLs per call, per record, and a probe that implied
 * otherwise would be the wizard promising something the instance has not agreed to.
 */
export declare const HONESTY_NOTE = "Probes confirm the account can reach each table family; write ACLs are still evaluated per call.";
export type ProbeStatus = 'ok' | 'auth failed' | 'role missing' | 'unreachable' | 'error' | 'not licensed' | 'not installed' | 'skipped';
export interface AuthProbe {
    status: ProbeStatus;
    code?: string;
    httpStatus?: number;
    roles?: string[];
    hint?: string;
    detail?: string;
}
export interface CapabilityProbe {
    flag: FlagName;
    status: ProbeStatus;
    detail: string;
}
export interface LastProbe {
    at: string;
    auth: ProbeStatus;
    write: ProbeStatus;
    scripting: ProbeStatus;
    cmdb: ProbeStatus;
    atf: ProbeStatus;
    nowAssist: ProbeStatus;
    fluent: ProbeStatus;
}
/**
 * ARC-07-C6 — THE ORDER AND THE NAMES OF A PROBE RECORD, once, for every renderer.
 *
 * There were two. `probeSummary` (the wizard's Saved line) printed seven fields in the flag order,
 * spelled as the flags are — `auth · write · cmdb_write · scripting · atf · now_assist · fluent`.
 * `probeCell` (the `instance list` table) printed FIVE in a different order with different names —
 * `auth · write · scripting · cmdb · atf` — and silently dropped `nowAssist` and `fluent`. So an
 * instance whose Now Assist probe came back `not licensed` listed as a row of `ok`s, and the two
 * surfaces disagreed about both the vocabulary and the number of facts a probe has.
 *
 * DERIVED FROM `FLAG_NAMES`, not spelled again: a seventh capability added to the flags appears in
 * both renderers or in neither, and cannot appear under two names. `auth` leads because it is not a
 * capability — it is the question the other six presuppose, and a reader scanning a row wants the
 * answer to "did it log in" before the answer to "may it write".
 */
export declare const PROBE_FIELD_OF: Readonly<Record<FlagName, keyof Omit<LastProbe, 'at' | 'auth'>>>;
export interface ProbeField {
    /** How it is written for a reader: the flag's own name, lower-cased. `auth` is its own. */
    label: string;
    /** The key in the stored record. */
    key: keyof Omit<LastProbe, 'at'>;
    /** The flag that turns the capability on — `null` for `auth`, which no flag gates. */
    flag: FlagName | null;
}
/**
 * WHAT A PROBE RESULT IS CALLED, in one place — ARC-07-W16.
 *
 * THREE SURFACES RENDER THE SAME MEASUREMENT: the permissions screen's annotation, the wizard's Saved
 * line, and `instance list`'s probe column. The screen said `@servicenow/sdk not on PATH`, the other
 * two said `not installed`, and a user who saw two of them saw two findings where there was one.
 *
 * ARC-07-C6 already noticed half of this — it made the ORDER and the NAMES come from `PROBE_FIELDS`
 * for exactly this reason — and left the VALUES formatted separately in each place. Putting the words
 * here finishes that row's argument: `probeFieldText` is now the one renderer, and C6's assertion that
 * the Saved line equals the list cell holds by construction rather than by two functions agreeing.
 *
 * `ok`, `skipped` and an unknown status pass through as themselves; there is nothing to translate.
 */
export declare const statusWords: (status: string | undefined) => string;
/**
 * One probe field, as every surface prints it — `auth: ok`, `fluent: ServiceNow SDK not installed`.
 *
 * The colon arrived with the words: the values are phrases now, and `atf no licence detected` without
 * one reads as a sentence fragment rather than a field and its value.
 */
export declare const probeFieldText: (label: string, status: string | undefined) => string;
export declare const PROBE_FIELDS: readonly ProbeField[];
/** What a probe needs of a client. `ServiceNowClient` satisfies it; a fake can too. */
export interface ProbeClient {
    queryRecords(params: {
        table: string;
        query?: string;
        fields?: string;
        limit?: number;
    }): Promise<{
        count: number;
        records: unknown[];
    }>;
}
/** The 403 hint, spelled once: the account is real, the role is not. */
export declare const ROLE_MISSING_HINT: string;
export declare const ROLES_UNREADABLE_HINT = "could not read roles";
/**
 * ServiceNow's OAuth error bodies, as DATA.
 *
 * RFC 6749 §5.2 names these; what a given instance actually returns is CAPTURED, not assumed —
 * ARC-07-S11 records the real texts from a PDI with the hardening property toggled and fills
 * `tests/fixtures/oauth-ropc-errors.json`. Until then this table is the RFC's names, and anything
 * unrecognised falls through to `auth failed` with the raw value in `detail` rather than being
 * guessed at.
 */
export declare const ROPC_ERROR_TABLE: ReadonlyArray<{
    error: string;
    status: ProbeStatus;
    code?: string;
    hint?: string;
}>;
/** The token response this probe understands. Nothing is stored from it. */
export interface TokenResult {
    ok: boolean;
    error?: string;
    httpStatus?: number;
}
/**
 * Prove the credentials. One request; on 401, never a second.
 *
 * The 403 path is its own status rather than a failure: on a hardened instance the login is
 * correct and the REST ACL is not, and telling that user their password is wrong sends them to
 * change a password that works.
 */
export declare function probeAuth(client: ProbeClient, { username, authMethod, tokenProbe, env, }?: {
    username?: string;
    authMethod?: 'basic' | 'oauth_ropc';
    tokenProbe?: () => Promise<TokenResult>;
    env?: NodeJS.ProcessEnv;
}): Promise<AuthProbe>;
/** The table each flag's probe reads, and what "ok" means for it. Keyed by `FLAG_NAMES`. */
export declare const CAPABILITY_TABLE: Readonly<Record<FlagName, {
    table?: string;
    query?: string;
    /** True when a 200 with zero rows is NOT ok — the rows are the evidence. */
    needsRows?: boolean;
    local?: 'fluent';
    emptyStatus?: ProbeStatus;
    emptyDetail?: string;
}>>;
export interface FluentCheck {
    installed: boolean;
    where?: string;
    version?: string;
}
/**
 * Is `@servicenow/sdk` on this machine — in the checkout, or installed globally?
 *
 * The global lookup spawns `npm root -g`, and on Windows `npm` is a `.cmd`: since Node 20.12
 * `child_process` refuses to spawn one without a shell, so the executable is LOCATED on PATH
 * first and a `.cmd` is run through `cmd /c`. Bare `spawn('npm')` looked like it worked
 * everywhere right up until it did not, on the one platform nobody develops on.
 *
 * The spawn is injected, so CI never runs the real `npm root -g` — which would be a network-shaped
 * dependency in a unit test and slow on every cell.
 */
export declare function checkFluent({ from, runNpm, exists, }?: Partial<{
    from: string;
    runNpm: () => string | null;
    exists: (p: string) => boolean;
}>): FluentCheck;
/** One capability. Read-only, one request, and `skipped` is never inferred here. */
export declare function probeCapability(client: ProbeClient, flag: FlagName, { env, fluent, }?: Partial<{
    env: NodeJS.ProcessEnv;
    fluent: typeof checkFluent;
}>): Promise<CapabilityProbe>;
export interface ProbeAll {
    auth: AuthProbe;
    capabilities: CapabilityProbe[];
}
/**
 * Auth first; capabilities only if it passed.
 *
 * A capability probe against an instance that just refused the login tells you nothing you did not
 * already know and spends five more requests finding it out — on the same account, moments after
 * a failed authentication.
 */
export declare function probeAll(client: ProbeClient, { username, authMethod, tokenProbe, env, fluent, now, }?: Partial<{
    username: string;
    authMethod: 'basic' | 'oauth_ropc';
    tokenProbe: () => Promise<TokenResult>;
    env: NodeJS.ProcessEnv;
    fluent: typeof checkFluent;
    now: () => Date;
}>): Promise<ProbeAll & {
    at: string;
}>;
/**
 * The store shape.
 *
 * STATUSES ONLY. No username, no role list, no hint text — the store is read by the banner, the
 * doctor and `/snowarch status`, and a probe record that carried an account name would put it in
 * every one of them.
 */
export declare function toLastProbe(result: ProbeAll & {
    at: string;
}): LastProbe;
