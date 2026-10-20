// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
import { ERROR_CODE_NAMES } from '../errors/codes.js';
/**
 * What a warning may leave behind in the audit trail (ARC-09-C101, b).
 *
 * A write whose result carries `warnings[]` succeeded, and the trail used to record it as a plain
 * `ok`. The line now carries the warning CODES, the table, the field names and a count — and
 * nothing a caller typed. Everything else a warning holds is dropped on purpose: the message and the
 * lengths are for the person reading the result, the sys_id is already in the line's own `sysId`,
 * and an audit file that grew a free-text slot would be a payload channel (the writer's header, and
 * the no-secrets sweep that found `args.name` in a `note`).
 *
 * Every string that survives is checked against a shape. A `code` must be one the registry knows —
 * a code is server-built, so a value the registry has never heard of is not one of ours. A table or
 * field name must look like an identifier; one that does not is not recorded (the table as `null`,
 * the field not at all) while the warning is still counted. A field in a warning is a column the
 * platform echoed back, which already limits it to real column names; the pattern is the second
 * line, not the first.
 */
const IDENT = /^[a-z][a-z0-9_]{0,79}$/i;
/** Bounds, so a bulk path cannot grow the line without limit. The count still says how many. */
const MAX_GROUPS = 10;
const MAX_FIELDS = 10;
const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
/** Group by code and table, in first-seen order. */
export function summariseWarnings(warnings) {
    if (!Array.isArray(warnings))
        return [];
    const groups = new Map();
    for (const w of warnings) {
        if (!isObject(w) || typeof w.code !== 'string' || !ERROR_CODE_NAMES.has(w.code))
            continue;
        const table = typeof w.table === 'string' && IDENT.test(w.table) ? w.table : null;
        const key = `${w.code}\u0000${table ?? ''}`;
        let group = groups.get(key);
        if (!group) {
            if (groups.size >= MAX_GROUPS)
                continue;
            group = { code: w.code, table, fields: [], count: 0 };
            groups.set(key, group);
        }
        // A roll-up (`capWarnings`) stands for `count` writes; anything else, or a count that is not a
        // count, is one.
        group.count += typeof w.count === 'number' && Number.isInteger(w.count) && w.count > 0 ? w.count : 1;
        if (typeof w.field === 'string' && IDENT.test(w.field)
            && !group.fields.includes(w.field) && group.fields.length < MAX_FIELDS) {
            group.fields.push(w.field);
        }
    }
    return [...groups.values()];
}
/**
 * The warnings on a tool's result: its own top-level `warnings` key and nothing nested.
 * `attachWarnings` puts them there, either on the record or on the `{ warnings, result }` wrapper,
 * and a record's own column called `warnings` sits one level down, under `result`, where this does
 * not look.
 */
export function warningsOfResult(result) {
    return isObject(result) && Array.isArray(result.warnings) ? result.warnings : [];
}
