import { ServiceNowError } from '../utils/errors.js';
import { requireWrite } from '../utils/permissions.js';
import { glideDateTime } from '../utils/glide-time.js';
export function problemToolManifest() {
    return [
        {
            name: 'snow_prb_problem_add',
            description: 'Create a new problem record (requires WRITE_ENABLED=true)',
            inputSchema: {
                type: 'object',
                properties: {
                    short_description: { type: 'string', description: 'Brief description of the problem' },
                    description: { type: 'string', description: 'Detailed description' },
                    assignment_group: { type: 'string', description: 'Assignment group name or sys_id' },
                    priority: { type: 'number', description: '1=Critical, 2=High, 3=Moderate, 4=Low' },
                },
                required: ['short_description'],
            },
            gate: 'write',
            mutates: true,
            table: 'problem',
        },
        {
            name: 'snow_prb_problem_read',
            description: 'Get full details of a problem by number (PRB...) or sys_id',
            inputSchema: {
                type: 'object',
                properties: {
                    number_or_sysid: { type: 'string', description: 'Problem number (PRB...) or sys_id' },
                },
                required: ['number_or_sysid'],
            },
            gate: 'none',
            mutates: false,
        },
        {
            name: 'snow_prb_problem_modify',
            description: 'Update fields on an existing problem (requires WRITE_ENABLED=true)',
            inputSchema: {
                type: 'object',
                properties: {
                    sys_id: { type: 'string', description: 'System ID of the problem' },
                    fields: { type: 'object', description: 'Key-value pairs to update' },
                },
                required: ['sys_id', 'fields'],
            },
            gate: 'write',
            mutates: true,
            table: 'problem',
        },
        {
            name: 'snow_prb_problem_resolve',
            description: 'Resolve a problem with root cause and resolution notes (requires WRITE_ENABLED=true)',
            inputSchema: {
                type: 'object',
                properties: {
                    sys_id: { type: 'string', description: 'System ID of the problem' },
                    root_cause: { type: 'string', description: 'Root cause of the problem' },
                    resolution_notes: { type: 'string', description: 'How the problem was resolved' },
                },
                required: ['sys_id', 'root_cause', 'resolution_notes'],
            },
            gate: 'write',
            mutates: true,
            table: 'problem',
        },
    ];
}
export async function dispatchProblemAction(client, name, args) {
    switch (name) {
        case 'snow_prb_problem_add': {
            requireWrite();
            if (!args.short_description)
                throw new ServiceNowError('short_description is required', 'INVALID_REQUEST');
            const result = await client.createRecord('problem', args);
            return { ...result, summary: `Created problem ${result.number || result.sys_id}` };
        }
        case 'snow_prb_problem_read': {
            if (!args.number_or_sysid)
                throw new ServiceNowError('number_or_sysid is required', 'INVALID_REQUEST');
            if (/^[0-9a-f]{32}$/i.test(args.number_or_sysid)) {
                return await client.getRecord('problem', args.number_or_sysid);
            }
            const resp = await client.queryRecords({ table: 'problem', query: `number=${args.number_or_sysid}^ORsys_id=${args.number_or_sysid}`, limit: 1 });
            if (resp.count === 0)
                throw new ServiceNowError(`Problem not found: ${args.number_or_sysid}`, 'NOT_FOUND');
            return resp.records[0];
        }
        case 'snow_prb_problem_modify': {
            requireWrite();
            if (!args.sys_id || !args.fields)
                throw new ServiceNowError('sys_id and fields are required', 'INVALID_REQUEST');
            const result = await client.updateRecord('problem', args.sys_id, args.fields);
            return { ...result, summary: `Updated problem ${args.sys_id}` };
        }
        case 'snow_prb_problem_resolve': {
            requireWrite();
            if (!args.sys_id || !args.root_cause || !args.resolution_notes)
                throw new ServiceNowError('sys_id, root_cause, and resolution_notes are required', 'INVALID_REQUEST');
            const result = await client.updateRecord('problem', args.sys_id, {
                state: '107',
                cause_notes: args.root_cause,
                fix_notes: args.resolution_notes,
                resolved_at: glideDateTime(), // ARC-09-C184: the instance's format, in UTC — an ISO string was stored as the date alone
            });
            return { ...result, summary: `Resolved problem ${args.sys_id}` };
        }
        default:
            return null;
    }
}
