/**
 * What the platform STORED, compared with what was SENT (ARC-09-C93).
 *
 * THE PROBLEM. A string longer than its column is, on the evidence, not refused: the Table API stores
 * the first N characters, answers 2xx, and echoes the cut value (`docs/PLATFORM-NOTES.md` PN-07,
 * observed on `sys_script_fix.name` with a POST; the owner's live test, finding R4, reported a
 * Business Rule name cut at 40). Most tools then built their success line from the ARGUMENT —
 * "Created business rule <the long name>" — so the report agreed with the request instead of the
 * record. The premise that `sys_script` and a PATCH behave the same is ASSUMED, not seen; the
 * procedure that settles it is in `packages/snowarch/tests/live/README.md`.
 *
 * THE DESIGN, in three parts, each chosen from what was measured:
 *
 *   1. DETECT from the write's own response. `createRecord` and `updateRecord` return the platform's
 *      record, and no tool compares it with what it sent. Comparing costs no request. The comparison
 *      lives where every tool already passes: `routeToolInvocation` wraps the client for one
 *      invocation (`withWriteVerification`), so a tool needs no edit for the check to cover it.
 *      Detection is CPU only and runs inside the write, so the write's latency is the write's.
 *
 *   2. CONFIRM AND NAME THE LIMIT, afterwards and only if something was cut. When the tool has
 *      finished — returned or thrown — `settle` reads `sys_dictionary.max_length` for the cut columns:
 *      one request per TABLE, one total budget, and the first failed lookup stops the rest (a failed
 *      login that is repeated is how an account is locked). Nothing is read before a write. The only
 *      other dictionary reader in the server (`snow_disco_table_discover`) turns a blank limit into
 *      255, keys its cache by table without the instance, and does not walk inherited columns, so a
 *      limit taken from it BEFORE a write could refuse a valid write. Here a wrong limit can mislabel
 *      a warning or, below, hide one; it can never block a write.
 *
 *   3. REPORT in the tool's result as `warnings`, and on the error of a tool that throws after it
 *      wrote. The server cannot stop the cut — by the time the response says so, the record exists.
 *      Refusing BEFORE the write needs the limit first; PN-10 lists what that needs and why it waits.
 *
 * WHAT THE DICTIONARY IS ALLOWED TO DO. `max_length` is "a logical limit for the size of string
 * fields" (`vendor/ServiceNowDocs/markdown/platform-administration/table-administration-and-data-management/r_DictionaryEntryForm.md`),
 * and the page says the system maps it to a physical type with more length available than stated. So
 * "the platform cuts at exactly `max_length`" is not documented in the bundled corpus — verify on the
 * instance; the live run confirms it for `sys_script.name` only. The warning therefore says what the
 * dictionary STATES, never that the column "holds" it. The dictionary may:
 *   - confirm a cut (`confirmed: true`) when the stored value fits the limit and the sent one did not;
 *   - suppress a warning when the limit fits the sent value under BOTH ways of counting characters
 *     (code points and UTF-16 units; which one the platform uses is not documented — verify), because
 *     then something other than the column shortened the value, usually a normalisation;
 *   - suppress a warning when the STORED value is longer than the limit, which proves the limit did
 *     not cut it (a sanitiser removed a tail from an HTML field).
 * It cannot answer for a column defined on a PARENT table (`incident.short_description` is defined
 * on `task`): there is no row under the child's name, so those warnings stay `confirmed: false`, and
 * a benign normalisation on such a column is not suppressed. That is a known gap (PN-10).
 *
 * WHAT IT SEES (ARC-09-C100). `createRecord` and `updateRecord`, and the other methods that send a
 * write and get the stored record back: `batchRequest` (`snow_fluent_request_batch`: each POST, PATCH
 * or PUT to `/api/now/table/<table>[/<sys_id>]` that the platform answered 2xx), `uploadAttachment`
 * (the `file_name` of the `sys_attachment` row), `createChangeRequest`, and a client copy made with
 * `withUser`, which shares the invocation's list.
 *
 * WHAT IT DOES NOT SEE. `callNowAssist` and the catalogue order: they POST to something that RUNS and
 * answers with the result of running it, not with the record that was written, so there is no stored
 * value to compare a sent one with. A batch operation on a path that is not the Table API is the same.
 * Only STRING values are compared.
 * A field the response does not echo (a journal field, a password, a column the account can write but
 * not read) can never warn, so an absent `warnings` key is not proof that nothing was cut.
 *
 * FALSE ALARMS ARE THE OTHER FAILURE. A warning raised for a decimal that lost its trailing zero
 * teaches the reader to skip the one that matters, so the signature is narrow: both values are
 * strings, the stored one is non-empty and strictly shorter, it is a PREFIX of what was sent once line
 * endings are normalised, and what is gone contains something other than whitespace and is not just a
 * decimal's trailing zeros. Reformats that drop a tail and are NOT exempt — a datetime written to a
 * date column, a trailing list delimiter, a sanitised HTML tail — do warn unless the dictionary rules
 * them out; `tests/servicenow/stored-values.test.ts` names the ones it knows.
 */
import type { ServiceNowClient } from './client.js';
export interface CutValueWarning {
    code: 'VALUE_TRUNCATED';
    operation: 'create' | 'update';
    table: string;
    sys_id?: string;
    field: string;
    /**
     * Characters, counted in Unicode code points. That the platform counts the same way is an
     * assumption (not documented in the bundled corpus — verify on the instance).
     */
    sent_length: number;
    stored_length: number;
    /**
     * When `confirmed`, the `max_length` the dictionary states for the column. Otherwise the length the
     * platform stored: a LOWER bound of the real limit, because whitespace the platform trimmed after
     * the cut makes the stored value shorter than the column allowed.
     */
    column_limit: number;
    /** True when the dictionary stated the limit and it explains the cut. False means inferred. */
    confirmed: boolean;
    message: string;
    /** Set when the write was made by a step of a playbook: the step's index and the tool it ran. */
    step?: number;
    tool?: string;
}
/**
 * What stands in for the warnings past the first nine (`capWarnings`): how many writes, on which
 * tables and fields. It is shaped like a warning (a known `code`, a `table` when there is one) and
 * carries a `count`, so the audit summary still counts every write.
 */
export interface CutValueRollup {
    code: 'VALUE_TRUNCATED';
    rollup: true;
    count: number;
    table?: string;
    tables: string[];
    fields: string[];
    message: string;
}
/** The most warnings a result carries: nine whole ones and a roll-up, or ten whole ones. */
export declare const MAX_WARNINGS = 10;
/** Count code points without allocating an array — a script field can be tens of kilobytes. */
export declare function lengthOf(s: string): number;
/**
 * Does `stored` look like `sent` cut short?
 *
 * Both must be strings and `stored` non-empty — an empty echo is a field the response does not
 * carry (a journal input, a password), and absence is not a cut. After line endings are normalised it
 * must be strictly shorter and a PREFIX of what was sent, and the part that is gone must contain
 * something other than whitespace (a trailing space the platform trimmed is a normalisation, not a
 * loss). The one exemption is a decimal that lost only its trailing zeros: `"1.50"` becoming `"1.5"`
 * is a decimal's business. It is deliberately NOT exempt by shape — a string of digits with no point
 * has no way to lose its tail harmlessly, and an all-digit label, an identifier or a list of integers
 * that is cut must warn.
 */
export declare function looksCut(sent: unknown, stored: unknown): boolean;
export interface CutField {
    field: string;
    sent: string;
    stored: string;
}
/** Every field of `sent` that `stored` holds as a shorter prefix, in the order it was sent. RAW strings, not the normalised ones. */
export declare function findCuts(sent: Record<string, unknown>, stored: Record<string, unknown>): CutField[];
/** The dictionary's `max_length` as a limit; null when it states none (blank, 0, not a whole number). */
export declare function parseLimit(raw: unknown): number | null;
/**
 * `sys_dictionary.max_length` for columns of ONE table, one request: a map from each field asked
 * about to its limit, or `null` when none can be stated.
 *
 * Null covers every way of not knowing: the column is defined on a PARENT table (so there is no row
 * under this table's name), the limit is blank or 0, or the name is not safe to put in a query. It is
 * never a default — the discovery tool's `|| 255` is exactly the placeholder this must not repeat —
 * and it is read fresh, never cached, because it is only reached after a cut and a cache keyed
 * without the instance would answer for the wrong one.
 *
 * A request that FAILS rejects. The caller needs to know the lookup failed — to stop asking, not to
 * mistake "could not read" for "no limit" — and swallowing it here would hide that. Reading the
 * dictionary needs an elevated role (`personalize_dictionary`), so for a restricted account every
 * lookup fails.
 */
export declare function dictionaryLimits(client: Pick<ServiceNowClient, 'queryRecords'>, table: string, fields: string[]): Promise<Map<string, number | null>>;
/** One write that came back with at least one cut field, waiting for its limits. */
export interface Pending {
    operation: 'create' | 'update';
    table: string;
    sysId?: string;
    /** The record is active: it is already running with whatever was cut. */
    live: boolean;
    cuts: CutField[];
}
/**
 * The warning for one cut field, given what the dictionary stated for its column (`null` = unknown),
 * or `null` when the dictionary shows the value was not cut by length.
 *
 * Observation outranks the dictionary only as far as the dictionary can be wrong in a way that matters
 * here: it is not allowed to CONFIRM a limit the stored value contradicts, and it is not allowed to
 * explain away a cut under a counting unit it might not share with the platform.
 */
export declare function reconcile(p: Pending, cut: CutField, limit: number | null): CutValueWarning | null;
/**
 * The pre-check's own budget, the same size as `SETTLE_BUDGET_MS` but never shared with it: a slow read
 * before the write must not eat the time C93 has to confirm a cut after it (the architect's ruling).
 */
export declare const PRECHECK_BUDGET_MS = 3000;
/** Forget every instance's columns. For tests; the server never needs it. */
export declare function resetColumnLimits(): void;
export declare function setDataPolicyCheckForTests(on: boolean): void;
/** What a create's result says about mandatory fields it did not block on. One per table. */
export interface MandatoryNote {
    table: string;
    may_be_required?: Array<{
        field: string;
        policy: string;
        condition: string;
    }>;
    defaulted?: string[];
    not_checked?: string;
}
/**
 * ARC-09-C183 — for a tool that writes several records: every table it will create on, with the payload it will send,
 * checked before its FIRST write, so a refusal leaves nothing behind. Outside an instance context there is nothing to
 * key the cache by, and it returns. The notes are left to the write path, which adds them as each record is created.
 */
export declare function assertMandatory(client: ServiceNowClient, plans: Array<{
    table: string;
    payload: Record<string, unknown>;
}>): Promise<void>;
/** How long `settle` may spend on dictionary lookups in total, before the warnings go out unconfirmed. */
export declare const SETTLE_BUDGET_MS = 3000;
export interface Verified {
    client: ServiceNowClient;
    /** False when `client` was already a wrapper: an outer invocation owns the warnings. */
    owner: boolean;
    /**
     * Call once the tool has finished, whether it returned or threw. Reads the dictionary (once per
     * table, within `budgetMs`, stopping at the first failure) and returns every warning of the
     * invocation. A second call asks nothing new. A non-owner returns `[]`: its writes are reported by
     * the outer invocation.
     */
    settle(budgetMs?: number): Promise<CutValueWarning[]>;
    /** ARC-09-C183: what the creates of this invocation were told about mandatory fields, one note per table. */
    notes(): MandatoryNote[];
}
/**
 * Wrap `client` for ONE tool invocation so `createRecord` and `updateRecord` are checked.
 *
 * A Proxy rather than a subclass or a copy: `Object.create(client)` would put the client's mutable
 * state (its token) on the copy and re-authenticate on every invocation; every other method must run
 * with `this` as the REAL client so a class with `#private` fields still works; and nothing may be
 * CALLED at wrap time, because the gate tests hand the router a client that throws when a method is
 * called. Known limits of a Proxy here: `proxy.method === proxy.method` is false (each access binds
 * a new function), `proxy.constructor` is a bound function, and a frozen target would throw on a
 * function property — the real client is none of those, and nothing reads them.
 *
 * Re-entrant: an orchestration step calls `routeToolInvocation` with the client it was given, which
 * is already a wrapper. That call joins the outer invocation's state instead of starting a second
 * one, so a cut is reported once, on the outermost result.
 */
export declare function withWriteVerification(client: ServiceNowClient): Verified;
export interface StepScope {
    /**
     * Settle the writes made since the scope began and return THEIR warnings, tagged with the step and
     * the tool. They stay in the invocation's list, so the outermost result still reports every write
     * once. A second call returns `[]`.
     */
    end(meta: {
        step: number;
        tool: string;
    }, budgetMs?: number): Promise<CutValueWarning[]>;
}
/**
 * Begin attributing writes to one step of a playbook (ARC-09-C100). Without this the warnings of
 * every step arrive together on the playbook's result, with no sign of which step wrote the cut value.
 * Returns `null` for a client that is not a wrapper (a direct call with no invocation around it): there
 * is nothing to attribute and the caller carries on as it did.
 */
export declare function beginStep(client: ServiceNowClient): StepScope | null;
/**
 * At most `MAX_WARNINGS` entries: the first nine whole, then ONE roll-up for everything after them
 * (how many writes, on which tables and fields). A bulk tool can store a cut value in every record it
 * writes - `snow_deploy_cmdb_data_import` takes 50 - and a whole warning is about 700 characters, so
 * fifty of them put ~36 KB ahead of the result the caller asked for, in the first key, which is the
 * last thing a size ceiling cuts. The owner still holds every warning, the audit trail counts them
 * through the roll-up's `count`, and the roll-up says how many it stands for.
 */
export declare function capWarnings<T extends {
    code: string;
}>(warnings: T[]): Array<T | CutValueRollup>;
/**
 * Put the warnings on the result the caller reads. A plain-object result gains a `warnings` array
 * (any warnings the tool already produced stay ahead of ours). Anything else — an array, a string, a
 * Date, or a record whose own `warnings` COLUMN is not a list of warnings — cannot take the key
 * without losing or coercing something, so it is wrapped as `{ warnings, result }`: a changed shape on
 * the rare path is better than a cut value nobody was told about.
 *
 * `warnings` is the first named key, on purpose. A result over the client's size ceiling is cut from
 * the END of its text (`capResult`, strategy `chars`), so a warning appended last is the first thing
 * a large result loses — and a large result is the script body whose cut matters most.
 */
export declare function attachWarnings(result: unknown, all: CutValueWarning[]): unknown;
/**
 * ARC-09-C183 — the mandatory-field notes on the result: a conditional policy, a defaulted field, or a check that could
 * not be made. Only a plain-object result takes them; any other shape is left as it is and the server log has the note.
 */
export declare function attachMandatoryNotes(result: unknown, notes: MandatoryNote[]): unknown;
/**
 * Hang the warnings off an error that is about to be thrown, so the layer that renders it can say
 * that an earlier write in the same call stored a cut value. A non-enumerable symbol key: it is not
 * serialised, not logged with the error, and not mistaken for the error's own fields.
 */
export declare function carryWarningsOnError(error: unknown, warnings: CutValueWarning[]): void;
/** The warnings an error carries out of a tool that wrote before it threw, or `[]`. */
export declare function carriedWarnings(error: unknown): Array<CutValueWarning | CutValueRollup>;
/**
 * One sentence about cuts that happened before a tool threw, or `''`. Server-built from the warnings;
 * it never repeats the error's own text and never contains a `(Code: …)` marker, which the session
 * rules read as the error's code.
 */
export declare function describeCutsOnError(error: unknown): string;
