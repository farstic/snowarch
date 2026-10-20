import { ServiceNowError } from '../utils/errors.js';
import { requireWrite } from '../utils/permissions.js';
export function mobileToolManifest() {
    return [
        {
            name: 'snow_mob_mobile_app_configs_index',
            description: 'List ServiceNow mobile app configurations',
            inputSchema: { type: 'object', properties: { active: { type: 'boolean', description: 'Filter active (default true)' }, limit: { type: 'number' } }, required: [] },
            gate: 'none',
            mutates: false,
        },
        {
            name: 'snow_mob_mobile_app_config_read',
            description: 'Get details of a specific mobile app configuration',
            inputSchema: { type: 'object', properties: { sys_id: { type: 'string', description: 'Mobile app config sys_id' } }, required: ['sys_id'] },
            gate: 'none',
            mutates: false,
        },
        {
            name: 'snow_mob_mobile_app_config_add',
            description: 'Create a new mobile app configuration. **[Write]**',
            inputSchema: { type: 'object', properties: { name: { type: 'string', description: 'App name' }, description: { type: 'string' }, branding_color: { type: 'string', description: 'Primary colour hex' } }, required: ['name'] },
            gate: 'write',
            mutates: true,
        },
        {
            name: 'snow_mob_mobile_applets_index',
            description: 'List mobile applets (mini-apps within the mobile experience)',
            inputSchema: { type: 'object', properties: { app_config: { type: 'string', description: 'Filter by app config sys_id' }, limit: { type: 'number' } }, required: [] },
            gate: 'none',
            mutates: false,
        },
        {
            name: 'snow_mob_mobile_applet_add',
            description: 'Create a mobile applet in a mobile app. **[Write]**',
            inputSchema: { type: 'object', properties: { name: { type: 'string', description: 'Applet name' }, table: { type: 'string', description: 'Applet data table' }, icon: { type: 'string', description: 'Applet icon' }, app_config: { type: 'string', description: 'Parent app config sys_id' } }, required: ['name', 'table'] },
            gate: 'write',
            mutates: true,
        },
        {
            name: 'snow_mob_mobile_layouts_index',
            description: 'List mobile layout configurations',
            inputSchema: { type: 'object', properties: { limit: { type: 'number' } }, required: [] },
            gate: 'none',
            mutates: false,
        },
        {
            name: 'snow_mob_mobile_layout_add',
            description: 'Create a mobile layout for a specific view. **[Write]**',
            inputSchema: { type: 'object', properties: { name: { type: 'string', description: 'Layout name' }, table: { type: 'string', description: 'Target table' }, type: { type: 'string', description: 'Layout type: list, form, detail' } }, required: ['name', 'table'] },
            gate: 'write',
            mutates: true,
        },
        {
            name: 'snow_mob_offline_sync_configure',
            description: 'Configure which tables/records are available offline in mobile. **[Write]**',
            inputSchema: { type: 'object', properties: { table: { type: 'string', description: 'Table to sync offline' }, query: { type: 'string', description: 'Filter query for sync scope' }, max_records: { type: 'number', description: 'Max offline records (default 500)' } }, required: ['table'] },
            gate: 'write',
            mutates: true,
        },
        {
            name: 'snow_mob_push_notification_send',
            description: 'Send a push notification to mobile app users. **[Write]**',
            inputSchema: { type: 'object', properties: { user: { type: 'string', description: 'Target user sys_id' }, group: { type: 'string', description: 'Target group sys_id (alternative to user)' }, title: { type: 'string', description: 'Notification title' }, body: { type: 'string', description: 'Notification body text' }, action_url: { type: 'string', description: 'Deep link URL on tap' } }, required: ['title', 'body'] },
            gate: 'write',
            mutates: true,
        },
        {
            name: 'snow_mob_mobile_analytics_read',
            description: 'Get mobile app usage analytics — sessions, active users, popular applets',
            inputSchema: { type: 'object', properties: { days: { type: 'number', description: 'Analysis period in days (default 30)' } }, required: [] },
            gate: 'none',
            mutates: false,
        },
    ];
}
export async function dispatchMobileAction(client, name, args) {
    switch (name) {
        case 'snow_mob_mobile_app_configs_index': {
            const resp = await client.queryRecords({ table: 'sys_sg_mobile_app_config', query: args.active !== false ? 'active=true' : undefined, limit: args.limit || 25, fields: 'sys_id,name,description,active,sys_updated_on' });
            return { count: resp.count, configs: resp.records };
        }
        case 'snow_mob_mobile_app_config_read': {
            if (!args.sys_id)
                throw new ServiceNowError('sys_id is required', 'INVALID_REQUEST');
            return await client.getRecord('sys_sg_mobile_app_config', args.sys_id);
        }
        case 'snow_mob_mobile_app_config_add': {
            requireWrite();
            if (!args.name)
                throw new ServiceNowError('name is required', 'INVALID_REQUEST');
            const result = await client.createRecord('sys_sg_mobile_app_config', { name: args.name, active: 'true', ...(args.description ? { description: args.description } : {}), ...(args.branding_color ? { branding_color: args.branding_color } : {}) });
            return { action: 'created', ...result };
        }
        case 'snow_mob_mobile_applets_index': {
            const resp = await client.queryRecords({ table: 'sys_sg_mobile_applet', query: args.app_config ? `app_config=${args.app_config}` : undefined, limit: args.limit || 25, fields: 'sys_id,name,table,icon,app_config,order,sys_updated_on' });
            return { count: resp.count, applets: resp.records };
        }
        case 'snow_mob_mobile_applet_add': {
            requireWrite();
            if (!args.name || !args.table)
                throw new ServiceNowError('name and table are required', 'INVALID_REQUEST');
            const result = await client.createRecord('sys_sg_mobile_applet', { name: args.name, table: args.table, ...(args.icon ? { icon: args.icon } : {}), ...(args.app_config ? { app_config: args.app_config } : {}) });
            return { action: 'created', ...result };
        }
        case 'snow_mob_mobile_layouts_index': {
            const resp = await client.queryRecords({ table: 'sys_sg_mobile_layout', limit: args.limit || 25, fields: 'sys_id,name,table,type,sys_updated_on' });
            return { count: resp.count, layouts: resp.records };
        }
        case 'snow_mob_mobile_layout_add': {
            requireWrite();
            if (!args.name || !args.table)
                throw new ServiceNowError('name and table are required', 'INVALID_REQUEST');
            const result = await client.createRecord('sys_sg_mobile_layout', { name: args.name, table: args.table, ...(args.type ? { type: args.type } : {}) });
            return { action: 'created', ...result };
        }
        case 'snow_mob_offline_sync_configure': {
            requireWrite();
            if (!args.table)
                throw new ServiceNowError('table is required', 'INVALID_REQUEST');
            const result = await client.createRecord('sys_sg_offline_sync', { table: args.table, max_records: String(args.max_records || 500), ...(args.query ? { query: args.query } : {}) });
            return { action: 'configured', table: args.table, ...result };
        }
        case 'snow_mob_push_notification_send': {
            requireWrite();
            if (!args.title || !args.body)
                throw new ServiceNowError('title and body are required', 'INVALID_REQUEST');
            const result = await client.createRecord('sys_push_notification', { title: args.title, body: args.body, ...(args.user ? { user: args.user } : {}), ...(args.group ? { group: args.group } : {}), ...(args.action_url ? { action_url: args.action_url } : {}) });
            return { action: 'sent', ...result };
        }
        case 'snow_mob_mobile_analytics_read': {
            const days = args.days || 30;
            const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 19).replace('T', ' ');
            const sessions = await client.queryRecords({ table: 'sys_sg_mobile_session', query: `sys_created_on>=${since}`, limit: 1, fields: 'sys_id' });
            const configs = await client.queryRecords({ table: 'sys_sg_mobile_app_config', query: 'active=true', limit: 100, fields: 'sys_id,name' });
            return { period_days: days, total_sessions: sessions.count, active_apps: configs.count, apps: configs.records };
        }
        default:
            return null;
    }
}
