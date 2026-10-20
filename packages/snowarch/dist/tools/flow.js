import { ServiceNowError } from '../utils/errors.js';
import { requireWrite, requireScripting } from '../utils/permissions.js';
export function flowToolManifest() {
    return [
        {
            name: 'snow_flow_flows_index',
            description: 'List Flow Designer flows with optional filter by name, category, or active status',
            inputSchema: {
                type: 'object',
                properties: {
                    query: { type: 'string', description: 'Search flows by name or description' },
                    active: { type: 'boolean', description: 'Filter to active flows only (default true)' },
                    category: { type: 'string', description: 'Filter by category (e.g., "ITSM", "HR", "Security")' },
                    limit: { type: 'number', description: 'Max records to return (default 50)' },
                },
                required: [],
            },
            gate: 'none',
            mutates: false,
        },
        {
            name: 'snow_flow_flow_read',
            description: 'Get full details of a Flow Designer flow including its actions and trigger',
            inputSchema: {
                type: 'object',
                properties: {
                    name_or_sysid: { type: 'string', description: 'Flow name or sys_id' },
                },
                required: ['name_or_sysid'],
            },
            gate: 'none',
            mutates: false,
        },
        {
            name: 'snow_flow_flow_trigger',
            description: 'Trigger a Flow Designer flow with optional input parameters (requires WRITE_ENABLED=true)',
            inputSchema: {
                type: 'object',
                properties: {
                    flow_sys_id: { type: 'string', description: 'sys_id of the flow to trigger' },
                    inputs: { type: 'object', description: 'Key-value pairs for flow input variables' },
                },
                required: ['flow_sys_id'],
            },
            gate: 'write',
            mutates: true,
        },
        {
            name: 'snow_flow_flow_execution_read',
            description: 'Get the status and details of a specific flow execution',
            inputSchema: {
                type: 'object',
                properties: {
                    execution_sysid: { type: 'string', description: 'sys_id of the flow execution to inspect' },
                },
                required: ['execution_sysid'],
            },
            gate: 'none',
            mutates: false,
        },
        {
            name: 'snow_flow_flow_executions_index',
            description: 'List recent executions of a flow with status (completed, error, running)',
            inputSchema: {
                type: 'object',
                properties: {
                    flow_sys_id: { type: 'string', description: 'sys_id of the parent flow' },
                    status: { type: 'string', description: 'Filter by status: running, complete, error, cancelled' },
                    limit: { type: 'number', description: 'Max records to return (default 25)' },
                },
                required: ['flow_sys_id'],
            },
            gate: 'none',
            mutates: false,
        },
        {
            name: 'snow_flow_subflows_index',
            description: 'List available subflows that can be reused across flows',
            inputSchema: {
                type: 'object',
                properties: {
                    query: { type: 'string', description: 'Search subflows by name' },
                    active: { type: 'boolean', description: 'Filter to active subflows only (default true)' },
                    limit: { type: 'number', description: 'Max records to return (default 50)' },
                },
                required: [],
            },
            gate: 'none',
            mutates: false,
        },
        {
            name: 'snow_flow_subflow_read',
            description: 'Get full details of a subflow including its inputs, outputs, and actions',
            inputSchema: {
                type: 'object',
                properties: {
                    name_or_sysid: { type: 'string', description: 'Subflow name or sys_id' },
                },
                required: ['name_or_sysid'],
            },
            gate: 'none',
            mutates: false,
        },
        {
            name: 'snow_flow_action_instances_index',
            description: 'List reusable Flow Designer action instances available in the environment',
            inputSchema: {
                type: 'object',
                properties: {
                    query: { type: 'string', description: 'Search actions by name or category' },
                    category: { type: 'string', description: 'Filter by action category (e.g., "ServiceNow Core", "Integrations")' },
                    limit: { type: 'number', description: 'Max records to return (default 50)' },
                },
                required: [],
            },
            gate: 'none',
            mutates: false,
        },
        {
            name: 'snow_flow_process_automation_read',
            description: 'Get details of a Process Automation Designer playbook or process',
            inputSchema: {
                type: 'object',
                properties: {
                    name_or_sysid: { type: 'string', description: 'Playbook or process name or sys_id' },
                },
                required: ['name_or_sysid'],
            },
            gate: 'none',
            mutates: false,
        },
        {
            name: 'snow_flow_process_automations_index',
            description: 'List Process Automation Designer playbooks and processes',
            inputSchema: {
                type: 'object',
                properties: {
                    query: { type: 'string', description: 'Search by name or description' },
                    active: { type: 'boolean', description: 'Filter to active processes only (default true)' },
                    limit: { type: 'number', description: 'Max records to return (default 50)' },
                },
                required: [],
            },
            gate: 'none',
            mutates: false,
        },
        // ─── Flow Authoring ───────────────────────────────────────────────
        {
            name: 'snow_flow_flow_add',
            description: 'Create a new Flow Designer flow. **[Write]**',
            inputSchema: {
                type: 'object',
                properties: {
                    name: { type: 'string', description: 'Flow name' },
                    description: { type: 'string', description: 'Flow description' },
                    trigger_type: { type: 'string', description: 'Trigger type: record, schedule, inbound_email, rest (default record)' },
                    trigger_table: { type: 'string', description: 'Trigger table (for record triggers)' },
                    scope: { type: 'string', description: 'Application scope' },
                },
                required: ['name'],
            },
            gate: 'write',
            mutates: true,
        },
        {
            name: 'snow_flow_subflow_add',
            description: 'Create a new reusable subflow. **[Write]**',
            inputSchema: {
                type: 'object',
                properties: {
                    name: { type: 'string', description: 'Subflow name' },
                    description: { type: 'string', description: 'Subflow description' },
                    inputs: { type: 'array', items: { type: 'object' }, description: 'Input variable definitions [{name, type, mandatory}]' },
                    scope: { type: 'string', description: 'Application scope' },
                },
                required: ['name'],
            },
            gate: 'write',
            mutates: true,
        },
        {
            name: 'snow_flow_flow_action_add',
            description: 'Create a custom Flow Designer action. **[Scripting]**',
            inputSchema: {
                type: 'object',
                properties: {
                    name: { type: 'string', description: 'Action name' },
                    description: { type: 'string', description: 'Action description' },
                    inputs: { type: 'array', items: { type: 'object' }, description: 'Input definitions [{name, type, mandatory}]' },
                    outputs: { type: 'array', items: { type: 'object' }, description: 'Output definitions [{name, type}]' },
                    script: { type: 'string', description: 'Action script body' },
                },
                required: ['name'],
            },
            gate: 'scripting',
            mutates: true,
        },
        {
            name: 'snow_flow_flow_publish',
            description: 'Publish (activate) a draft flow or subflow. **[Write]**',
            inputSchema: {
                type: 'object',
                properties: {
                    flow_sys_id: { type: 'string', description: 'Flow or subflow sys_id to publish' },
                    type: { type: 'string', description: 'Type: flow or subflow (default flow)' },
                },
                required: ['flow_sys_id'],
            },
            gate: 'write',
            mutates: true,
        },
        {
            name: 'snow_flow_flow_test',
            description: 'Execute a flow in test mode with sample inputs. **[Write]**',
            inputSchema: {
                type: 'object',
                properties: {
                    flow_sys_id: { type: 'string', description: 'Flow sys_id to test' },
                    test_inputs: { type: 'object', description: 'Test input values' },
                },
                required: ['flow_sys_id'],
            },
            gate: 'write',
            // It calls createRecord on sys_hub_flow_trigger. Declared `false` until ARC-04-S09, which kept it out of the
            // generated §2.1 ask-list — a write that never prompted.
            mutates: true,
        },
        {
            name: 'snow_flow_flow_error_log_read',
            description: 'Get detailed error logs for failed flow executions',
            inputSchema: {
                type: 'object',
                properties: {
                    flow_sys_id: { type: 'string', description: 'Flow sys_id' },
                    days: { type: 'number', description: 'Look-back period in days (default 7)' },
                    limit: { type: 'number', description: 'Max records (default 25)' },
                },
                required: ['flow_sys_id'],
            },
            gate: 'none',
            mutates: false,
        },
    ];
}
export async function dispatchFlowAction(client, name, args) {
    switch (name) {
        case 'snow_flow_flows_index': {
            const parts = [];
            if (args.active !== false)
                parts.push('active=true');
            if (args.category)
                parts.push(`category=${args.category}`);
            if (args.query)
                parts.push(`nameCONTAINS${args.query}^ORdescriptionCONTAINS${args.query}`);
            return await client.queryRecords({ table: 'sys_hub_flow', query: parts.join('^') || '', limit: args.limit ?? 50 });
        }
        case 'snow_flow_flow_read': {
            if (!args.name_or_sysid)
                throw new ServiceNowError('name_or_sysid is required', 'INVALID_REQUEST');
            if (/^[0-9a-f]{32}$/i.test(args.name_or_sysid)) {
                return await client.getRecord('sys_hub_flow', args.name_or_sysid);
            }
            const resp = await client.queryRecords({ table: 'sys_hub_flow', query: `nameCONTAINS${args.name_or_sysid}`, limit: 1 });
            if (resp.count === 0)
                throw new ServiceNowError(`Flow not found: ${args.name_or_sysid}`, 'NOT_FOUND');
            return resp.records[0];
        }
        case 'snow_flow_flow_trigger': {
            requireWrite();
            if (!args.flow_sys_id)
                throw new ServiceNowError('flow_sys_id is required', 'INVALID_REQUEST');
            const payload = { sys_id: args.flow_sys_id, inputs: args.inputs ?? {} };
            const result = await client.createRecord('sys_hub_flow_trigger', payload);
            return { ...result, summary: `Triggered flow ${args.flow_sys_id}` };
        }
        case 'snow_flow_flow_execution_read': {
            if (!args.execution_sysid)
                throw new ServiceNowError('execution_sysid is required', 'INVALID_REQUEST');
            return await client.getRecord('sys_flow_context', args.execution_sysid);
        }
        case 'snow_flow_flow_executions_index': {
            if (!args.flow_sys_id)
                throw new ServiceNowError('flow_sys_id is required', 'INVALID_REQUEST');
            const parts = [`flow=${args.flow_sys_id}`];
            if (args.status)
                parts.push(`status=${args.status}`);
            return await client.queryRecords({ table: 'sys_flow_context', query: parts.join('^'), limit: args.limit ?? 25 });
        }
        case 'snow_flow_subflows_index': {
            const parts = [];
            if (args.active !== false)
                parts.push('active=true');
            if (args.query)
                parts.push(`nameCONTAINS${args.query}`);
            return await client.queryRecords({ table: 'sys_hub_subflow', query: parts.join('^') || '', limit: args.limit ?? 50 });
        }
        case 'snow_flow_subflow_read': {
            if (!args.name_or_sysid)
                throw new ServiceNowError('name_or_sysid is required', 'INVALID_REQUEST');
            if (/^[0-9a-f]{32}$/i.test(args.name_or_sysid)) {
                return await client.getRecord('sys_hub_subflow', args.name_or_sysid);
            }
            const resp = await client.queryRecords({ table: 'sys_hub_subflow', query: `nameCONTAINS${args.name_or_sysid}`, limit: 1 });
            if (resp.count === 0)
                throw new ServiceNowError(`Subflow not found: ${args.name_or_sysid}`, 'NOT_FOUND');
            return resp.records[0];
        }
        case 'snow_flow_action_instances_index': {
            const parts = [];
            if (args.category)
                parts.push(`category=${args.category}`);
            if (args.query)
                parts.push(`nameCONTAINS${args.query}`);
            return await client.queryRecords({ table: 'sys_hub_action_instance', query: parts.join('^') || '', limit: args.limit ?? 50 });
        }
        case 'snow_flow_process_automation_read': {
            if (!args.name_or_sysid)
                throw new ServiceNowError('name_or_sysid is required', 'INVALID_REQUEST');
            if (/^[0-9a-f]{32}$/i.test(args.name_or_sysid)) {
                return await client.getRecord('pa_process', args.name_or_sysid);
            }
            const resp = await client.queryRecords({ table: 'pa_process', query: `nameCONTAINS${args.name_or_sysid}`, limit: 1 });
            if (resp.count === 0)
                throw new ServiceNowError(`Process automation not found: ${args.name_or_sysid}`, 'NOT_FOUND');
            return resp.records[0];
        }
        case 'snow_flow_process_automations_index': {
            const parts = [];
            if (args.active !== false)
                parts.push('active=true');
            if (args.query)
                parts.push(`nameCONTAINS${args.query}^ORdescriptionCONTAINS${args.query}`);
            return await client.queryRecords({ table: 'pa_process', query: parts.join('^') || '', limit: args.limit ?? 50 });
        }
        case 'snow_flow_flow_add': {
            requireWrite();
            if (!args.name)
                throw new ServiceNowError('name is required', 'INVALID_REQUEST');
            const result = await client.createRecord('sys_hub_flow', { name: args.name, active: 'false', ...(args.description ? { description: args.description } : {}), ...(args.trigger_type ? { trigger_type: args.trigger_type } : {}), ...(args.trigger_table ? { trigger_table: args.trigger_table } : {}), ...(args.scope ? { sys_scope: args.scope } : {}) });
            return { action: 'created', ...result };
        }
        case 'snow_flow_subflow_add': {
            requireWrite();
            if (!args.name)
                throw new ServiceNowError('name is required', 'INVALID_REQUEST');
            const result = await client.createRecord('sys_hub_subflow', { name: args.name, active: 'false', ...(args.description ? { description: args.description } : {}), ...(args.scope ? { sys_scope: args.scope } : {}) });
            return { action: 'created', ...result };
        }
        case 'snow_flow_flow_action_add': {
            requireScripting();
            if (!args.name)
                throw new ServiceNowError('name is required', 'INVALID_REQUEST');
            const result = await client.createRecord('sys_hub_action_type_definition', { name: args.name, ...(args.description ? { description: args.description } : {}), ...(args.script ? { script: args.script } : {}) });
            return { action: 'created', ...result };
        }
        case 'snow_flow_flow_publish': {
            requireWrite();
            if (!args.flow_sys_id)
                throw new ServiceNowError('flow_sys_id is required', 'INVALID_REQUEST');
            const table = args.type === 'subflow' ? 'sys_hub_subflow' : 'sys_hub_flow';
            const result = await client.updateRecord(table, args.flow_sys_id, { active: 'true' });
            return { action: 'published', ...result };
        }
        case 'snow_flow_flow_test': {
            requireWrite();
            if (!args.flow_sys_id)
                throw new ServiceNowError('flow_sys_id is required', 'INVALID_REQUEST');
            const result = await client.createRecord('sys_hub_flow_trigger', { sys_id: args.flow_sys_id, inputs: args.test_inputs ?? {}, test_mode: 'true' });
            return { action: 'test_triggered', ...result };
        }
        case 'snow_flow_flow_error_log_read': {
            if (!args.flow_sys_id)
                throw new ServiceNowError('flow_sys_id is required', 'INVALID_REQUEST');
            const days = args.days || 7;
            const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 19).replace('T', ' ');
            return await client.queryRecords({ table: 'sys_flow_context', query: `flow=${args.flow_sys_id}^status=error^sys_created_on>=${since}`, limit: args.limit ?? 25 });
        }
        default:
            return null;
    }
}
