import { currentInstanceOrNull } from '../servicenow/context.js';
import { parseLimit } from '../servicenow/stored-values.js';
import { ServiceNowError } from '../utils/errors.js';
import { schemaCache } from './schema-cache.js';
export function discoveryToolManifest() {
    return [
        {
            name: 'snow_disco_table_discover',
            description: 'Read a ServiceNow table schema and return its columns (element, type, label, '
                + 'max_length, mandatory, reference, read_only, default_value), including the columns '
                + 'the table inherits from the tables it extends. max_length is null when the dictionary '
                + 'states none: unknown, not a default. A result that is not the whole schema (the '
                + 'hierarchy was unreadable, or the table is very wide) carries a note saying so and is '
                + 'not cached. Use the result to build calls to snow_core_records_query / '
                + 'snow_core_record_read / snow_core_record_add. Schemas are cached for 30 minutes, per '
                + 'instance.',
            inputSchema: {
                type: 'object',
                properties: {
                    table: { type: 'string', description: 'Table name to discover (e.g., "u_custom_table")' },
                },
                required: ['table'],
            },
            gate: 'none',
            mutates: false,
        },
    ];
}
const minutesLeft = (cachedAt, ttlMs) => Math.round((ttlMs - (Date.now() - cachedAt)) / 60000);
/** A table or column name that is safe to put in an encoded query. */
const IDENT = /^[a-z][a-z0-9_]*$/i;
const SYS_ID = /^[0-9a-f]{32}$/i;
/** One dictionary request. The platform's own page size would be a guess; this is what we ask for. */
const PAGE = 200;
/** 25 pages = 5000 dictionary rows. Past it the result says it was cut, so a wide table is never silent. */
const MAX_PAGES = 25;
/** A hierarchy deeper than this is a loop or a corrupt dictionary, not a model. */
const MAX_DEPTH = 20;
/**
 * The cache is per instance. Outside a request (a direct call in a test) there is no ambient
 * instance and the key is empty, which is a key of its own.
 */
const instanceKey = () => currentInstanceOrNull()?.label ?? '';
/** A reference as the Table API returns it ({ link, value }) or as a bare value. */
function refValue(v) {
    if (typeof v === 'string')
        return v;
    if (v && typeof v === 'object' && typeof v.value === 'string') {
        return v.value;
    }
    return '';
}
/**
 * The table and the tables it extends. A child table does not repeat its parent's columns in the
 * dictionary: `incident` has no `short_description` row, `task` has (t_TableHierarchyAndTheExtModel.md).
 *
 * An account that cannot read `sys_db_object` gets the table alone, with the reason, rather than an
 * error: the own columns are still an answer, and the caller is told what is missing. Every OTHER
 * failure propagates - in particular a failed login must not be absorbed and followed by another
 * request (`.claude/rules/00-mode-and-mcp-gate.md`).
 */
async function tableChain(client, table) {
    const tables = [table];
    let query = `name=${table}`;
    for (let depth = 0; depth <= MAX_DEPTH; depth++) {
        let row;
        try {
            const res = await client.queryRecords({ table: 'sys_db_object', query, fields: 'name,super_class', limit: 1 });
            row = res.records?.[0];
        }
        catch (e) {
            if (e instanceof ServiceNowError && e.code === 'INSUFFICIENT_PRIVILEGES') {
                return { tables, problem: `the table hierarchy could not be read (${e.code}: sys_db_object)` };
            }
            throw e;
        }
        if (depth > 0) {
            const name = typeof row?.name === 'string' ? row.name : '';
            if (!IDENT.test(name))
                return { tables, problem: 'a parent table has no readable name' };
            if (tables.includes(name))
                return { tables, problem: `the hierarchy of "${table}" loops back to "${name}"` };
            tables.push(name);
        }
        const parent = refValue(row?.super_class);
        if (!parent)
            return { tables };
        if (!SYS_ID.test(parent))
            return { tables, problem: 'a parent table is not identified by a sys_id' };
        query = `sys_id=${parent}`;
    }
    return { tables, problem: `the hierarchy is deeper than ${MAX_DEPTH} levels` };
}
/** Every dictionary row of the chain, page by page, in a stable order so an offset cannot skip or repeat. */
async function dictionaryRows(client, tables) {
    const where = tables.length === 1 ? `name=${tables[0]}` : `nameIN${tables.join(',')}`;
    const rows = [];
    for (let page = 0; page < MAX_PAGES; page++) {
        const res = await client.queryRecords({
            table: 'sys_dictionary',
            query: `${where}^elementISNOTEMPTY^internal_type!=collection`,
            fields: 'name,element,internal_type,column_label,max_length,mandatory,reference,read_only,default_value',
            limit: PAGE,
            offset: page * PAGE,
            orderBy: 'element,name',
        });
        rows.push(...res.records);
        if (res.records.length < PAGE)
            return { rows, capped: false };
    }
    return { rows, capped: true };
}
export async function dispatchDiscoveryAction(client, name, args) {
    if (name !== 'snow_disco_table_discover')
        return null;
    const table = args.table;
    if (!table || typeof table !== 'string') {
        throw new ServiceNowError('table is required', 'INVALID_REQUEST');
    }
    // The name goes into encoded queries, here and for every parent: anything that is not an
    // identifier would be read as part of the query.
    if (!IDENT.test(table)) {
        throw new ServiceNowError(`table must be a table name (letters, digits and underscores, starting with a letter); got "${table.slice(0, 40)}"`, 'INVALID_REQUEST');
    }
    const instance = instanceKey();
    const cached = schemaCache.get(instance, table);
    if (cached) {
        return {
            table,
            source: 'cache',
            // The columns themselves. This used to be `columns: cached.columns.length` beside an
            // `available_tools` list — a caller was told how MANY columns there were and given tool
            // names instead of the schema, so the one thing the tool is for had to be inferred.
            columns: cached.columns,
            cache_expires_in_minutes: minutesLeft(cached.cachedAt, cached.ttlMs),
        };
    }
    const chain = await tableChain(client, table);
    const { rows, capped } = await dictionaryRows(client, chain.tables);
    // What makes this result less than the whole schema. Such a result is returned with the reason and
    // NOT cached: half an hour of a partial answer standing in for the real one is worse than a
    // second request.
    const gaps = [];
    if (chain.problem)
        gaps.push(`Inherited columns are not included: ${chain.problem}.`);
    if (capped)
        gaps.push(`Stopped after ${MAX_PAGES * PAGE} dictionary rows; the table may have more columns.`);
    if (rows.length === 0) {
        // sys_dictionary can be empty for a table the account can read rows of but not the
        // dictionary of. Probing one row gives the column NAMES, which is less than the dictionary
        // gives but more than nothing — and the `note` says which of the two happened, because a
        // probe-derived `internal_type: 'string'` is a placeholder, not a finding.
        try {
            const probe = await client.queryRecords({ table, limit: 1 });
            if (probe.count === 0 && probe.records.length === 0) {
                throw new ServiceNowError(`Table "${table}" not found or has no schema`, 'NOT_FOUND');
            }
            const record = probe.records[0] || {};
            const probed = Object.keys(record).map((key) => ({
                element: key,
                internal_type: 'string',
                label: key,
                max_length: null,
                mandatory: false,
                read_only: key.startsWith('sys_'),
                default_value: undefined,
            }));
            schemaCache.set(instance, table, probed);
            return {
                table,
                source: 'instance',
                columns: probed,
                cache_expires_in_minutes: minutesLeft(Date.now(), schemaCache.get(instance, table).ttlMs),
                note: 'Schema derived from record structure (sys_dictionary returned nothing for this '
                    + 'table); internal_type values are placeholders, not dictionary values, and max_length is '
                    + 'null (unknown).',
            };
        }
        catch (e) {
            if (e instanceof ServiceNowError)
                throw e;
            throw new ServiceNowError(`Table "${table}" not found`, 'NOT_FOUND');
        }
    }
    // Nearest definition wins: a table that redefines a parent's column is the one the platform
    // reads. The sort is stable, so within one table the dictionary's own order is kept.
    const rank = new Map(chain.tables.map((t, i) => [t, i]));
    const ordered = [...rows].sort((a, b) => (rank.get(String(a.name)) ?? chain.tables.length) - (rank.get(String(b.name)) ?? chain.tables.length));
    const seen = new Set();
    const columns = [];
    for (const r of ordered) {
        if (typeof r.element !== 'string' || seen.has(r.element))
            continue;
        seen.add(r.element);
        columns.push({
            element: r.element,
            internal_type: r.internal_type || 'string',
            label: r.column_label || r.element,
            max_length: parseLimit(r.max_length),
            mandatory: r.mandatory === 'true' || r.mandatory === true,
            reference: r.reference || undefined,
            read_only: r.read_only === 'true' || r.read_only === true,
            default_value: r.default_value || undefined,
        });
    }
    if (gaps.length > 0) {
        return { table, source: 'instance', columns, note: `${gaps.join(' ')} Not cached: the next call reads again.` };
    }
    schemaCache.set(instance, table, columns);
    return {
        table,
        source: 'instance',
        columns,
        cache_expires_in_minutes: minutesLeft(Date.now(), schemaCache.get(instance, table).ttlMs),
    };
}
// dispatchDynamicAction and buildToolNames were removed by ARC-04-S08 along with the
// runtime-generated `dynamic_<op>_<table>` tools — see the file header.
