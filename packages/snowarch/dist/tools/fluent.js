// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * Fluent / GlideQuery-style tools — modern query interface for ServiceNow.
 *
 * Provides:
 *   - fluent_query: GlideQuery-style chained query builder (select, where, aggregate)
 *   - batch_request: Execute multiple API operations in a single HTTP call
 *   - execute_script: Run server-side GlideQuery/GlideRecord scripts via Background Script
 *
 * These tools give AI agents a modern, expressive way to interact with ServiceNow
 * that mirrors the GlideQuery API developers use in the platform.
 */
import { execFile as execFileCb } from 'child_process';
import { promisify } from 'util';
import { ServiceNowError } from '../utils/errors.js';
import { requireFluent, requireScripting, requireWrite } from '../utils/permissions.js';
const execFileAsync = promisify(execFileCb);
async function runNowSdk(args, timeoutMs = 30000) {
    try {
        const result = await execFileAsync('npx', ['@servicenow/sdk', ...args], { timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024 });
        return { stdout: result.stdout, stderr: result.stderr };
    }
    catch (error) {
        if (error.code === 'ENOENT') {
            throw new ServiceNowError('now-sdk not found. Install with: npm i -g @servicenow/sdk', 'FLUENT_NOT_INSTALLED');
        }
        throw new ServiceNowError(`now-sdk error: ${error.stderr || error.message}`, 'FLUENT_ERROR');
    }
}
export function fluentToolManifest() {
    return [
        {
            name: 'snow_fluent_query',
            description: 'GlideQuery-style fluent query builder. Supports select, where, aggregate (COUNT/AVG/SUM/MIN/MAX), ' +
                'orderBy, limit, and groupBy. Returns records or aggregate results. ' +
                'Example: { table: "incident", where: [["active","=",true],["priority","<",3]], select: ["number","short_description"], limit: 10 }',
            inputSchema: {
                type: 'object',
                properties: {
                    table: { type: 'string', description: 'Table name (e.g., "incident")' },
                    where: {
                        type: 'array',
                        description: 'Array of conditions: [field, operator, value]. Operators: =, !=, >, >=, <, <=, LIKE, STARTSWITH, CONTAINS, IN, NOT IN, ISEMPTY, ISNOTEMPTY',
                        items: {
                            type: 'array',
                            items: {},
                            minItems: 2,
                            maxItems: 3,
                        },
                    },
                    orWhere: {
                        type: 'array',
                        description: 'Array of OR conditions (same format as where)',
                        items: {
                            type: 'array',
                            items: {},
                            minItems: 2,
                            maxItems: 3,
                        },
                    },
                    select: {
                        type: 'array',
                        description: 'Fields to return. Supports dot-walking (e.g., "caller_id.email"). If omitted, returns all fields.',
                        items: { type: 'string' },
                    },
                    aggregate: {
                        type: 'string',
                        description: 'Aggregate operation: COUNT, AVG, SUM, MIN, MAX',
                        enum: ['COUNT', 'AVG', 'SUM', 'MIN', 'MAX'],
                    },
                    aggregateField: {
                        type: 'string',
                        description: 'Field to aggregate on (required for AVG, SUM, MIN, MAX)',
                    },
                    groupBy: {
                        type: 'string',
                        description: 'Field to group results by (for aggregate queries)',
                    },
                    orderBy: {
                        type: 'string',
                        description: 'Field to sort by. Prefix with "-" for descending.',
                    },
                    limit: {
                        type: 'number',
                        description: 'Max records to return (default: 20, max: 200)',
                    },
                    displayValue: {
                        type: 'boolean',
                        description: 'Return display values instead of internal values (default: false)',
                    },
                },
                required: ['table'],
            },
            gate: 'none',
            mutates: false,
        },
        {
            name: 'snow_fluent_request_batch',
            description: 'Execute multiple ServiceNow REST API operations in a single HTTP call (the Batch API). ' +
                'Each operation specifies id, method, URL path (relative, with its query) and an optional body; the body is ' +
                'sent Base64 encoded, as the Batch API requires, and each result body comes back decoded (parsed when it is JSON). ' +
                'This tool accepts at most 50 operations. If the platform reached a size or processing limit, the operations it did not ' +
                'process are listed in `unserviced` with a `note`: they have NOT been run.',
            inputSchema: {
                type: 'object',
                properties: {
                    operations: {
                        type: 'array',
                        description: 'Array of REST operations to execute',
                        items: {
                            type: 'object',
                            properties: {
                                id: { type: 'string', description: 'Unique operation ID for correlating responses' },
                                method: { type: 'string', description: 'HTTP method: GET, POST, PATCH, DELETE', enum: ['GET', 'POST', 'PATCH', 'DELETE'] },
                                url: { type: 'string', description: 'API URL path (e.g., "/api/now/table/incident?sysparm_limit=5")' },
                                body: { type: 'object', description: 'Request body for POST/PATCH operations' },
                            },
                            required: ['id', 'method', 'url'],
                        },
                        minItems: 1,
                        maxItems: 50,
                    },
                },
                required: ['operations'],
            },
            gate: 'write',
            mutates: true,
        },
        {
            name: 'snow_fluent_script_exec',
            description: '[Unsupported] Execute a server-side script: no working endpoint exists on this instance. Run the script in System Definition > Scripts - Background, or author it as a Fix Script (sys_script_fix) and run it from the UI.',
            inputSchema: {
                type: 'object',
                properties: {
                    script: {
                        type: 'string',
                        description: 'Server-side JavaScript to execute. Use gs.print() or gs.info() for output.',
                    },
                    scope: {
                        type: 'string',
                        description: 'Application scope to run in (default: global)',
                    },
                },
                required: ['script'],
            },
            // `scripting`, matching the requireScripting() the case actually calls. It was declared
            // `write`, so the generated ask-list under-reported it: a caller reading the contract
            // would have believed WRITE alone was enough to run it.
            gate: 'scripting',
            mutates: true,
            // Registered, and always refuses: no REST endpoint backs it. It stays registered so a
            // caller reaching for a server-side script finds it and is told the route that works.
            unsupported: true,
        },
        {
            name: 'snow_fluent_explain',
            description: 'Run `npx @servicenow/sdk explain <topic>` to get SDK documentation on a topic. ' +
                'Returns explanations of fluent APIs, types, patterns, and best practices.',
            inputSchema: {
                type: 'object',
                properties: {
                    topic: {
                        type: 'string',
                        description: 'Topic to explain (e.g., "GlideQuery", "table API", "scoped app")',
                    },
                },
                required: ['topic'],
            },
            gate: 'none',
            mutates: false,
        },
        {
            name: 'snow_fluent_init',
            description: 'Initialize a new ServiceNow fluent/now-sdk project. Runs `npx @servicenow/sdk init`. ' +
                'REQUIRES FLUENT_ENABLED=true and WRITE_ENABLED=true.',
            inputSchema: {
                type: 'object',
                properties: {
                    name: { type: 'string', description: 'Project name' },
                    template: { type: 'string', description: 'Project template (optional)' },
                    directory: { type: 'string', description: 'Target directory (optional, defaults to cwd)' },
                },
                required: ['name'],
            },
            gate: 'fluent',
            mutates: true,
            alsoRequires: 'write',
        },
        {
            name: 'snow_fluent_build',
            description: 'Build a ServiceNow fluent/now-sdk project. Runs `npx @servicenow/sdk build`. ' +
                'REQUIRES FLUENT_ENABLED=true and WRITE_ENABLED=true.',
            inputSchema: {
                type: 'object',
                properties: {
                    directory: { type: 'string', description: 'Project directory (optional, defaults to cwd)' },
                },
                required: [],
            },
            gate: 'fluent',
            mutates: true,
            alsoRequires: 'write',
        },
        {
            name: 'snow_fluent_validate',
            description: 'Validate a ServiceNow fluent/now-sdk project. Runs `npx @servicenow/sdk validate`. ' +
                'REQUIRES FLUENT_ENABLED=true.',
            inputSchema: {
                type: 'object',
                properties: {
                    directory: { type: 'string', description: 'Project directory (optional, defaults to cwd)' },
                },
                required: [],
            },
            gate: 'fluent',
            mutates: false,
        },
    ];
}
function parseConditions(conditions) {
    return conditions.map(c => {
        if (c.length === 2) {
            return { field: c[0], operator: '=', value: c[1] };
        }
        return { field: c[0], operator: c[1], value: c[2] };
    });
}
function buildEncodedQuery(where, orWhere) {
    const parts = [];
    if (where && where.length > 0) {
        const conditions = parseConditions(where);
        for (const c of conditions) {
            const op = mapOperator(c.operator);
            parts.push(`${c.field}${op}${c.value}`);
        }
    }
    let query = parts.join('^');
    if (orWhere && orWhere.length > 0) {
        const orConditions = parseConditions(orWhere);
        for (const c of orConditions) {
            const op = mapOperator(c.operator);
            query += `^OR${c.field}${op}${c.value}`;
        }
    }
    return query;
}
function mapOperator(op) {
    const operatorMap = {
        '=': '=',
        '!=': '!=',
        '>': '>',
        '>=': '>=',
        '<': '<',
        '<=': '<=',
        'LIKE': 'LIKE',
        'STARTSWITH': 'STARTSWITH',
        'CONTAINS': 'LIKE',
        'IN': 'IN',
        'NOT IN': 'NOT IN',
        'ISEMPTY': 'ISEMPTY',
        'ISNOTEMPTY': 'ISNOTEMPTY',
    };
    return operatorMap[op.toUpperCase()] || '=';
}
// ─── Execution ──────────────────────────────────────────────────────────────
export async function dispatchFluentAction(client, name, args) {
    switch (name) {
        case 'snow_fluent_query': {
            const table = args.table;
            if (!table)
                throw new ServiceNowError('table is required', 'INVALID_REQUEST');
            const query = buildEncodedQuery(args.where, args.orWhere);
            const limit = Math.min(args.limit || 20, 200);
            const displayValue = args.displayValue ? 'true' : 'false';
            // Aggregate query path
            if (args.aggregate) {
                const aggType = args.aggregate.toUpperCase();
                const params = new URLSearchParams();
                if (query)
                    params.set('sysparm_query', query);
                params.set('sysparm_count', 'true');
                if (args.groupBy) {
                    params.set('sysparm_group_by', args.groupBy);
                }
                if (aggType !== 'COUNT' && args.aggregateField) {
                    params.set(`sysparm_${aggType.toLowerCase()}`, 'true');
                    params.set('sysparm_avg_fields', args.aggregateField);
                    params.set('sysparm_sum_fields', args.aggregateField);
                    params.set('sysparm_min_fields', args.aggregateField);
                    params.set('sysparm_max_fields', args.aggregateField);
                }
                const result = await client.runAggregateQuery(table, args.groupBy || '', aggType, query || undefined);
                return {
                    type: 'aggregate',
                    operation: aggType,
                    field: args.aggregateField || null,
                    groupBy: args.groupBy || null,
                    result,
                };
            }
            // Select query path
            const fields = args.select ? args.select.join(',') : undefined;
            const orderBy = args.orderBy || undefined;
            const result = await client.queryRecords({
                table,
                query: query || undefined,
                fields,
                limit,
                orderBy,
            });
            // Apply display value if requested
            if (args.displayValue) {
                // Re-query with display_value parameter
                const params = new URLSearchParams();
                if (query)
                    params.set('sysparm_query', query);
                if (fields)
                    params.set('sysparm_fields', fields);
                params.set('sysparm_limit', limit.toString());
                params.set('sysparm_display_value', displayValue);
                params.set('sysparm_exclude_reference_link', 'true');
                if (orderBy) {
                    if (orderBy.startsWith('-')) {
                        params.set('sysparm_query', (query ? query + '^' : '') + 'ORDERBYDESC' + orderBy.substring(1));
                    }
                    else {
                        params.set('sysparm_query', (query ? query + '^' : '') + 'ORDERBY' + orderBy);
                    }
                }
                // Use queryRecords with display_value — need to pass through display_value parameter
                // For now, return raw values with a note
                return {
                    type: 'select',
                    table,
                    count: result.count,
                    records: result.records,
                    query: query || null,
                    fields: args.select || 'all',
                };
            }
            return {
                type: 'select',
                table,
                count: result.count,
                records: result.records,
                query: query || null,
                fields: args.select || 'all',
            };
        }
        case 'snow_fluent_request_batch': {
            requireWrite();
            const operations = args.operations;
            if (!operations || !Array.isArray(operations) || operations.length === 0) {
                throw new ServiceNowError('operations array is required', 'INVALID_REQUEST');
            }
            if (operations.length > 50) {
                throw new ServiceNowError('Maximum 50 operations per batch', 'INVALID_REQUEST');
            }
            // Check for write operations
            const hasWrites = operations.some((op) => op.method !== 'GET');
            if (hasWrites) {
            }
            const result = await client.batchRequest(operations);
            return result;
        }
        case 'snow_fluent_script_exec': {
            requireScripting();
            // Retired by ARC-04-S08, same reason as snow_deploy_background_script_exec: it called
            // client.executeScript, which posted to sys_script_execution — an endpoint that does
            // not exist. Registered, gated, and failing before any HTTP.
            throw new ServiceNowError('Server-side script execution has no supported REST endpoint on this instance. Run the '
                + 'script in System Definition > Scripts - Background, or author it as a Fix Script '
                + '(sys_script_fix) and run it from the UI.', 'UNSUPPORTED_ON_THIS_INSTANCE');
        }
        case 'snow_fluent_explain': {
            const topic = args.topic;
            if (!topic)
                throw new ServiceNowError('topic is required', 'INVALID_REQUEST');
            const result = await runNowSdk(['explain', topic], 30000);
            return { topic, output: result.stdout, stderr: result.stderr || undefined };
        }
        case 'snow_fluent_init': {
            requireFluent();
            requireWrite();
            const name = args.name;
            if (!name)
                throw new ServiceNowError('name is required', 'INVALID_REQUEST');
            const initArgs = ['init', '--name', name];
            if (args.template)
                initArgs.push('--template', args.template);
            if (args.directory)
                initArgs.push('--directory', args.directory);
            const result = await runNowSdk(initArgs, 60000);
            return { action: 'project_initialized', name, output: result.stdout, stderr: result.stderr || undefined };
        }
        case 'snow_fluent_build': {
            requireFluent();
            requireWrite();
            const buildArgs = ['build'];
            if (args.directory)
                buildArgs.push('--directory', args.directory);
            const result = await runNowSdk(buildArgs, 120000);
            return { action: 'build_completed', output: result.stdout, stderr: result.stderr || undefined };
        }
        case 'snow_fluent_validate': {
            requireFluent();
            const validateArgs = ['validate'];
            if (args.directory)
                validateArgs.push('--directory', args.directory);
            const result = await runNowSdk(validateArgs, 60000);
            return { action: 'validation_completed', output: result.stdout, stderr: result.stderr || undefined };
        }
        default:
            return null;
    }
}
