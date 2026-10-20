import { ServiceNowError } from '../utils/errors.js';
import { requireWrite } from '../utils/permissions.js';
export function userToolManifest() {
    return [
        {
            name: 'snow_usr_users_index',
            description: 'List users with optional search filter',
            inputSchema: {
                type: 'object',
                properties: {
                    query: { type: 'string', description: 'Filter (e.g., "active=true^departmentLIKEIT")' },
                    limit: { type: 'number', description: 'Max results (default: 20)' },
                },
                required: [],
            },
            gate: 'none',
            mutates: false,
        },
        {
            name: 'snow_usr_user_add',
            description: 'Create a new user account (requires WRITE_ENABLED=true)',
            inputSchema: {
                type: 'object',
                properties: {
                    user_name: { type: 'string', description: 'Unique username (login name)' },
                    email: { type: 'string', description: 'Email address' },
                    first_name: { type: 'string', description: 'First name' },
                    last_name: { type: 'string', description: 'Last name' },
                    title: { type: 'string', description: 'Job title' },
                    department: { type: 'string', description: 'Department name or sys_id' },
                },
                required: ['user_name', 'email', 'first_name', 'last_name'],
            },
            gate: 'write',
            mutates: true,
            table: 'sys_user',
        },
        {
            name: 'snow_usr_user_modify',
            description: 'Update a user account (requires WRITE_ENABLED=true)',
            inputSchema: {
                type: 'object',
                properties: {
                    sys_id: { type: 'string', description: 'System ID of the user' },
                    fields: { type: 'object', description: 'Key-value pairs to update' },
                },
                required: ['sys_id', 'fields'],
            },
            gate: 'write',
            mutates: true,
            table: 'sys_user',
        },
        {
            name: 'snow_usr_groups_index',
            description: 'List groups with optional search filter',
            inputSchema: {
                type: 'object',
                properties: {
                    query: { type: 'string', description: 'Filter (e.g., "active=true^typeLIKEitil")' },
                    limit: { type: 'number', description: 'Max results (default: 20)' },
                },
                required: [],
            },
            gate: 'none',
            mutates: false,
        },
        {
            name: 'snow_usr_group_add',
            description: 'Create a new assignment group (requires WRITE_ENABLED=true)',
            inputSchema: {
                type: 'object',
                properties: {
                    name: { type: 'string', description: 'Group name' },
                    description: { type: 'string', description: 'Group description' },
                    manager: { type: 'string', description: 'Manager user_name or sys_id' },
                },
                required: ['name'],
            },
            gate: 'write',
            mutates: true,
            table: 'sys_user_group',
        },
        {
            name: 'snow_usr_group_modify',
            description: 'Update a group (requires WRITE_ENABLED=true)',
            inputSchema: {
                type: 'object',
                properties: {
                    sys_id: { type: 'string', description: 'System ID of the group' },
                    fields: { type: 'object', description: 'Key-value pairs to update' },
                },
                required: ['sys_id', 'fields'],
            },
            gate: 'write',
            mutates: true,
            table: 'sys_user_group',
        },
        {
            name: 'snow_usr_user_group_assign',
            description: 'Add a user to a group (requires WRITE_ENABLED=true)',
            inputSchema: {
                type: 'object',
                properties: {
                    user_sys_id: { type: 'string', description: 'System ID of the user' },
                    group_sys_id: { type: 'string', description: 'System ID of the group' },
                },
                required: ['user_sys_id', 'group_sys_id'],
            },
            gate: 'write',
            mutates: true,
        },
        {
            name: 'snow_usr_user_group_unassign',
            description: 'Remove a user from a group (requires WRITE_ENABLED=true)',
            inputSchema: {
                type: 'object',
                properties: {
                    member_sys_id: { type: 'string', description: 'System ID of the sys_user_grmember record' },
                },
                required: ['member_sys_id'],
            },
            gate: 'write',
            mutates: true,
        },
    ];
}
export async function dispatchUserAction(client, name, args) {
    switch (name) {
        case 'snow_usr_users_index': {
            const resp = await client.queryRecords({ table: 'sys_user', query: args.query || 'active=true', limit: args.limit || 20, fields: 'sys_id,user_name,email,first_name,last_name,title,department,active' });
            return { count: resp.count, users: resp.records };
        }
        case 'snow_usr_user_add': {
            requireWrite();
            if (!args.user_name || !args.email || !args.first_name || !args.last_name)
                throw new ServiceNowError('user_name, email, first_name, and last_name are required', 'INVALID_REQUEST');
            const result = await client.createRecord('sys_user', args);
            return { ...result, summary: `Created user ${args.user_name}` };
        }
        case 'snow_usr_user_modify': {
            requireWrite();
            if (!args.sys_id || !args.fields)
                throw new ServiceNowError('sys_id and fields are required', 'INVALID_REQUEST');
            const result = await client.updateRecord('sys_user', args.sys_id, args.fields);
            return { ...result, summary: `Updated user ${args.sys_id}` };
        }
        case 'snow_usr_groups_index': {
            const resp = await client.queryRecords({ table: 'sys_user_group', query: args.query || 'active=true', limit: args.limit || 20, fields: 'sys_id,name,description,manager,active' });
            return { count: resp.count, groups: resp.records };
        }
        case 'snow_usr_group_add': {
            requireWrite();
            if (!args.name)
                throw new ServiceNowError('name is required', 'INVALID_REQUEST');
            const result = await client.createRecord('sys_user_group', args);
            return { ...result, summary: `Created group ${args.name}` };
        }
        case 'snow_usr_group_modify': {
            requireWrite();
            if (!args.sys_id || !args.fields)
                throw new ServiceNowError('sys_id and fields are required', 'INVALID_REQUEST');
            const result = await client.updateRecord('sys_user_group', args.sys_id, args.fields);
            return { ...result, summary: `Updated group ${args.sys_id}` };
        }
        case 'snow_usr_user_group_assign': {
            requireWrite();
            if (!args.user_sys_id || !args.group_sys_id)
                throw new ServiceNowError('user_sys_id and group_sys_id are required', 'INVALID_REQUEST');
            const result = await client.createRecord('sys_user_grmember', { user: args.user_sys_id, group: args.group_sys_id });
            return { ...result, summary: `Added user ${args.user_sys_id} to group ${args.group_sys_id}` };
        }
        case 'snow_usr_user_group_unassign': {
            requireWrite();
            if (!args.member_sys_id)
                throw new ServiceNowError('member_sys_id is required', 'INVALID_REQUEST');
            await client.deleteRecord('sys_user_grmember', args.member_sys_id);
            return { summary: `Removed group member ${args.member_sys_id}` };
        }
        default:
            return null;
    }
}
