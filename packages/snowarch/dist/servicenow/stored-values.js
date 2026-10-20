import { currentInstanceOrNull } from './context.js';
import { logger } from '../utils/logging.js';
import { ServiceNowError } from '../utils/errors.js';
/** The most warnings a result carries: nine whole ones and a roll-up, or ten whole ones. */
export const MAX_WARNINGS = 10;
/** Count code points without allocating an array — a script field can be tens of kilobytes. */
export function lengthOf(s) {
    let n = 0;
    for (let i = 0; i < s.length; i += 1) {
        const hi = s.charCodeAt(i);
        // A surrogate pair is one code point and two UTF-16 units; whether the platform counts the pair
        // as one character is not documented in the bundled corpus — verify on the instance.
        if (hi >= 0xd800 && hi <= 0xdbff && i + 1 < s.length) {
            const lo = s.charCodeAt(i + 1);
            if (lo >= 0xdc00 && lo <= 0xdfff)
                i += 1;
        }
        n += 1;
    }
    return n;
}
/** Line endings the platform may rewrite. Compared as LF so a CRLF script that is also cut is seen. */
const EOL = /\r\n?/g;
const normal = (s) => s.replace(EOL, '\n');
/** A string that is a decimal number WITH a point (`1.50`, `.5`, `1.`) — the only kind that can lose a tail harmlessly. */
const DECIMAL = /^[+-]?(\d[\d,]*)?\.\d*$/;
/** What a decimal may lose: its point and zeros after it. */
const ZERO_TAIL = /^\.?0*$/;
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
export function looksCut(sent, stored) {
    if (typeof sent !== 'string' || typeof stored !== 'string')
        return false;
    const a = normal(sent);
    const b = normal(stored);
    if (b === '' || b.length >= a.length)
        return false;
    if (!a.startsWith(b))
        return false;
    const tail = a.slice(b.length);
    if (tail.trim() === '')
        return false;
    if (DECIMAL.test(a.trim()) && ZERO_TAIL.test(tail))
        return false;
    return true;
}
/** Every field of `sent` that `stored` holds as a shorter prefix, in the order it was sent. RAW strings, not the normalised ones. */
export function findCuts(sent, stored) {
    const out = [];
    for (const field of Object.keys(sent)) {
        if (looksCut(sent[field], stored?.[field])) {
            out.push({ field, sent: sent[field], stored: stored[field] });
        }
    }
    return out;
}
/** Table and column names that are safe to put in an encoded query. Anything else is "unknown". */
const IDENT = /^[a-z][a-z0-9_]*$/i;
/** The dictionary's `max_length` as a limit; null when it states none (blank, 0, not a whole number). */
export function parseLimit(raw) {
    const n = typeof raw === 'number' ? raw : typeof raw === 'string' && /^\s*\d+\s*$/.test(raw) ? Number(raw) : NaN;
    return Number.isInteger(n) && n > 0 ? n : null;
}
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
export async function dictionaryLimits(client, table, fields) {
    const out = new Map(fields.map((f) => [f, null]));
    const safe = IDENT.test(table) ? [...new Set(fields.filter((f) => IDENT.test(f)))] : [];
    if (safe.length === 0)
        return out;
    const res = await client.queryRecords({
        table: 'sys_dictionary', query: `name=${table}^elementIN${safe.join(',')}`,
        fields: 'element,max_length', limit: safe.length,
        // No retries: this lookup is advisory, so a failure is the answer "unknown". A 403 is never
        // retried (ARC-09-C99); a 429, a 5xx or a dropped connection would otherwise spend 1s + 2s + 4s of
        // backoff while the tool's caller waits.
        retries: 0,
    });
    for (const row of (res.records ?? [])) {
        const element = row?.element;
        if (typeof element === 'string' && safe.includes(element) && out.get(element) === null) {
            out.set(element, parseLimit(row.max_length));
        }
    }
    return out;
}
function explain(p, cut, limit, sentLen, storedLen) {
    const where = `${p.table}.${cut.field}`;
    const head = limit !== null
        ? `${where}: ${sentLen} characters were sent; the dictionary states a maximum length of ${limit}, `
            + `and the platform stored the first ${storedLen} and reported success.`
        : `${where} appears to have been cut: ${sentLen} characters were sent and ${storedLen} were stored, so the `
            + `column seems to hold at least ${storedLen} (the dictionary did not state a limit: it may be defined on a `
            + 'parent table, or this account cannot read it).';
    const ignored = limit === null && p.operation === 'update'
        ? ' On an update this can also be a write the platform ignored (a field ACL or a data policy), which leaves the old value in place.'
        : '';
    const live = p.live
        ? ' The record is active: set active to false until it is corrected if the cut value changes what it does.'
        : '';
    // One entry per object per update set, and the latest version is the one included
    // (`vendor/ServiceNowDocs/markdown/application-development/system-update-sets/using-system-update-sets.md`).
    // Whether this table is captured at all is not known here, hence the condition.
    const captured = ' If update-set capture was on, its entry holds the cut value too: correct it while the same update '
        + 'set is still the capture target, so its latest version is the corrected one.';
    const fix = limit !== null
        ? `Correct it with a modify of at most ${limit} characters`
        : `Correct it with a modify (${storedLen} characters is known to fit)`;
    const tail = p.operation === 'create' ? ' — do not re-add it, which would make a second record.' : '.';
    return `${head}${ignored} The record exists with the stored value.${live}${captured} ${fix}${tail}`;
}
/**
 * The warning for one cut field, given what the dictionary stated for its column (`null` = unknown),
 * or `null` when the dictionary shows the value was not cut by length.
 *
 * Observation outranks the dictionary only as far as the dictionary can be wrong in a way that matters
 * here: it is not allowed to CONFIRM a limit the stored value contradicts, and it is not allowed to
 * explain away a cut under a counting unit it might not share with the platform.
 */
export function reconcile(p, cut, limit) {
    const sentLen = lengthOf(cut.sent);
    const storedLen = lengthOf(cut.stored);
    if (limit !== null) {
        // The limit fits what was sent under both ways of counting: the column did not shorten it.
        if (Math.max(sentLen, cut.sent.length) <= limit)
            return null;
        // The stored value is longer than the limit: the limit cannot be what cut it.
        if (storedLen > limit)
            return null;
    }
    return {
        code: 'VALUE_TRUNCATED', operation: p.operation, table: p.table, ...(p.sysId ? { sys_id: p.sysId } : {}),
        field: cut.field, sent_length: sentLen, stored_length: storedLen,
        column_limit: limit ?? storedLen, confirmed: limit !== null,
        message: explain(p, cut, limit, sentLen, storedLen),
    };
}
// ─── ARC-09-C97: refuse a too-long value before the write ───────────────────────────────────
//
// C93 reports a cut after the write, when the record and its update-set entry already exist. This reads
// the column's `max_length` first and refuses a longer string with VALUE_TOO_LONG, so nothing is sent.
// `max_length` is "a logical limit for the size of string fields", and only a String field's can be
// changed (vendor/ServiceNowDocs/markdown/platform-administration/table-administration-and-data-management/r_DictionaryEntryForm.md);
// rc.1 cut `sys_script.name` at exactly that limit (docs/PLATFORM-NOTES.md PN-10). A column a table
// inherits is the extended table's ("incorporates all the fields of the original table", t_CreateATable.md),
// and an override cannot change its length (c_DictionaryOverrides.md), so the limit is read on the table
// that defines it, walking up `sys_db_object.super_class` — a column the corpus does not name; the live run
// reads it. C93's check stays the backstop for every limit this cannot read.
/**
 * The pre-check's own budget, the same size as `SETTLE_BUDGET_MS` but never shared with it: a slow read
 * before the write must not eat the time C93 has to confirm a cut after it (the architect's ruling).
 */
export const PRECHECK_BUDGET_MS = 3000;
/** Keyed by instance — its label and URL — and never shared between instances. */
const instanceColumns = new Map();
/** Forget every instance's columns. For tests; the server never needs it. */
export function resetColumnLimits() { instanceColumns.clear(); }
/**
 * ARC-09-C183 — whether a create reads the data policies first. Always on in the server. The test setup turns it off,
 * because suites written before it count every request a write makes, and feed queued answers in order. The C183 suite
 * turns it back on and exercises it beside ARC-09-C97's check on the same write path. For tests; the server never calls it.
 */
let dataPolicyCheck = true;
export function setDataPolicyCheckForTests(on) { dataPolicyCheck = on; }
/** A transport-shaped value as its string: a reference's `value`, a scalar as itself. */
const plainValue = (v) => {
    if (v === null || v === undefined)
        return undefined;
    if (typeof v === 'object')
        return plainValue(v.value);
    return String(v);
};
/** The table `table` extends, by name, or null at the root. Read once per instance. */
async function parentOf(client, dict, table, budget) {
    if (dict.parents.has(table))
        return dict.parents.get(table) ?? null;
    const res = await client.queryRecords({
        table: 'sys_db_object', query: `name=${table}`, fields: 'sys_id,name,super_class', limit: 1, retries: 0,
    });
    if (budget.closed)
        return null;
    const row = (res.records ?? []).find((r) => plainValue(r.name) === table);
    const superId = plainValue(row?.super_class);
    let parent = null;
    if (superId) {
        const up = await client.getRecord('sys_db_object', superId, 'name');
        if (budget.closed)
            return null;
        parent = plainValue(up?.name) ?? null;
    }
    dict.parents.set(table, parent);
    return parent;
}
/**
 * Read `fields` of `table` from `sys_dictionary`, on the table and then up its chain until each is found or
 * the root is reached, and cache what was read. A field found nowhere is cached as unknown.
 */
async function readColumns(client, dict, table, fields, budget) {
    let missing = [...fields];
    let at = table;
    const seen = new Set();
    while (missing.length > 0 && at && !seen.has(at)) {
        seen.add(at);
        const res = await client.queryRecords({
            table: 'sys_dictionary', query: `name=${at}^elementIN${missing.join(',')}`,
            fields: 'element,max_length,internal_type', limit: missing.length, retries: 0,
        });
        if (budget.closed)
            return;
        for (const row of res.records ?? []) {
            const element = plainValue(row.element);
            if (!element || !missing.includes(element) || dict.columns.has(key(table, element)))
                continue;
            dict.columns.set(key(table, element), {
                limit: parseLimit(row.max_length), type: plainValue(row.internal_type) ?? null, definedOn: at,
            });
        }
        missing = missing.filter((f) => !dict.columns.has(key(table, f)));
        if (missing.length > 0)
            at = await parentOf(client, dict, at, budget);
        if (budget.closed)
            return;
    }
    for (const f of missing)
        dict.columns.set(key(table, f), { limit: null, type: null, definedOn: null });
}
/** One column read again, fresh, on the table that defines it: the only read a refusal may rest on. */
async function rereadColumn(client, dict, table, field, definedOn, budget) {
    const res = await client.queryRecords({
        table: 'sys_dictionary', query: `name=${definedOn}^elementIN${field}`,
        fields: 'element,max_length,internal_type', limit: 1, retries: 0,
    });
    if (budget.closed)
        return;
    const row = (res.records ?? []).find((r) => plainValue(r.element) === field);
    dict.columns.set(key(table, field), row
        ? { limit: parseLimit(row.max_length), type: plainValue(row.internal_type) ?? null, definedOn }
        : { limit: null, type: null, definedOn: null });
}
/**
 * Which string, if any, this write must not send. A cached "fits" passes without a request; a cached "too
 * long" is read again first, and only a limit read for this write refuses. A read that fails leaves the
 * write to go ahead, with C93 watching it — except AUTHENTICATION_FAILED, which is rethrown: the write would
 * carry the same credentials, and a second failed login on one call is a step towards a locked account.
 */
async function decide(client, dict, table, strings, budget) {
    try {
        const fresh = new Set(strings.map(([f]) => f).filter((f) => !dict.columns.has(key(table, f))));
        if (fresh.size > 0)
            await readColumns(client, dict, table, [...fresh], budget);
        for (const [field, value] of strings) {
            if (budget.closed)
                return null;
            let column = dict.columns.get(key(table, field));
            if (!column || column.type !== 'string' || column.limit === null)
                continue;
            const sentLength = lengthOf(value);
            if (sentLength <= column.limit)
                continue;
            if (!fresh.has(field) && column.definedOn) {
                await rereadColumn(client, dict, table, field, column.definedOn, budget);
                column = dict.columns.get(key(table, field));
                if (!column || column.type !== 'string' || column.limit === null || sentLength <= column.limit)
                    continue;
            }
            if (budget.closed || !column.definedOn)
                return null;
            return { table, field, sentLength, limit: column.limit, definedOn: column.definedOn };
        }
        return null;
    }
    catch (e) {
        if (e instanceof ServiceNowError && e.code === 'AUTHENTICATION_FAILED')
            throw e;
        if (e instanceof ServiceNowError && e.code === 'INSUFFICIENT_PRIVILEGES')
            dict.unreadable = true;
        logger.warn(`length pre-check skipped for ${table}: ${e instanceof Error ? e.message : String(e)}`);
        return null;
    }
}
/**
 * ARC-09-C97: before `table` is written with `data`, refuse a string longer than its column. Throws
 * VALUE_TOO_LONG, naming the writes this call already made (`written`), or the AUTHENTICATION_FAILED its own
 * read got within the budget; otherwise returns, having spent at most PRECHECK_BUDGET_MS. Outside an instance
 * context there is no instance to key a cache by: it returns.
 */
async function precheck(client, table, data, written, operation = 'update', notes = []) {
    const rt = currentInstanceOrNull();
    if (!rt || !isObject(data) || !IDENT.test(table))
        return;
    const dict = instanceDict(rt);
    if (operation === 'create')
        await mandatoryPrecheck(client, dict, table, data, written, notes);
    if (dict.unreadable)
        return;
    const strings = Object.entries(data)
        .filter((e) => typeof e[1] === 'string' && e[1] !== '' && IDENT.test(e[0]));
    if (strings.length === 0)
        return;
    const budget = { closed: false };
    let timer;
    const deadline = new Promise((resolve) => { timer = setTimeout(() => resolve(null), PRECHECK_BUDGET_MS); });
    let refusal;
    try {
        refusal = await Promise.race([decide(client, dict, table, strings, budget), deadline]);
    }
    finally {
        budget.closed = true;
        if (timer !== undefined)
            clearTimeout(timer);
    }
    if (!refusal)
        return;
    const earlier = written.length === 0 ? ''
        : ` This call already wrote ${written.map((w) => `${w.table} ${w.sys_id ?? '(no sys_id)'}`).join(', ')}: those records exist, `
            + 'so do not add them again.';
    throw new ServiceNowError(`${refusal.table}.${refusal.field}: ${refusal.sentLength} characters (code points) were about to be sent, and the column `
        + `holds at most ${refusal.limit} (max_length on ${refusal.definedOn}, read from sys_dictionary for this write). Nothing `
        + `was sent for this write. Shorten it to at most ${refusal.limit} characters and send it again.${earlier}`, 'VALUE_TOO_LONG', {
        table: refusal.table, field: refusal.field, sent_length: refusal.sentLength, column_limit: refusal.limit,
        defined_on: refusal.definedOn, written: written.map((w) => ({ ...w })),
    });
}
/** The cache for the instance a call runs on, created on first use. */
function instanceDict(rt) {
    const instance = `${rt.label}\u0000${rt.url}`;
    let dict = instanceColumns.get(instance);
    if (!dict) {
        dict = { unreadable: false, columns: new Map(), parents: new Map(), required: new Map(), policiesUnreadable: false };
        instanceColumns.set(instance, dict);
    }
    return dict;
}
/** No condition, or the condition builder's empty one: the rule always applies. */
const unconditional = (conditions) => !conditions || /^\^?EQ$/.test(conditions.trim());
/** Why a policy read failed, remembered when it was a refusal (the account will not be allowed on the next write either). */
function policyReadFailed(dict, table, what, e) {
    if (e instanceof ServiceNowError && e.code === 'AUTHENTICATION_FAILED')
        throw e;
    const code = e instanceof ServiceNowError ? e.code : 'UNKNOWN';
    const why = `the data policies could not be read (${what}, ${code})`;
    if (code === 'INSUFFICIENT_PRIVILEGES')
        dict.policiesUnreadable = true;
    logger.warn(`mandatory-field check skipped for ${table}: ${why}`);
    return { checked: false, why };
}
/** The table and the tables it extends, nearest first, from the cache ARC-09-C97 keeps. */
async function chainOf(client, dict, table, budget) {
    const chain = [table];
    for (let at = table; chain.length < 12;) {
        const up = await parentOf(client, dict, at, budget);
        if (!up || chain.includes(up))
            break;
        chain.push(up);
        at = up;
    }
    return chain;
}
/** What the active data policies require of `table`: two reads at most, once per table per instance. */
async function requirementsOf(client, dict, table, budget) {
    const cached = dict.required.get(table);
    if (cached)
        return cached;
    if (dict.policiesUnreadable)
        return { checked: false, why: 'the data policies could not be read (refused earlier in this session)' };
    let chain;
    try {
        chain = await chainOf(client, dict, table, budget);
    }
    catch (e) {
        return policyReadFailed(dict, table, 'sys_db_object', e);
    }
    let policies;
    try {
        policies = (await client.queryRecords({ table: 'sys_data_policy2', query: `active=true^model_tableIN${chain.join(',')}`,
            fields: 'sys_id,short_description,model_table,conditions,inherit,active', limit: 200, retries: 0 })).records;
    }
    catch (e) {
        return policyReadFailed(dict, table, 'sys_data_policy2', e);
    }
    if (policies.some((p) => plainValue(p.model_table) === undefined)) {
        const shape = { checked: false, why: 'sys_data_policy2 came back without model_table: its columns are not the ones this check reads' };
        dict.required.set(table, shape);
        return shape;
    }
    // Client-side as well as in the query: a condition on a column the instance does not have is ignored (c_TableAPI.md).
    const applying = policies.filter((p) => {
        const on = plainValue(p.model_table);
        return plainValue(p.active) !== 'false' && (on === table || (chain.includes(on) && isTrue(plainValue(p.inherit))));
    });
    let rules = [];
    if (applying.length > 0) {
        const byId = new Map(applying.map((p) => [plainValue(p.sys_id), p]));
        let rows;
        try {
            rows = (await client.queryRecords({ table: 'sys_data_policy_rule', query: `mandatory=true^sys_data_policyIN${[...byId.keys()].join(',')}`,
                fields: 'field,mandatory,sys_data_policy', limit: 500, retries: 0 })).records;
        }
        catch (e) {
            return policyReadFailed(dict, table, 'sys_data_policy_rule', e);
        }
        if (rows.some((r) => plainValue(r.field) === undefined)) {
            const shape = { checked: false, why: 'sys_data_policy_rule came back without field: its columns are not the ones this check reads' };
            dict.required.set(table, shape);
            return shape;
        }
        rules = rows.flatMap((r) => {
            const p = byId.get(plainValue(r.sys_data_policy) ?? '');
            if (!p || plainValue(r.mandatory) !== 'true')
                return [];
            const conditions = plainValue(p.conditions);
            return [{ field: plainValue(r.field), policy: plainValue(p.short_description) || plainValue(p.sys_id),
                    on: plainValue(p.model_table), condition: unconditional(conditions) ? null : conditions.trim() }];
        });
    }
    const done = { checked: true, chain, rules };
    dict.required.set(table, done);
    return done;
}
const absent = (data, field) => !(field in data) || data[field] === undefined || data[field] === null || data[field] === '';
/**
 * The unconditional rules `data` does not satisfy, and the note for the rest. A missing field the dictionary gives a
 * `default_value` is reported, not blocked: that a default satisfies a data policy is not documented in the bundled
 * corpus — verify on the instance. One dictionary read, only when something is missing.
 */
async function mandatoryCheck(client, dict, table, data, budget) {
    if (!dataPolicyCheck)
        return { missing: [], note: null };
    const req = await requirementsOf(client, dict, table, budget);
    if (!req.checked)
        return { missing: [], note: { table, not_checked: req.why } };
    let missing = req.rules.filter((r) => r.condition === null && absent(data, r.field));
    const conditional = req.rules.filter((r) => r.condition !== null && absent(data, r.field));
    const defaulted = [];
    if (missing.length > 0) {
        const fields = [...new Set(missing.map((r) => r.field))];
        try {
            const rows = (await client.queryRecords({ table: 'sys_dictionary', query: `nameIN${req.chain.join(',')}^elementIN${fields.join(',')}`,
                fields: 'name,element,default_value', limit: 100, retries: 0 })).records;
            for (const f of fields) {
                if (rows.some((r) => plainValue(r.element) === f && (plainValue(r.default_value) ?? '') !== ''))
                    defaulted.push(f);
            }
        }
        catch (e) {
            if (e instanceof ServiceNowError && e.code === 'AUTHENTICATION_FAILED')
                throw e;
            // An unreadable dictionary leaves the defaults unknown; the data policy still names the field, so it blocks.
        }
        missing = missing.filter((r) => !defaulted.includes(r.field));
    }
    const note = { table };
    if (conditional.length > 0) {
        note.may_be_required = conditional.map((r) => ({ field: r.field, policy: r.policy, condition: r.condition }));
    }
    if (defaulted.length > 0)
        note.defaulted = defaulted;
    return { missing, note: note.may_be_required || note.defaulted ? note : null };
}
/** One sentence per table: the fields, and the policy that names each. */
function requiresSentence(table, missing) {
    const fields = [...new Set(missing.map((r) => r.field))];
    const byPolicy = new Map();
    for (const r of missing) {
        const entry = byPolicy.get(r.policy) ?? { on: r.on, fields: [] };
        if (!entry.fields.includes(r.field))
            entry.fields.push(r.field);
        byPolicy.set(r.policy, entry);
    }
    const why = [...byPolicy].map(([policy, e]) => `data policy '${policy}'${e.on === table ? '' : ` (on ${e.on})`}: ${e.fields.join(', ')}`);
    return `The instance requires ${fields.join(', ')} for ${table} — ${why.join('; ')}.`;
}
/** The refusal: INVALID_REQUEST, since the instance has refused nothing yet, and what the Architect does next. */
function mandatoryRefusal(perTable, written) {
    const count = new Set(perTable.flatMap((t) => t.missing.map((r) => `${t.table}.${r.field}`))).size;
    const sentences = perTable.map((t) => requiresSentence(t.table, t.missing)).join(' ');
    const nothing = written.length === 0 ? 'Nothing was written.'
        : `Nothing was sent for this write. This call already wrote ${written.map((w) => `${w.table} ${w.sys_id ?? '(no sys_id)'}`).join(', ')}: `
            + 'those records exist, so do not add them again.';
    return new ServiceNowError(`${sentences} ${nothing} Ask the user for ${count === 1 ? 'the value' : 'the values'}, `
        + `then send ${count === 1 ? 'it' : 'them'} with the write.`, 'INVALID_REQUEST', {
        required: perTable.map((t) => ({ table: t.table, fields: [...new Set(t.missing.map((r) => r.field))] })),
        written: written.map((w) => ({ ...w })),
    });
}
/** Run `work` under the pre-check budget; `null` when the budget ran out first. */
async function withinBudget(work) {
    const budget = { closed: false };
    let timer;
    const deadline = new Promise((resolve) => { timer = setTimeout(() => resolve(null), PRECHECK_BUDGET_MS); });
    try {
        return await Promise.race([work(budget), deadline]);
    }
    finally {
        budget.closed = true;
        if (timer !== undefined)
            clearTimeout(timer);
    }
}
/** Before a create on the write path: refuse what a data policy would refuse, and note the rest once per table. */
async function mandatoryPrecheck(client, dict, table, data, written, notes) {
    const result = await withinBudget((budget) => mandatoryCheck(client, dict, table, data, budget));
    const note = result === null
        ? { table, not_checked: `the data-policy read did not finish within ${PRECHECK_BUDGET_MS} ms` }
        : result.note;
    if (note && !notes.some((n) => n.table === table))
        notes.push(note);
    if (result && result.missing.length > 0)
        throw mandatoryRefusal([{ table, missing: result.missing }], written);
}
/**
 * ARC-09-C183 — for a tool that writes several records: every table it will create on, with the payload it will send,
 * checked before its FIRST write, so a refusal leaves nothing behind. Outside an instance context there is nothing to
 * key the cache by, and it returns. The notes are left to the write path, which adds them as each record is created.
 */
export async function assertMandatory(client, plans) {
    const rt = currentInstanceOrNull();
    if (!rt)
        return;
    const dict = instanceDict(rt);
    const perTable = [];
    for (const plan of plans) {
        const result = await withinBudget((budget) => mandatoryCheck(client, dict, plan.table, plan.payload, budget));
        if (!result || result.missing.length === 0)
            continue;
        const at = perTable.find((t) => t.table === plan.table);
        if (at)
            at.missing.push(...result.missing.filter((r) => !at.missing.some((m) => m.field === r.field)));
        else
            perTable.push({ table: plan.table, missing: result.missing });
    }
    if (perTable.length > 0)
        throw mandatoryRefusal(perTable, []);
}
// ─── The per-invocation wrapper ──────────────────────────────────────────────────────────────
/** How long `settle` may spend on dictionary lookups in total, before the warnings go out unconfirmed. */
export const SETTLE_BUDGET_MS = 3000;
/** Every client this module has wrapped, mapped to the state its invocation shares. */
const wrapped = new WeakMap();
const key = (table, field) => `${table}\u0000${field}`;
/**
 * Read the limits for every cut column in `batch`: one request per table, all under `budgetMs`, the
 * first failure ends the reading. Never rejects. What was not read stays absent from the map.
 */
async function readLimits(client, batch, budgetMs) {
    const byTable = new Map();
    for (const p of batch) {
        const fields = byTable.get(p.table) ?? new Set();
        for (const c of p.cuts)
            fields.add(c.field);
        byTable.set(p.table, fields);
    }
    const limits = new Map();
    let closed = false;
    const work = (async () => {
        for (const [table, fields] of byTable) {
            if (closed)
                return;
            let got;
            try {
                got = await dictionaryLimits(client, table, [...fields]);
            }
            catch (e) {
                // Any failure, authentication included, ends the reading: nothing else is asked of an
                // instance that just refused, and the warnings go out unconfirmed.
                logger.warn(`dictionary lookup stopped after a failure on ${table}: ${e instanceof Error ? e.message : String(e)}`);
                return;
            }
            if (closed)
                return; // the budget ran out while this request was in flight
            for (const [field, n] of got)
                limits.set(key(table, field), n);
        }
    })();
    let timer;
    const deadline = new Promise((resolve) => {
        timer = setTimeout(() => {
            logger.warn(`dictionary lookup abandoned after ${budgetMs}ms; the cut values are reported unconfirmed`);
            resolve();
        }, budgetMs);
    });
    try {
        await Promise.race([work, deadline]);
    }
    finally {
        closed = true;
        if (timer !== undefined)
            clearTimeout(timer);
    }
    return limits;
}
const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const isTrue = (v) => v === true || v === 'true';
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
export function withWriteVerification(client) {
    const existing = wrapped.get(client);
    if (existing)
        return { client, owner: false, settle: async () => [], notes: () => [] };
    const state = { pending: [], warnings: [], written: [], notes: [] };
    const proxy = wrapClient(client, state);
    const settle = async (budgetMs = SETTLE_BUDGET_MS) => {
        const batch = state.pending.splice(0);
        if (batch.length === 0)
            return state.warnings;
        const { warnings, explainedAway } = await reconcileBatch(client, batch, budgetMs);
        state.warnings.push(...warnings);
        // A trace for the server's own log; tables and counts only, never a value.
        if (state.warnings.length > 0) {
            logger.warn(`${state.warnings.length} write(s) stored a cut value (tables: ${[...new Set(state.warnings.map((w) => w.table))].join(', ')})`);
        }
        if (explainedAway > 0) {
            logger.info(`${explainedAway} shorter stored value(s) were explained by the dictionary limit and not reported`);
        }
        return state.warnings;
    };
    return { client: proxy, owner: true, settle, notes: () => state.notes };
}
/** Compare what a write sent with what the platform answered, and queue a cut for `settle`. Never throws. */
function record(state, operation, table, sysId, sent, stored) {
    try {
        if (!isObject(sent) || !isObject(stored))
            return;
        const cuts = findCuts(sent, stored);
        if (cuts.length === 0)
            return;
        const id = sysId ?? (typeof stored.sys_id === 'string' ? stored.sys_id : undefined);
        state.pending.push({ operation, table, sysId: id, live: isTrue(sent.active) || isTrue(stored.active), cuts });
    }
    catch (e) {
        // A check on a write that SUCCEEDED must never turn it into a failure.
        logger.warn(`write verification skipped for ${table}: ${e instanceof Error ? e.message : String(e)}`);
    }
}
/** Note a write this call made, so a later refusal in the same call can name it (ARC-09-C97). Never throws. */
function remember(state, operation, table, sysId, stored) {
    const id = sysId ?? (isObject(stored) && typeof stored.sys_id === 'string' ? stored.sys_id : undefined);
    state.written.push({ table, ...(id ? { sys_id: id } : {}), operation });
}
/** `/api/now/table/<table>` or `/api/now/table/<table>/<sys_id>`, with an optional version and query. */
const TABLE_PATH = /^\/?api\/now(?:\/v\d+)?\/table\/([A-Za-z][A-Za-z0-9_]*)(?:\/([0-9a-f]{32}))?\/?$/i;
function tableTarget(url) {
    if (typeof url !== 'string')
        return null;
    const m = TABLE_PATH.exec(url.split('#')[0].split('?')[0]);
    return m ? { table: m[1], ...(m[2] ? { sysId: m[2] } : {}) } : null;
}
/**
 * The answer's body as an object, whatever shape it arrived in. The documented API sends
 * `serviced_requests.body` Base64 encoded (`api-reference/rest-apis/batch-api.md`). `client.batchRequest`
 * decodes it since ARC-09-C108, so this normally receives an object; it still reads Base64 and JSON text,
 * because the wrapper does not own the client it wraps (a test double, or a client that did not decode).
 * Anything that does not come out as an object is not a record to compare.
 */
function batchBody(body) {
    if (isObject(body))
        return body;
    if (typeof body !== 'string' || body === '')
        return undefined;
    for (const text of [body, Buffer.from(body, 'base64').toString('utf8')]) {
        try {
            const parsed = JSON.parse(text);
            if (isObject(parsed))
                return parsed;
        }
        catch { /* not JSON in this encoding */ }
    }
    return undefined;
}
/**
 * The Batch API can write any table, and each answer in `results` echoes the stored record
 * (`{ id, status_code, body: { result } }`). A write is checked when the platform answered 2xx for it,
 * the request named a table path, and the method fits the path: POST to the table, PATCH or PUT to a
 * record. Anything else - a GET, another API, a refused write - has no stored value to compare.
 */
function recordBatch(state, operations, answer) {
    try {
        if (!Array.isArray(operations) || !isObject(answer) || !Array.isArray(answer.results))
            return;
        const byId = new Map();
        for (const op of operations)
            if (isObject(op) && !byId.has(op.id))
                byId.set(op.id, op);
        for (const r of answer.results) {
            if (!isObject(r) || typeof r.status_code !== 'number' || r.status_code < 200 || r.status_code >= 300)
                continue;
            const op = byId.get(r.id);
            if (!op || typeof op.method !== 'string')
                continue;
            const target = tableTarget(op.url);
            if (!target)
                continue;
            const method = op.method.toUpperCase();
            const operation = method === 'POST' && !target.sysId ? 'create'
                : (method === 'PATCH' || method === 'PUT') && target.sysId ? 'update' : null;
            if (!operation)
                continue;
            const stored = batchBody(r.body)?.result;
            record(state, operation, target.table, target.sysId, op.body, stored);
            remember(state, operation, target.table, target.sysId, stored);
        }
    }
    catch (e) {
        logger.warn(`batch write verification skipped: ${e instanceof Error ? e.message : String(e)}`);
    }
}
/**
 * The Proxy itself, shared by the invocation's client and by every copy made from it: a copy is a
 * client of its own (`withUser` returns one) and a write through it is the same invocation's write.
 */
function wrapClient(client, state) {
    const proxy = new Proxy(client, {
        get(target, prop) {
            const real = target;
            if (prop === 'createRecord') {
                return async (table, data) => {
                    await precheck(real, table, data, state.written, 'create', state.notes);
                    const stored = await real.createRecord(table, data);
                    record(state, 'create', table, undefined, data, stored);
                    remember(state, 'create', table, undefined, stored);
                    return stored;
                };
            }
            if (prop === 'updateRecord') {
                return async (table, sysId, data) => {
                    await precheck(real, table, data, state.written, 'update');
                    const stored = await real.updateRecord(table, sysId, data);
                    record(state, 'update', table, sysId, data, stored);
                    remember(state, 'update', table, sysId, stored);
                    return stored;
                };
            }
            const value = Reflect.get(target, prop, target);
            if (typeof value !== 'function')
                return value;
            if (prop === 'batchRequest') {
                return async (operations) => {
                    const answer = await value.call(target, operations);
                    recordBatch(state, operations, answer);
                    return answer;
                };
            }
            if (prop === 'uploadAttachment') {
                return async (...args) => {
                    const stored = await value.apply(target, args);
                    record(state, 'create', 'sys_attachment', undefined, { file_name: args[2] }, stored);
                    remember(state, 'create', 'sys_attachment', undefined, stored);
                    return stored;
                };
            }
            if (prop === 'createChangeRequest') {
                return async (params) => {
                    await precheck(real, 'change_request', params, state.written, 'create', state.notes);
                    const stored = await value.call(target, params);
                    record(state, 'create', 'change_request', undefined, params, stored);
                    remember(state, 'create', 'change_request', undefined, stored);
                    return stored;
                };
            }
            if (prop === 'withUser') {
                return (options) => wrapClient(value.call(target, options), state);
            }
            return value.bind(target);
        },
    });
    wrapped.set(proxy, state);
    return proxy;
}
/** Read the limits for a batch of pending cuts and reconcile each. Never rejects. */
async function reconcileBatch(client, batch, budgetMs) {
    const limits = await readLimits(client, batch, budgetMs);
    const warnings = [];
    let explainedAway = 0;
    for (const p of batch) {
        for (const cut of p.cuts) {
            const w = reconcile(p, cut, limits.get(key(p.table, cut.field)) ?? null);
            if (w)
                warnings.push(w);
            else
                explainedAway += 1;
        }
    }
    return { warnings, explainedAway };
}
/**
 * Begin attributing writes to one step of a playbook (ARC-09-C100). Without this the warnings of
 * every step arrive together on the playbook's result, with no sign of which step wrote the cut value.
 * Returns `null` for a client that is not a wrapper (a direct call with no invocation around it): there
 * is nothing to attribute and the caller carries on as it did.
 */
export function beginStep(client) {
    const state = wrapped.get(client);
    if (!state)
        return null;
    const mark = state.pending.length;
    let ended = false;
    return {
        async end(meta, budgetMs = SETTLE_BUDGET_MS) {
            if (ended)
                return [];
            ended = true;
            const batch = state.pending.splice(mark);
            if (batch.length === 0)
                return [];
            try {
                const { warnings } = await reconcileBatch(client, batch, budgetMs);
                const tagged = warnings.map((w) => ({ ...w, step: meta.step, tool: meta.tool }));
                state.warnings.push(...tagged);
                return tagged;
            }
            catch (e) {
                // reconcileBatch does not reject; this is the second line. The writes stay unreported rather
                // than the step failing for a check on a write that succeeded.
                logger.warn(`step ${meta.step}: stored-value check failed: ${e instanceof Error ? e.message : String(e)}`);
                return [];
            }
        },
    };
}
// ─── Carrying the warnings out ───────────────────────────────────────────────────────────────
/**
 * Only a prototype-less or `Object.prototype` object can take a new key without losing something:
 * a Date, a Map or a class instance would be flattened by a spread.
 */
const isPlain = (v) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v))
        return false;
    const proto = Object.getPrototypeOf(v);
    return proto === Object.prototype || proto === null;
};
const countOf = (w) => {
    const c = w.count;
    return typeof c === 'number' && Number.isInteger(c) && c > 0 ? c : 1;
};
/**
 * At most `MAX_WARNINGS` entries: the first nine whole, then ONE roll-up for everything after them
 * (how many writes, on which tables and fields). A bulk tool can store a cut value in every record it
 * writes - `snow_deploy_cmdb_data_import` takes 50 - and a whole warning is about 700 characters, so
 * fifty of them put ~36 KB ahead of the result the caller asked for, in the first key, which is the
 * last thing a size ceiling cuts. The owner still holds every warning, the audit trail counts them
 * through the roll-up's `count`, and the roll-up says how many it stands for.
 */
export function capWarnings(warnings) {
    if (warnings.length <= MAX_WARNINGS)
        return [...warnings];
    const kept = warnings.slice(0, MAX_WARNINGS - 1);
    const rest = warnings.slice(MAX_WARNINGS - 1);
    const tables = new Set();
    const fields = new Set();
    let count = 0;
    for (const w of rest) {
        count += countOf(w);
        if (typeof w.table === 'string')
            tables.add(w.table);
        if (Array.isArray(w.tables))
            for (const t of w.tables)
                if (typeof t === 'string')
                    tables.add(t);
        if (typeof w.field === 'string')
            fields.add(w.field);
        if (Array.isArray(w.fields))
            for (const f of w.fields)
                if (typeof f === 'string')
                    fields.add(f);
    }
    const tableList = [...tables].slice(0, 5);
    const fieldList = [...fields].slice(0, 10);
    const rollup = {
        code: 'VALUE_TRUNCATED', rollup: true, count,
        ...(tableList.length === 1 && tables.size === 1 ? { table: tableList[0] } : {}),
        tables: tableList, fields: fieldList,
        message: `${count} more write(s) stored a cut value and are not listed here`
            + `${tableList.length ? ` (tables: ${tableList.join(', ')}${tables.size > tableList.length ? ', …' : ''}` : ''}`
            + `${tableList.length ? `; fields: ${fieldList.join(', ')}${fields.size > fieldList.length ? ', …' : ''})` : ''}. `
            + 'Read each record back and correct the cut values with a modify; do not re-add the records.',
    };
    return [...kept, rollup];
}
/** A list of things shaped like warnings — each an object with a string `code`. */
const isWarningList = (v) => Array.isArray(v) && v.every((x) => isObject(x) && typeof x.code === 'string');
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
export function attachWarnings(result, all) {
    if (all.length === 0)
        return result;
    const warnings = capWarnings(all);
    if (isPlain(result)) {
        const { warnings: prior, ...rest } = result;
        if (prior === undefined)
            return { warnings, ...rest };
        if (isWarningList(prior))
            return { warnings: [...prior, ...warnings], ...rest };
    }
    return { warnings, result };
}
/**
 * ARC-09-C183 — the mandatory-field notes on the result: a conditional policy, a defaulted field, or a check that could
 * not be made. Only a plain-object result takes them; any other shape is left as it is and the server log has the note.
 */
export function attachMandatoryNotes(result, notes) {
    if (notes.length === 0)
        return result;
    if (isPlain(result))
        return { ...result, mandatory_fields: notes };
    logger.info(`mandatory-field notes not attached to a ${Array.isArray(result) ? 'list' : typeof result} result: ${JSON.stringify(notes)}`);
    return result;
}
const ON_ERROR = Symbol.for('snowarch.storedValueWarnings');
/**
 * Hang the warnings off an error that is about to be thrown, so the layer that renders it can say
 * that an earlier write in the same call stored a cut value. A non-enumerable symbol key: it is not
 * serialised, not logged with the error, and not mistaken for the error's own fields.
 */
export function carryWarningsOnError(error, warnings) {
    if (warnings.length === 0 || typeof error !== 'object' || error === null)
        return;
    try {
        Object.defineProperty(error, ON_ERROR, { value: capWarnings(warnings), enumerable: false, configurable: true });
    }
    catch { /* a frozen error: the server log still has the line */ }
}
/** The warnings an error carries out of a tool that wrote before it threw, or `[]`. */
export function carriedWarnings(error) {
    if (typeof error !== 'object' || error === null)
        return [];
    const carried = error[ON_ERROR];
    return Array.isArray(carried) ? carried : [];
}
/**
 * One sentence about cuts that happened before a tool threw, or `''`. Server-built from the warnings;
 * it never repeats the error's own text and never contains a `(Code: …)` marker, which the session
 * rules read as the error's code.
 */
export function describeCutsOnError(error) {
    const carried = carriedWarnings(error);
    if (carried.length === 0)
        return '';
    const total = carried.reduce((n, w) => n + countOf(w), 0);
    const whole = carried.filter((w) => !('rollup' in w));
    const listed = whole.slice(0, 5)
        .map((w) => `${w.table}.${w.field}${w.sys_id ? ` (${w.sys_id})` : ''}: ${w.sent_length} characters sent, ${w.stored_length} stored`);
    const more = total > listed.length ? `; and ${total - listed.length} more` : '';
    return `Note: before this error, ${total} write(s) in the same call stored a cut value — ${listed.join('; ')}${more}. `
        + 'Those records exist with the cut value: correct them with a modify, do not re-add them.';
}
