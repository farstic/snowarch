import { assertMandatory, dictionaryLimits, lengthOf, looksCut, reconcile } from '../servicenow/stored-values.js';
import { ServiceNowError } from '../utils/errors.js';
import { requireScripting } from '../utils/permissions.js';
import { sysIdArg } from './atf-cicd.js';
const TEST = 'sys_atf_test';
const STEP = 'sys_atf_step';
const CONFIG = 'sys_atf_step_config';
const INPUT_VARIABLE = 'atf_input_variable';
const VALUE = 'sys_variable_value';
/**
 * The baseline step that stores server JavaScript the instance runs (test-steps-server-category.md).
 * A step of this config also needs SCRIPTING (the architect's ruling). The limit, said once: other
 * script-bearing configs are not recognised — the config's name is the only tell the corpus gives.
 */
const SERVER_SCRIPT_CONFIG = 'Run Server Side Script';
const SYS_ID = /^[0-9a-f]{32}$/i;
/** A value with its transport shape taken off: a reference's `value`, every scalar as its string. Also ai-agents.ts's (ARC-09-C165). */
export function plain(v) {
    if (v === null || v === undefined)
        return undefined;
    if (typeof v === 'object')
        return plain(v.value);
    return String(v);
}
/** Line endings as LF: the one normalisation a compared value gets. */
const lf = (s) => s.replace(/\r\n/g, '\n');
/** Where two strings first differ, in code points, as VALUE_TRUNCATED counts its lengths. */
function firstDifference(a, b) {
    const x = Array.from(a);
    const y = Array.from(b);
    const n = Math.min(x.length, y.length);
    for (let i = 0; i < n; i += 1)
        if (x[i] !== y[i])
            return i;
    return n;
}
function notStored(w, field, why) {
    return {
        code: 'FIELD_NOT_STORED', table: w.table, sys_id: w.sysId, field,
        message: `${w.table}.${field} ${why} The record exists without it. Read it back; if it is not set, set it with `
            + 'snow_core_record_modify rather than adding the record again. If it is set, the read-back missed it: the column '
            + 'names are not documented in the bundled corpus, so check them on the instance.',
    };
}
function notAsSent(w, field, sent, stored) {
    const at = firstDifference(sent, stored);
    const sentLength = lengthOf(sent);
    const storedLength = lengthOf(stored);
    return {
        code: 'VALUE_NOT_AS_SENT', table: w.table, sys_id: w.sysId, field,
        first_difference_at: at, sent_length: sentLength, stored_length: storedLength,
        message: `${w.table}.${field} reads back different from what was sent, with line endings normalised: the two first `
            + `differ at character ${at}; ${sentLength} characters were sent and ${storedLength} are stored. The record exists `
            + 'with the stored value: read it back and, if that value is wrong, correct it with snow_core_record_modify — do not '
            + 'add it again, which would make a second record.',
    };
}
/** A cut the write's answer did not show: the C93 warning, with the dictionary's limit when it is readable. */
async function truncated(client, w, field, sent, stored) {
    let limit = null;
    try {
        limit = (await dictionaryLimits(client, w.table, [field])).get(field) ?? null;
    }
    catch {
        // A dictionary this account cannot read leaves the limit unknown; the warning says so.
    }
    const cut = { field, sent, stored };
    const warning = reconcile({ operation: w.operation, table: w.table, sysId: w.sysId, live: w.live, cuts: [cut] }, cut, limit);
    // The dictionary says the column holds what was sent: the value was not cut by length, it differs.
    return warning ?? notAsSent(w, field, lf(sent), lf(stored));
}
/** Read `w` back by sys_id and compare every field it sent. A difference is a warning, never an error. */
async function readBack(client, w) {
    const stored = (await client.getRecord(w.table, w.sysId)) ?? {};
    const warnings = [];
    for (const [field, value] of Object.entries(w.sent)) {
        const sent = plain(value);
        if (sent === undefined || sent === '')
            continue;
        const got = plain(stored[field]);
        if (got === undefined || got === '') {
            warnings.push(notStored(w, field, 'was sent but does not read back as set.'));
        }
        else if (lf(got) === lf(sent)) {
            continue;
        }
        else if (looksCut(sent, got)) {
            if (!looksCut(sent, plain(w.answer[field])))
                warnings.push(await truncated(client, w, field, sent, got));
        }
        else {
            warnings.push(notAsSent(w, field, lf(sent), lf(got)));
        }
    }
    return { stored, warnings };
}
/** Write one record and read it back. Also ai-agents.ts's, for the sn_aia_* records (ARC-09-C165). */
export async function write(client, table, sent, live, sysId, progress) {
    const operation = sysId === undefined ? 'create' : 'update';
    if (progress)
        progress.step = sysId === undefined ? `creating ${table}` : `updating ${table} ${sysId}`;
    const answer = (sysId === undefined
        ? await client.createRecord(table, sent)
        : await client.updateRecord(table, sysId, sent)) ?? {};
    const id = sysId ?? plain(answer.sys_id);
    if (!id)
        throw new ServiceNowError(`The instance answered the create on ${table} with no sys_id, so it cannot be read back.`, 'CREATE_FAILED');
    if (progress) {
        if (sysId === undefined)
            progress.created.push({ table, sysId: id });
        progress.step = `reading back ${table} ${id} after ${operation === 'create' ? 'creating' : 'updating'} it`;
    }
    const { stored, warnings } = await readBack(client, { table, sysId: id, sent, answer, operation, live });
    return { sysId: id, stored, warnings };
}
const isBoolean = (v) => typeof v === 'boolean';
function activeArg(v) {
    if (v === undefined)
        return true;
    if (!isBoolean(v))
        throw new ServiceNowError(`active must be true or false; got ${JSON.stringify(v)}`, 'VALIDATION_ERROR');
    return v;
}
// ─── snow_atf_atf_test_add ───────────────────────────────────────────────────────────────────────
export async function addTest(client, args) {
    if (typeof args.name !== 'string' || args.name.trim() === '')
        throw new ServiceNowError('name is required', 'INVALID_REQUEST');
    if (args.description !== undefined && typeof args.description !== 'string') {
        throw new ServiceNowError('description must be a string', 'VALIDATION_ERROR');
    }
    const active = activeArg(args.active);
    const sent = { name: args.name, ...(args.description ? { description: args.description } : {}), active };
    const { sysId, stored, warnings } = await write(client, TEST, sent, active);
    const name = plain(stored.name) || args.name;
    return {
        ...(warnings.length > 0 ? { warnings } : {}),
        sys_id: sysId, name, active: plain(stored.active),
        summary: warnings.length === 0
            ? `Created ATF test "${name}" (${sysId}); it reads back as sent.`
            : `Created ATF test "${name}" (${sysId}); ${warnings.length} field(s) read back differently — see warnings.`,
    };
}
// ─── snow_atf_atf_step_add ───────────────────────────────────────────────────────────────────────
/** The step config the caller named: a sys_id that must exist, or a name exactly one config has. Active either way. */
async function resolveConfig(client, ref) {
    let row;
    if (SYS_ID.test(ref)) {
        // A sys_id no config has is a 404, which the client throws as NOT_FOUND: that is the refusal.
        row = (await client.getRecord(CONFIG, ref, 'sys_id,name,active,sys_scope')) ?? {};
    }
    else {
        if (ref.includes('^'))
            throw new ServiceNowError(`step_config "${ref}" cannot be queried exactly: pass its sys_id`, 'VALIDATION_ERROR');
        const resp = await client.queryRecords({ table: CONFIG, query: `name=${ref}`, fields: 'sys_id,name,active,sys_scope', limit: 10 });
        // Exact names only: a condition the instance cannot apply is ignored and returns every config (c_TableAPI.md).
        const rows = resp.records.filter((r) => r.name === ref);
        if (rows.length === 0)
            throw new ServiceNowError(`No step config is named "${ref}"`, 'NOT_FOUND');
        if (rows.length > 1) {
            const listed = rows.map((r) => `${plain(r.sys_id)} (scope ${plain(r.sys_scope) ?? 'not shown'})`).join(', ');
            throw new ServiceNowError(`${rows.length} step configs are named "${ref}": ${listed}. A scoped application can ship `
                + 'a config with the same name as a baseline one: pass the sys_id of the one you mean. Nothing was written.', 'INVALID_REQUEST');
        }
        row = rows[0];
    }
    const sysId = plain(row.sys_id);
    const name = plain(row.name) ?? '';
    if (plain(row.active) !== 'true') {
        throw new ServiceNowError(`Step config "${name}" (${sysId}) is not active (atf-step-config-record.md: Active). `
            + 'Nothing was written.', 'INVALID_REQUEST');
    }
    return { sysId, name };
}
/**
 * The config's input variables, by name: the rows whose config IS this one (an ignored condition returns others).
 *
 * ARC-09-C122 — with each one's `max_length` and `mandatory`. On rc.3, Run Server Side Script's `script` had a
 * max_length of 2000 and `jasmine_version` was mandatory (PN-16), and the tool read neither: C97's pre-check reads the
 * `sys_variable_value.value` column's limit, not the variable's.
 */
async function inputVariables(client, config) {
    const resp = await client.queryRecords({
        table: INPUT_VARIABLE, query: `model=${config}`, fields: 'sys_id,element,model,max_length,mandatory', limit: 100,
    });
    const vars = new Map();
    for (const r of resp.records) {
        const name = plain(r.element);
        const id = plain(r.sys_id);
        if (plain(r.model) !== config || !name || !id)
            continue;
        const limit = Number(plain(r.max_length));
        vars.set(name, {
            sysId: id,
            maxLength: Number.isInteger(limit) && limit > 0 ? limit : null,
            mandatory: plain(r.mandatory) === 'true',
        });
    }
    return vars;
}
function inputsArg(v) {
    if (v === undefined)
        return new Map();
    if (v === null || typeof v !== 'object' || Array.isArray(v)) {
        throw new ServiceNowError('inputs must be an object of input name to value', 'VALIDATION_ERROR');
    }
    const out = new Map();
    for (const [k, x] of Object.entries(v)) {
        if (typeof x !== 'string' && typeof x !== 'number' && typeof x !== 'boolean') {
            throw new ServiceNowError(`inputs.${k} must be a string, a number or a boolean`, 'VALIDATION_ERROR');
        }
        out.set(k, String(x));
    }
    return out;
}
/** One input proven from the step's side: exactly one row, keyed to the step and to the input's variable. */
async function attached(client, step, name, variable) {
    const resp = await client.queryRecords({
        table: VALUE, query: `document_key=${step}^variable=${variable}`, fields: 'sys_id,document_key,variable', limit: 10,
    });
    const rows = resp.records.filter((r) => plain(r.document_key) === step && plain(r.variable) === variable);
    if (rows.length === 1)
        return [];
    const field = `inputs.${name}`;
    if (rows.length === 0) {
        return [notStored({ table: VALUE, sysId: step }, field, `is not attached to step ${step}: no ${VALUE} row with `
                + `document_key=${step} and variable=${variable} reads back.`)];
    }
    const ids = rows.map((r) => plain(r.sys_id)).join(', ');
    return [{
            code: 'VALUE_NOT_AS_SENT', table: VALUE, sys_id: step, field,
            message: `${rows.length} ${VALUE} rows hold the ${name} input of step ${step} (${ids}); one was expected, so which `
                + 'value the step runs with is not known. Remove the extra rows with snow_core_record_remove, keeping the one with '
                + 'the intended value — do not add the step again.',
        }];
}
function leftBehind(error, at, step, warnings) {
    if (!(error instanceof ServiceNowError))
        return error;
    const readBackNote = warnings.length === 0 ? ''
        : ` The step's read-back reported ${warnings.map((w) => `${w.code} on ${w.field}`).join(', ')}.`;
    return new ServiceNowError(`${error.message} — while ${at}; step ${step} was created, but its inputs were not all written: read `
        + `${VALUE} with document_key=${step} before trying again, and do not add the step a second time.${readBackNote}`, error.code, error.details);
}
export async function addStep(client, args) {
    if (!args.test)
        throw new ServiceNowError('test is required', 'INVALID_REQUEST');
    if (typeof args.step_config !== 'string' || args.step_config.trim() === '') {
        throw new ServiceNowError('step_config is required: a step config sys_id, or its exact name', 'INVALID_REQUEST');
    }
    const test = sysIdArg(args.test, 'test');
    const order = args.order;
    if (order !== undefined && !(typeof order === 'number' && Number.isInteger(order) && order >= 0)) {
        throw new ServiceNowError(`order must be a whole number; got ${JSON.stringify(order)}`, 'VALIDATION_ERROR');
    }
    const active = activeArg(args.active);
    const inputs = inputsArg(args.inputs);
    // Refusals before any write: each one a read. A test that does not exist answers 404, "Not found. The
    // requested item wasn't found." (vendor/ServiceNowDocs/markdown/api-reference/rest-apis/c_TableAPI.md),
    // which the client throws as NOT_FOUND: that is the refusal.
    await client.getRecord(TEST, test, 'sys_id');
    const config = await resolveConfig(client, args.step_config.trim());
    if (config.name === SERVER_SCRIPT_CONFIG)
        requireScripting();
    // Every step reads its config's variables now, not only one sent inputs: the listing after the write names the rows the
    // instance created, and the mandatory check needs every variable (ARC-09-C122).
    const variables = await inputVariables(client, config.sysId);
    const unknown = [...inputs.keys()].filter((k) => !variables.has(k));
    if (unknown.length > 0) {
        throw new ServiceNowError(`Step config "${config.name}" has no input named ${unknown.map((k) => `"${k}"`).join(', ')}; `
            + `its inputs are: ${[...variables.keys()].join(', ') || 'none this account can read'}. Nothing was written.`, 'INVALID_REQUEST');
    }
    // ARC-09-C122 — a value longer than its input variable's max_length, refused before any write, every one at once.
    const tooLong = [...inputs].flatMap(([name, value]) => {
        const limit = variables.get(name)?.maxLength ?? null;
        const length = lengthOf(value);
        return limit !== null && length > limit
            ? [`inputs.${name} is ${length} characters; its input variable's max_length is ${limit}`] : [];
    });
    if (tooLong.length > 0)
        throw new ServiceNowError(`${tooLong.join('; ')}. Nothing was written.`, 'VALUE_TOO_LONG');
    if (order !== undefined) {
        const steps = await client.queryRecords({ table: STEP, query: `test=${test}`, fields: 'sys_id,test,order', limit: 1000 });
        const clash = steps.records.find((r) => plain(r.test) === test && plain(r.order) === String(order));
        if (clash) {
            throw new ServiceNowError(`Test ${test} already has a step at order ${order} (${plain(clash.sys_id)}). Choose another `
                + 'order, or leave it out and the instance assigns the next-highest (atf-edit-step-order.md). Nothing was written.', 'INVALID_REQUEST');
        }
    }
    // The step.
    const sent = { test, step_config: config.sysId, active, ...(order !== undefined ? { order } : {}) };
    // ARC-09-C183: the step and the input rows it may create, with what will be sent, before the first write.
    await assertMandatory(client, [{ table: STEP, payload: sent },
        ...[...inputs].map(([name, value]) => ({ table: VALUE,
            payload: { document: STEP, document_key: '(the step)', variable: variables.get(name).sysId, value } }))]);
    const step = await write(client, STEP, sent, active);
    const warnings = [...step.warnings];
    // Its inputs: look before writing, so a row the insert created is updated and not added a second time.
    // ARC-09-C122 — the rows this call wrote, by sys_id, for the listing after the write.
    const wrote = new Map();
    let listed = [];
    // ARC-09-C174 — the step this call is at, for a refusal to name. The input rows it creates are not listed: the
    // rethrow says to read them all by the step.
    const progress = { step: '', created: [] };
    try {
        progress.step = `reading ${VALUE}`;
        const existing = await client.queryRecords({
            table: VALUE, query: `document_key=${step.sysId}`, fields: 'sys_id,document_key,variable,value', limit: 100,
        });
        const byVariable = new Map();
        for (const r of existing.records) {
            if (plain(r.document_key) !== step.sysId)
                continue;
            const v = plain(r.variable) ?? '';
            byVariable.set(v, [...(byVariable.get(v) ?? []), r]);
        }
        for (const [name, value] of inputs) {
            const variable = variables.get(name).sysId;
            const rows = byVariable.get(variable) ?? [];
            if (rows.length > 1) {
                // Neither row is overwritten: `attached` below names them both in its warning.
            }
            else if (rows.length === 1) {
                const row = plain(rows[0].sys_id);
                const done = await write(client, VALUE, { value }, false, row, progress);
                warnings.push(...done.warnings);
                wrote.set(row, 'updated');
            }
            else {
                const done = await write(client, VALUE, { document: STEP, document_key: step.sysId, variable, value }, false, undefined, progress);
                warnings.push(...done.warnings);
                wrote.set(done.sysId, 'created');
            }
            progress.step = `reading ${VALUE}`;
            warnings.push(...await attached(client, step.sysId, name, variable));
        }
        // ARC-09-C122 — every input row of the step, after the write: the caller sees the rows the insert created from the
        // config's defaults too (PN-16), not only the ones it sent. One read, by the step.
        const nameOf = new Map([...variables].map(([name, v]) => [v.sysId, name]));
        progress.step = `reading ${VALUE}`;
        const after = await client.queryRecords({
            table: VALUE, query: `document_key=${step.sysId}`, fields: 'sys_id,document_key,variable,value', limit: 100,
        });
        const rows = after.records.filter((r) => plain(r.document_key) === step.sysId);
        listed = rows.map((r) => {
            const sysId = plain(r.sys_id);
            return { name: nameOf.get(plain(r.variable) ?? '') ?? null, sys_id: sysId, written: wrote.get(sysId) ?? 'defaulted by the instance' };
        });
        // A mandatory input with no value after the write is reported, never refused before it: the instance may default
        // it, as it did jasmine_version on rc.3.
        for (const [name, v] of variables) {
            if (!v.mandatory)
                continue;
            const held = rows.some((r) => plain(r.variable) === v.sysId && (plain(r.value) ?? '') !== '');
            if (!held) {
                warnings.push(notStored({ table: VALUE, sysId: step.sysId }, `inputs.${name}`, `is mandatory, and no ${VALUE} row `
                    + `of step ${step.sysId} holds a value for it after the write.`));
            }
        }
    }
    catch (error) {
        throw leftBehind(error, progress.step, step.sysId, warnings);
    }
    return {
        ...(warnings.length > 0 ? { warnings } : {}),
        sys_id: step.sysId,
        test,
        step_config: { sys_id: config.sysId, name: config.name },
        order: plain(step.stored.order),
        active: plain(step.stored.active),
        // Every input row of the step (ARC-09-C122). An input with more than one row is named in its warning, and listed
        // row by row here.
        inputs: listed,
        summary: warnings.length === 0
            ? `Added a "${config.name}" step (${step.sysId}) to test ${test} at order ${plain(step.stored.order) ?? '(not shown)'}; `
                + `the step${inputs.size > 0 ? ' and its inputs read back as sent, each input attached once' : ' reads back as sent'}.`
            : `Added a "${config.name}" step (${step.sysId}) to test ${test}; ${warnings.length} read-back warning(s) — see warnings.`,
    };
}
