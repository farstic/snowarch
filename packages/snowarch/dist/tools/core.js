import { DEFAULT_MAX_RECORDS, MAX_PAGE } from '../servicenow/client.js';
import { ServiceNowError } from '../utils/errors.js';
import { requireWrite } from '../utils/permissions.js';
import { instanceManager } from '../servicenow/instances.js';
import { currentCapabilities, reloadInstances, serverStatus } from './status.js';
/**
 * ARC-09-C205 — `display_value` on the two read tools, and the one presentation instruction the model gets.
 *
 * The owner's live read returned codes a person cannot read (state 6, priority 3, a group's sys_id), and a second
 * call for the labels. Under `sysparm_display_value=all` every field is { display_value, value }, and a reference adds
 * `link` (the owner's probe, 2026-10-22). The stored value stays the only truth for any logic; the label is for a
 * person reading. Not in the contract, which carries names, gates and `mutates` only, so no generated line moves.
 */
const DISPLAY_VALUE = {
    type: 'string',
    enum: ['false', 'all'],
    description: 'For a list a person will read, pass display_value: \'all\' with `fields`: each field then carries its '
        + 'stored value and its label. Show a field as \'Label (value)\' when the two differ (choices, references, dates), '
        + 'and once when they are equal. A date\'s label is in the user\'s format and time zone; its stored value is UTC. '
        + 'Use only the stored value in any query, filter, encoded query or write, never the label. Default \'false\' '
        + 'returns stored values only, as before; \'true\' is refused.',
};
/** Why 'true' is refused: the reason, said where the refusal is. */
const DISPLAY_VALUE_TRUE_REFUSED = 'display_value \'true\' is refused: it returns labels only, without the stored values, '
    + 'and dates in the user\'s time zone that would shift if written back. Pass \'all\' for both.';
/**
 * The request a `display_value` argument asks for, decided before anything is sent: absent, 'false' or false is
 * today's request; 'all' adds `sysparm_display_value=all`; 'true', or true, is refused with its reason; anything
 * else is refused.
 */
function displayValueOf(value) {
    if (value === undefined || value === 'false' || value === false)
        return undefined;
    if (value === 'all')
        return 'all';
    if (value === 'true' || value === true)
        throw new ServiceNowError(DISPLAY_VALUE_TRUE_REFUSED, 'INVALID_REQUEST');
    throw new ServiceNowError('display_value is \'false\' or \'all\'', 'INVALID_REQUEST');
}
export function coreToolManifest() {
    return [
        {
            name: 'snow_core_records_query',
            description: 'Query ServiceNow records with filtering, field selection, pagination, and sorting. The answer '
                + 'says whether the read was cut: count is this page\'s length, total the records the query matches '
                + '(X-Total-Count, null when the instance does not send it), and truncated is true when more remain past '
                + 'this page. With no total, truncated means the page reached the limit, not that the list is proven cut.',
            inputSchema: {
                type: 'object',
                properties: {
                    table: { type: 'string', description: 'Table name (e.g., "incident", "change_request")' },
                    query: { type: 'string', description: 'Encoded query string (e.g., "active=true^priority=1")' },
                    fields: { type: 'string', description: 'Comma-separated fields to return' },
                    limit: { type: 'number', description: `Max records (default: the instance's maxRecords, ${DEFAULT_MAX_RECORDS} unless the store sets one; max ${MAX_PAGE})` },
                    offset: { type: 'number', description: 'Records to skip before the first one returned (default 0). To read the next page of a truncated answer, repeat the call with offset set to this answer\'s offset + count, until truncated is false.' },
                    orderBy: { type: 'string', description: 'Field to sort by. Prefix with "-" for descending' },
                    display_value: DISPLAY_VALUE,
                },
                required: ['table'],
            },
            gate: 'none',
            mutates: false,
        },
        {
            name: 'snow_core_table_schema_read',
            description: 'Get the structure and field information for a ServiceNow table',
            inputSchema: {
                type: 'object',
                properties: {
                    table: { type: 'string', description: 'Table name to inspect' },
                },
                required: ['table'],
            },
            gate: 'none',
            mutates: false,
        },
        {
            name: 'snow_core_record_read',
            description: 'Retrieve complete details of a specific record by sys_id',
            inputSchema: {
                type: 'object',
                properties: {
                    table: { type: 'string', description: 'Table name' },
                    sys_id: { type: 'string', description: '32-character system ID' },
                    fields: { type: 'string', description: 'Optional comma-separated fields' },
                    display_value: DISPLAY_VALUE,
                },
                required: ['table', 'sys_id'],
            },
            gate: 'none',
            mutates: false,
        },
        {
            name: 'snow_core_record_add',
            description: 'Create a new record in any ServiceNow table (requires WRITE_ENABLED=true)',
            inputSchema: {
                type: 'object',
                properties: {
                    table: { type: 'string', description: 'Table name (e.g., "incident", "sys_user_preference")' },
                    fields: { type: 'object', description: 'Key-value pairs for the new record fields' },
                },
                required: ['table', 'fields'],
            },
            gate: 'write',
            mutates: true,
        },
        {
            name: 'snow_core_record_modify',
            description: 'Update an existing record in any ServiceNow table (requires WRITE_ENABLED=true)',
            inputSchema: {
                type: 'object',
                properties: {
                    table: { type: 'string', description: 'Table name (e.g., "incident", "sys_user_preference")' },
                    sys_id: { type: 'string', description: '32-character system ID of the record to update' },
                    fields: { type: 'object', description: 'Key-value pairs of fields to update' },
                },
                required: ['table', 'sys_id', 'fields'],
            },
            gate: 'write',
            mutates: true,
        },
        {
            name: 'snow_core_record_remove',
            description: 'Delete a record from any ServiceNow table (requires WRITE_ENABLED=true)',
            inputSchema: {
                type: 'object',
                properties: {
                    table: { type: 'string', description: 'Table name' },
                    sys_id: { type: 'string', description: '32-character system ID of the record to delete' },
                },
                required: ['table', 'sys_id'],
            },
            gate: 'write',
            mutates: true,
        },
        {
            name: 'snow_core_user_read',
            description: 'Look up user details by email or username',
            inputSchema: {
                type: 'object',
                properties: {
                    user_identifier: { type: 'string', description: 'Email address or username' },
                },
                required: ['user_identifier'],
            },
            gate: 'none',
            mutates: false,
        },
        {
            name: 'snow_core_group_read',
            description: 'Find assignment group details by name or sys_id',
            inputSchema: {
                type: 'object',
                properties: {
                    group_identifier: { type: 'string', description: 'Group name or sys_id' },
                },
                required: ['group_identifier'],
            },
            gate: 'none',
            mutates: false,
        },
        {
            name: 'snow_core_cmdb_ci_query',
            description: 'Search for configuration items (CIs) in the CMDB',
            inputSchema: {
                type: 'object',
                properties: {
                    query: { type: 'string', description: 'Encoded query (e.g., "sys_class_name=cmdb_ci_server")' },
                    limit: { type: 'number', description: 'Max CIs (default: 10, max: 100)' },
                },
                required: [],
            },
            gate: 'none',
            mutates: false,
        },
        {
            name: 'snow_core_cmdb_ci_read',
            description: 'Get complete information about a specific configuration item',
            inputSchema: {
                type: 'object',
                properties: {
                    ci_sys_id: { type: 'string', description: 'System ID of the CI' },
                    fields: { type: 'string', description: 'Optional comma-separated fields' },
                },
                required: ['ci_sys_id'],
            },
            gate: 'none',
            mutates: false,
        },
        {
            name: 'snow_core_relationships_index',
            description: 'Show parent and child relationships for a CI',
            inputSchema: {
                type: 'object',
                properties: {
                    ci_sys_id: { type: 'string', description: 'System ID of the CI' },
                },
                required: ['ci_sys_id'],
            },
            gate: 'none',
            mutates: false,
        },
        {
            name: 'snow_core_discovery_schedules_index',
            description: 'List discovery schedules and their run status',
            inputSchema: {
                type: 'object',
                properties: {
                    active_only: { type: 'boolean', description: 'Only show active schedules' },
                },
                required: [],
            },
            gate: 'none',
            mutates: false,
        },
        {
            name: 'snow_core_mid_servers_index',
            description: 'List MID servers and verify they are healthy',
            inputSchema: {
                type: 'object',
                properties: {
                    active_only: { type: 'boolean', description: 'Only show servers with status "Up"' },
                },
                required: [],
            },
            gate: 'none',
            mutates: false,
        },
        {
            name: 'snow_core_active_events_index',
            description: 'Monitor critical infrastructure events',
            inputSchema: {
                type: 'object',
                properties: {
                    query: { type: 'string', description: 'Filter events (e.g., "severity=1")' },
                    limit: { type: 'number', description: 'Max events (default: 10)' },
                },
                required: [],
            },
            gate: 'none',
            mutates: false,
        },
        {
            name: 'snow_core_health_dashboard_read',
            description: 'Get CMDB data quality metrics (completeness of server and network CI data)',
            inputSchema: { type: 'object', properties: {}, required: [] },
            gate: 'none',
            mutates: false,
        },
        {
            name: 'snow_core_service_mapping_summary_read',
            description: 'View service dependencies and related CIs for impact analysis',
            inputSchema: {
                type: 'object',
                properties: {
                    service_sys_id: { type: 'string', description: 'System ID of the business service' },
                },
                required: ['service_sys_id'],
            },
            gate: 'none',
            mutates: false,
        },
        {
            name: 'snow_core_natural_language_query',
            description: 'Search ServiceNow using plain English (experimental)',
            inputSchema: {
                type: 'object',
                properties: {
                    query: { type: 'string', description: 'Plain English query' },
                    limit: { type: 'number', description: 'Max results (default: 10)' },
                },
                required: ['query'],
            },
            gate: 'none',
            mutates: false,
        },
        {
            name: 'snow_core_natural_language_modify',
            description: 'Update a record using natural language (experimental, requires WRITE_ENABLED=true)',
            inputSchema: {
                type: 'object',
                properties: {
                    instruction: { type: 'string', description: 'Natural language update instruction' },
                    table: { type: 'string', description: 'Table name' },
                },
                required: ['instruction', 'table'],
            },
            gate: 'write',
            mutates: true,
        },
        {
            // The three tools below need NO instance: they describe the server's own state, and
            // they are what a session has to fall back on when nothing is configured. Gate `none`
            // and mutates false — ARC-04-S06 formalises those fields on every tool.
            name: 'snow_core_status_read',
            description: "Report the server's own state: mode, which store was used, which instances loaded or were refused, and how many tools are advertised. Needs no instance.",
            inputSchema: { type: 'object', properties: {}, required: [] },
            gate: 'none',
            mutates: false,
        },
        {
            name: 'snow_core_capabilities_read',
            description: "Report the current instance's preset, flags and effective flags. Never returns a username or a secret.",
            inputSchema: { type: 'object', properties: {}, required: [] },
            gate: 'none',
            mutates: false,
        },
        {
            name: 'snow_core_instances_reload',
            description: 'Re-read the instance store from disk and re-advertise the tool list. Use after adding an instance in another terminal, instead of restarting.',
            inputSchema: { type: 'object', properties: {}, required: [] },
            gate: 'none',
            mutates: false,
        },
        {
            name: 'snow_core_instances_index',
            description: 'List all configured ServiceNow instances (multi-instance / multi-customer support)',
            inputSchema: { type: 'object', properties: {}, required: [] },
            gate: 'none',
            mutates: false,
        },
        {
            name: 'snow_core_instance_switch',
            description: 'Switch the active ServiceNow instance for this session',
            inputSchema: {
                type: 'object',
                properties: {
                    name: { type: 'string', description: 'Instance name as configured (e.g. "prod", "dev", "customer_a")' },
                },
                required: ['name'],
            },
            gate: 'none',
            // `false`, and this is not an oversight — it is an unresolved gap, raised by ARC-04-S09.
            //
            // It changes no ServiceNow record, so `mutates: true` would break contract test (c)
            // ("a tool that mutates is never ungated") unless it were also given a write gate, and
            // gating it would stop a read-only session from switching instances to READ another one.
            // But `03` S-23 names it among the 14 that must appear in the §2.1 ask-list, and that
            // list is generated from this field — so as things stand, redirecting where every
            // subsequent write lands is the one action that does not prompt.
            //
            // Resolved in ARC-04-S10: `mutates` keeps meaning "changes ServiceNow records" and
            // `sessionMutates` carries the other meaning, so the ask-list generator unions the two
            // (ARC-05-S07) without changing what gate (c) enforces. This is the only tool that
            // declares it — `snow_core_instances_reload` is deliberately left out, because ARC-07's
            // `--resume` depends on it not prompting.
            mutates: false,
            sessionMutates: true,
        },
        {
            name: 'snow_core_current_instance_read',
            description: 'Get the currently active ServiceNow instance name and URL',
            inputSchema: { type: 'object', properties: {}, required: [] },
            gate: 'none',
            mutates: false,
        },
        {
            name: 'snow_core_ci_relationship_add',
            description: '[Write] Create a relationship between two CMDB Configuration Items',
            inputSchema: {
                type: 'object',
                properties: {
                    parent: { type: 'string', description: 'Parent CI sys_id' },
                    child: { type: 'string', description: 'Child CI sys_id' },
                    type: { type: 'string', description: 'Relationship type (e.g. "Runs on::Runs")' },
                },
                required: ['parent', 'child', 'type'],
            },
            gate: 'write',
            mutates: true,
        },
        {
            name: 'snow_core_analysis_impact',
            description: 'Analyze the downstream impact of a Configuration Item change or outage',
            inputSchema: {
                type: 'object',
                properties: {
                    ci_sys_id: { type: 'string', description: 'CI sys_id to analyze' },
                    depth: { type: 'number', description: 'Relationship depth to traverse (default: 2)' },
                },
                required: ['ci_sys_id'],
            },
            gate: 'none',
            mutates: false,
        },
        {
            name: 'snow_core_discovery_scan_exec',
            description: '[Write] Trigger a ServiceNow Discovery scan for network/infrastructure',
            inputSchema: {
                type: 'object',
                properties: {
                    schedule_id: { type: 'string', description: 'Discovery schedule sys_id to run' },
                    mid_server: { type: 'string', description: 'Optional MID server name' },
                },
                required: ['schedule_id'],
            },
            gate: 'write',
            mutates: true,
        },
    ];
}
/**
 * ARC-09-C178 — the fields a read asked for (`fields`, comma-separated) that no returned record carries. The instance
 * leaves out a field the account may not read, or a Protected script (PN-20); a missing field is not an empty one, so
 * the read names it. The records are passed on as returned.
 */
function notReturned(fields, records) {
    if (typeof fields !== 'string')
        return [];
    const asked = [...new Set(fields.split(',').map((f) => f.trim()).filter((f) => f !== ''))];
    return asked.filter((f) => !records.some((r) => Object.prototype.hasOwnProperty.call(r, f)));
}
export async function dispatchCoreAction(client, name, args) {
    switch (name) {
        case 'snow_core_records_query': {
            const params = args;
            if (!params.table)
                throw new ServiceNowError('Table name is required', 'INVALID_REQUEST');
            const displayValue = displayValueOf(args.display_value);
            const response = await client.queryRecords({ ...params, displayValue });
            // ARC-09-C125 — whether the read was cut, per page. With a total, more remain past this page; without one,
            // the page filled its limit, which is all a caller can know: "reached the limit", not "proven cut".
            const offset = response.offset ?? params.offset ?? 0;
            const limit = response.limit ?? params.limit ?? null;
            const total = response.total ?? null;
            const truncated = total !== null ? offset + response.count < total : limit !== null && response.count >= limit;
            const next = offset + response.count;
            const more = !truncated ? ''
                : total !== null ? `; ${total - next} more match: read on with offset ${next}`
                    : `; the page reached its limit of ${limit}: read on with offset ${next}`;
            // ARC-09-C178: a field no returned record carries is named; an empty page says nothing about the fields.
            const absent = response.records.length === 0 ? [] : notReturned(params.fields, response.records);
            return { count: response.count, records: response.records, limit, offset, total, truncated,
                ...(absent.length > 0 ? { fields_not_returned: absent } : {}),
                summary: `Found ${response.count} record(s) in "${params.table}"${more}` };
        }
        case 'snow_core_table_schema_read':
            if (!args.table)
                throw new ServiceNowError('Table name is required', 'INVALID_REQUEST');
            return await client.getTableSchema(args.table);
        case 'snow_core_record_read': {
            const p = args;
            if (!p.table || !p.sys_id)
                throw new ServiceNowError('table and sys_id are required', 'INVALID_REQUEST');
            const displayValue = displayValueOf(args.display_value);
            const record = await client.getRecord(p.table, p.sys_id, p.fields, displayValue);
            const absent = record && typeof record === 'object' ? notReturned(p.fields, [record]) : [];
            return absent.length > 0 ? { ...record, fields_not_returned: absent } : record;
        }
        case 'snow_core_record_add': {
            requireWrite();
            if (!args.table || !args.fields)
                throw new ServiceNowError('table and fields are required', 'INVALID_REQUEST');
            const created = await client.createRecord(args.table, args.fields);
            return { action: 'created', table: args.table, ...created };
        }
        case 'snow_core_record_modify': {
            requireWrite();
            if (!args.table || !args.sys_id || !args.fields)
                throw new ServiceNowError('table, sys_id, and fields are required', 'INVALID_REQUEST');
            const updated = await client.updateRecord(args.table, args.sys_id, args.fields);
            return { action: 'updated', table: args.table, sys_id: args.sys_id, ...updated };
        }
        case 'snow_core_record_remove': {
            requireWrite();
            if (!args.table || !args.sys_id)
                throw new ServiceNowError('table and sys_id are required', 'INVALID_REQUEST');
            await client.deleteRecord(args.table, args.sys_id);
            return { action: 'deleted', table: args.table, sys_id: args.sys_id };
        }
        case 'snow_core_user_read':
            if (!args.user_identifier)
                throw new ServiceNowError('user_identifier is required', 'INVALID_REQUEST');
            return await client.getUser(args.user_identifier);
        case 'snow_core_group_read':
            if (!args.group_identifier)
                throw new ServiceNowError('group_identifier is required', 'INVALID_REQUEST');
            return await client.getGroup(args.group_identifier);
        case 'snow_core_cmdb_ci_query':
            return await client.searchCmdbCi(args.query, args.limit);
        case 'snow_core_cmdb_ci_read': {
            const p = args;
            if (!p.ci_sys_id)
                throw new ServiceNowError('ci_sys_id is required', 'INVALID_REQUEST');
            return await client.getCmdbCi(p.ci_sys_id, p.fields);
        }
        case 'snow_core_relationships_index': {
            const p = args;
            if (!p.ci_sys_id)
                throw new ServiceNowError('ci_sys_id is required', 'INVALID_REQUEST');
            return await client.listRelationships(p.ci_sys_id);
        }
        case 'snow_core_discovery_schedules_index':
            return await client.listDiscoverySchedules(args.active_only);
        case 'snow_core_mid_servers_index':
            return await client.listMidServers(args.active_only);
        case 'snow_core_active_events_index':
            return await client.listActiveEvents(args.query, args.limit);
        case 'snow_core_health_dashboard_read':
            return await client.cmdbHealthDashboard();
        case 'snow_core_service_mapping_summary_read': {
            const p = args;
            if (!p.service_sys_id)
                throw new ServiceNowError('service_sys_id is required', 'INVALID_REQUEST');
            return await client.serviceMappingSummary(p.service_sys_id);
        }
        case 'snow_core_natural_language_query':
            return await client.naturalLanguageSearch(args.query, args.limit);
        case 'snow_core_natural_language_modify':
            requireWrite();
            return await client.naturalLanguageUpdate(args.instruction, args.table);
        case 'snow_core_status_read':
            return serverStatus();
        case 'snow_core_capabilities_read':
            return currentCapabilities();
        case 'snow_core_instances_reload':
            return reloadInstances();
        case 'snow_core_instances_index':
            return {
                current: instanceManager.loadedCount() > 0 ? instanceManager.getCurrentName() : null,
                mode: instanceManager.loadedCount() > 0 ? 'configured' : 'unconfigured',
                instances: instanceManager.listAll(),
                total: instanceManager.listNames().length,
            };
        case 'snow_core_instance_switch':
            if (!args.name)
                throw new ServiceNowError('name is required', 'INVALID_REQUEST');
            instanceManager.switch(args.name);
            return {
                action: 'switched',
                active_instance: instanceManager.getCurrentName(),
                url: instanceManager.getCurrentUrl(),
            };
        case 'snow_core_current_instance_read':
            // Returns a shape rather than throwing when nothing is loaded: this is one of the
            // five tools a session has while unconfigured, and its job is to say so.
            return instanceManager.loadedCount() === 0
                ? { name: null, mode: 'unconfigured', all_instances: [] }
                : {
                    name: instanceManager.getCurrentName(),
                    url: instanceManager.getCurrentUrl(),
                    all_instances: instanceManager.listNames(),
                };
        case 'snow_core_ci_relationship_add': {
            requireWrite();
            if (!args.parent || !args.child || !args.type)
                throw new ServiceNowError('parent, child, and type are required', 'INVALID_REQUEST');
            const result = await client.createRecord('cmdb_rel_ci', {
                parent: args.parent,
                child: args.child,
                type: args.type,
            });
            return { ...result, summary: `Created CI relationship: ${args.parent} -> ${args.child} (${args.type})` };
        }
        case 'snow_core_analysis_impact': {
            if (!args.ci_sys_id)
                throw new ServiceNowError('ci_sys_id is required', 'INVALID_REQUEST');
            const maxDepth = args.depth || 2;
            const visited = new Set();
            const impactTree = [];
            async function traverse(ciSysId, currentDepth) {
                if (currentDepth > maxDepth || visited.has(ciSysId))
                    return [];
                visited.add(ciSysId);
                const resp = await client.queryRecords({
                    table: 'cmdb_rel_ci',
                    query: `parent=${ciSysId}`,
                    fields: 'sys_id,child,type,parent',
                    limit: 100,
                });
                const children = [];
                for (const rel of resp.records) {
                    const childId = typeof rel.child === 'object' ? rel.child.value : rel.child;
                    const downstream = await traverse(childId, currentDepth + 1);
                    children.push({ relationship: rel, downstream });
                }
                return children;
            }
            const downstream = await traverse(args.ci_sys_id, 1);
            impactTree.push({ ci_sys_id: args.ci_sys_id, depth: maxDepth, downstream });
            return { impact_analysis: impactTree, total_impacted: visited.size - 1 };
        }
        case 'snow_core_discovery_scan_exec': {
            requireWrite();
            if (!args.schedule_id)
                throw new ServiceNowError('schedule_id is required', 'INVALID_REQUEST');
            const data = {
                dsc_schedule: args.schedule_id,
                state: 'active',
            };
            if (args.mid_server)
                data.mid_server = args.mid_server;
            const result = await client.createRecord('discovery_status', data);
            return { ...result, summary: `Triggered discovery scan for schedule ${args.schedule_id}` };
        }
        default:
            return null; // not handled here
    }
}
