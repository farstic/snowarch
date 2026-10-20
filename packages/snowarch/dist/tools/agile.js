import { ServiceNowError } from '../utils/errors.js';
import { requireWrite } from '../utils/permissions.js';
const TABLE_PREFIX = process.env.AGILE_TABLE_PREFIX || 'rm_';
export function agileToolManifest() {
    return [
        {
            name: 'snow_agile_story_add',
            description: 'Create a new agile story/user story (requires WRITE_ENABLED=true)',
            inputSchema: {
                type: 'object',
                properties: {
                    short_description: { type: 'string', description: 'Story title' },
                    story_points: { type: 'number', description: 'Story point estimate' },
                    sprint: { type: 'string', description: 'Sprint sys_id or name' },
                    epic: { type: 'string', description: 'Epic sys_id' },
                    description: { type: 'string', description: 'Story description and acceptance criteria' },
                    assigned_to: { type: 'string', description: 'User sys_id or username' },
                },
                required: ['short_description'],
            },
            gate: 'write',
            mutates: true,
        },
        {
            name: 'snow_agile_story_modify',
            description: 'Update an agile story (requires WRITE_ENABLED=true)',
            inputSchema: {
                type: 'object',
                properties: {
                    sys_id: { type: 'string', description: 'System ID of the story' },
                    fields: { type: 'object', description: 'Key-value pairs to update' },
                },
                required: ['sys_id', 'fields'],
            },
            gate: 'write',
            mutates: true,
        },
        {
            name: 'snow_agile_stories_index',
            description: 'List agile stories with optional sprint or state filter',
            inputSchema: {
                type: 'object',
                properties: {
                    sprint: { type: 'string', description: 'Filter by sprint sys_id' },
                    state: { type: 'string', description: 'Filter by state (e.g., "1"=Open, "2"=Work in Progress, "3"=Complete)' },
                    limit: { type: 'number', description: 'Max results (default: 20)' },
                },
                required: [],
            },
            gate: 'none',
            mutates: false,
        },
        {
            name: 'snow_agile_epic_add',
            description: 'Create a new epic (requires WRITE_ENABLED=true)',
            inputSchema: {
                type: 'object',
                properties: {
                    short_description: { type: 'string', description: 'Epic title' },
                    description: { type: 'string', description: 'Epic description and goals' },
                    project: { type: 'string', description: 'Project sys_id' },
                },
                required: ['short_description'],
            },
            gate: 'write',
            mutates: true,
        },
        {
            name: 'snow_agile_epic_modify',
            description: 'Update an epic (requires WRITE_ENABLED=true)',
            inputSchema: {
                type: 'object',
                properties: {
                    sys_id: { type: 'string', description: 'System ID of the epic' },
                    fields: { type: 'object', description: 'Key-value pairs to update' },
                },
                required: ['sys_id', 'fields'],
            },
            gate: 'write',
            mutates: true,
        },
        {
            name: 'snow_agile_epics_index',
            description: 'List epics with optional project or state filter',
            inputSchema: {
                type: 'object',
                properties: {
                    project: { type: 'string', description: 'Filter by project sys_id' },
                    state: { type: 'string', description: 'Filter by state' },
                    limit: { type: 'number', description: 'Max results (default: 20)' },
                },
                required: [],
            },
            gate: 'none',
            mutates: false,
        },
        {
            name: 'snow_agile_scrum_task_add',
            description: 'Create a scrum task (sub-task of a story) (requires WRITE_ENABLED=true)',
            inputSchema: {
                type: 'object',
                properties: {
                    short_description: { type: 'string', description: 'Task title' },
                    story_sys_id: { type: 'string', description: 'Parent story sys_id' },
                    assigned_to: { type: 'string', description: 'Assignee user_name or sys_id' },
                },
                required: ['short_description'],
            },
            gate: 'write',
            mutates: true,
        },
        {
            name: 'snow_agile_scrum_task_modify',
            description: 'Update a scrum task (requires WRITE_ENABLED=true)',
            inputSchema: {
                type: 'object',
                properties: {
                    sys_id: { type: 'string', description: 'System ID of the scrum task' },
                    fields: { type: 'object', description: 'Key-value pairs to update' },
                },
                required: ['sys_id', 'fields'],
            },
            gate: 'write',
            mutates: true,
        },
        {
            name: 'snow_agile_scrum_tasks_index',
            description: 'List scrum tasks, optionally filtered by story',
            inputSchema: {
                type: 'object',
                properties: {
                    story_sys_id: { type: 'string', description: 'Filter by parent story sys_id' },
                    assigned_to: { type: 'string', description: 'Filter by assignee' },
                    limit: { type: 'number', description: 'Max results (default: 20)' },
                },
                required: [],
            },
            gate: 'none',
            mutates: false,
        },
    ];
}
export async function dispatchAgileAction(client, name, args) {
    const storyTable = `${TABLE_PREFIX}story`;
    const epicTable = `${TABLE_PREFIX}epic`;
    const scrumTaskTable = `${TABLE_PREFIX}scrum_task`;
    switch (name) {
        case 'snow_agile_story_add': {
            requireWrite();
            if (!args.short_description)
                throw new ServiceNowError('short_description is required', 'INVALID_REQUEST');
            const result = await client.createRecord(storyTable, args);
            return { ...result, summary: `Created story ${result.number || result.sys_id}` };
        }
        case 'snow_agile_story_modify': {
            requireWrite();
            if (!args.sys_id || !args.fields)
                throw new ServiceNowError('sys_id and fields are required', 'INVALID_REQUEST');
            return await client.updateRecord(storyTable, args.sys_id, args.fields);
        }
        case 'snow_agile_stories_index': {
            let query = '';
            if (args.sprint)
                query = `sprint=${args.sprint}`;
            if (args.state)
                query = query ? `${query}^state=${args.state}` : `state=${args.state}`;
            const resp = await client.queryRecords({ table: storyTable, query: query || undefined, limit: args.limit || 20, fields: 'sys_id,number,short_description,state,story_points,sprint,epic,assigned_to' });
            return { count: resp.count, stories: resp.records };
        }
        case 'snow_agile_epic_add': {
            requireWrite();
            if (!args.short_description)
                throw new ServiceNowError('short_description is required', 'INVALID_REQUEST');
            const result = await client.createRecord(epicTable, args);
            return { ...result, summary: `Created epic ${result.number || result.sys_id}` };
        }
        case 'snow_agile_epic_modify': {
            requireWrite();
            if (!args.sys_id || !args.fields)
                throw new ServiceNowError('sys_id and fields are required', 'INVALID_REQUEST');
            return await client.updateRecord(epicTable, args.sys_id, args.fields);
        }
        case 'snow_agile_epics_index': {
            let query = '';
            if (args.project)
                query = `project=${args.project}`;
            if (args.state)
                query = query ? `${query}^state=${args.state}` : `state=${args.state}`;
            const resp = await client.queryRecords({ table: epicTable, query: query || undefined, limit: args.limit || 20 });
            return { count: resp.count, epics: resp.records };
        }
        case 'snow_agile_scrum_task_add': {
            requireWrite();
            if (!args.short_description)
                throw new ServiceNowError('short_description is required', 'INVALID_REQUEST');
            const data = { short_description: args.short_description };
            if (args.story_sys_id)
                data.story = args.story_sys_id;
            if (args.assigned_to)
                data.assigned_to = args.assigned_to;
            const result = await client.createRecord(scrumTaskTable, data);
            return { ...result, summary: `Created scrum task ${result.number || result.sys_id}` };
        }
        case 'snow_agile_scrum_task_modify': {
            requireWrite();
            if (!args.sys_id || !args.fields)
                throw new ServiceNowError('sys_id and fields are required', 'INVALID_REQUEST');
            return await client.updateRecord(scrumTaskTable, args.sys_id, args.fields);
        }
        case 'snow_agile_scrum_tasks_index': {
            let query = '';
            if (args.story_sys_id)
                query = `story=${args.story_sys_id}`;
            if (args.assigned_to)
                query = query ? `${query}^assigned_to.user_name=${args.assigned_to}` : `assigned_to.user_name=${args.assigned_to}`;
            const resp = await client.queryRecords({ table: scrumTaskTable, query: query || undefined, limit: args.limit || 20 });
            return { count: resp.count, scrum_tasks: resp.records };
        }
        default:
            return null;
    }
}
