import { ServiceNowError } from '../utils/errors.js';
import { requireWrite, requireScripting } from '../utils/permissions.js';
export function workspaceToolManifest() {
    return [
        // ─── UIB Pages ─────────────────────────────────────────────────
        {
            name: 'snow_ws_uib_pages_index',
            description: 'List UI Builder pages and their route configurations',
            inputSchema: { type: 'object', properties: { limit: { type: 'number', description: 'Max records (default 25)' }, app: { type: 'string', description: 'Filter by UX app sys_id' } }, required: [] },
            gate: 'none',
            mutates: false,
        },
        {
            name: 'snow_ws_uib_page_read',
            description: 'Get details of a specific UI Builder page including layout and child elements',
            inputSchema: { type: 'object', properties: { sys_id: { type: 'string', description: 'UIB page sys_id' } }, required: ['sys_id'] },
            gate: 'none',
            mutates: false,
        },
        {
            name: 'snow_ws_uib_page_add',
            description: 'Create a new UI Builder page with route registration. **[Write]**',
            inputSchema: { type: 'object', properties: { title: { type: 'string', description: 'Page title' }, path: { type: 'string', description: 'URL path segment' }, app: { type: 'string', description: 'Parent UX app sys_id' }, layout: { type: 'string', description: 'Layout type: single, sidebar, tabbed (default single)' } }, required: ['title', 'path'] },
            gate: 'write',
            mutates: true,
        },
        {
            name: 'snow_ws_uib_page_modify',
            description: 'Update an existing UI Builder page. **[Write]**',
            inputSchema: { type: 'object', properties: { sys_id: { type: 'string', description: 'UIB page sys_id' }, title: { type: 'string', description: 'Page title. The column is not documented in the bundled corpus — verify on the instance.' }, path: { type: 'string', description: 'Page path. The column is not documented in the bundled corpus — verify on the instance.' }, layout: { type: 'string', description: 'Page layout. The column is not documented in the bundled corpus — verify on the instance.' } }, required: ['sys_id'] },
            gate: 'write',
            mutates: true,
        },
        {
            name: 'snow_ws_uib_page_remove',
            description: 'Delete a UI Builder page. **[Write]**',
            inputSchema: { type: 'object', properties: { sys_id: { type: 'string', description: 'UIB page sys_id' } }, required: ['sys_id'] },
            gate: 'write',
            mutates: true,
        },
        // ─── UIB Components ────────────────────────────────────────────
        {
            name: 'snow_ws_uib_components_index',
            description: 'List available UI Builder components (macroponents) in the instance',
            inputSchema: { type: 'object', properties: { limit: { type: 'number', description: 'Max records (default 50)' }, scope: { type: 'string', description: 'Filter by scope/app' } }, required: [] },
            gate: 'none',
            mutates: false,
        },
        {
            name: 'snow_ws_uib_component_add',
            description: 'Create a custom UI Builder component (macroponent). **[Scripting]**',
            inputSchema: { type: 'object', properties: { name: { type: 'string', description: 'Component name' }, label: { type: 'string', description: 'Display label' }, description: { type: 'string' }, category: { type: 'string', description: 'Component category' } }, required: ['name', 'label'] },
            gate: 'scripting',
            mutates: true,
        },
        {
            name: 'snow_ws_uib_component_modify',
            description: 'Update a UI Builder component. **[Scripting]**',
            inputSchema: { type: 'object', properties: { sys_id: { type: 'string', description: 'Component sys_id' }, label: { type: 'string', description: 'Display label. The column is not documented in the bundled corpus — verify on the instance.' }, description: { type: 'string', description: 'Description. The column is not documented in the bundled corpus — verify on the instance.' } }, required: ['sys_id'] },
            gate: 'scripting',
            mutates: true,
        },
        // ─── UIB Data Brokers ──────────────────────────────────────────
        {
            name: 'snow_ws_uib_data_brokers_index',
            description: 'List UI Builder data brokers (data sources for pages)',
            inputSchema: { type: 'object', properties: { page_sys_id: { type: 'string', description: 'Filter by page' }, limit: { type: 'number' } }, required: [] },
            gate: 'none',
            mutates: false,
        },
        {
            name: 'snow_ws_uib_data_broker_add',
            description: 'Create a UI Builder data broker to feed data to a page. **[Scripting]**',
            inputSchema: { type: 'object', properties: { name: { type: 'string', description: 'Broker name' }, table: { type: 'string', description: 'Source table' }, query: { type: 'string', description: 'Encoded query filter' }, page: { type: 'string', description: 'Target page sys_id' } }, required: ['name', 'table'] },
            gate: 'scripting',
            mutates: true,
        },
        // ─── Configurable Workspaces ───────────────────────────────────
        {
            name: 'snow_ws_workspaces_index',
            description: 'List all configurable agent workspaces',
            inputSchema: { type: 'object', properties: { active: { type: 'boolean', description: 'Filter active (default true)' }, limit: { type: 'number' } }, required: [] },
            gate: 'none',
            mutates: false,
        },
        {
            name: 'snow_ws_workspace_read',
            description: 'Get details of a configurable agent workspace including tabs and lists',
            inputSchema: { type: 'object', properties: { sys_id: { type: 'string', description: 'Workspace sys_id' } }, required: ['sys_id'] },
            gate: 'none',
            mutates: false,
        },
        {
            name: 'snow_ws_workspace_add',
            description: 'Create a new configurable agent workspace. **[Write]**',
            inputSchema: { type: 'object', properties: { name: { type: 'string', description: 'Workspace name' }, description: { type: 'string' }, table: { type: 'string', description: 'Primary table (e.g. incident)' }, icon: { type: 'string', description: 'Workspace icon name' } }, required: ['name', 'table'] },
            gate: 'write',
            mutates: true,
        },
        {
            name: 'snow_ws_workspace_list_configure',
            description: 'Add or update a list view in an agent workspace. **[Write]**',
            inputSchema: { type: 'object', properties: { workspace_sys_id: { type: 'string', description: 'Workspace sys_id' }, table: { type: 'string', description: 'List table' }, title: { type: 'string', description: 'List title' }, query: { type: 'string', description: 'Encoded query filter' }, columns: { type: 'string', description: 'Comma-separated field names' } }, required: ['workspace_sys_id', 'table', 'title'] },
            gate: 'write',
            mutates: true,
        },
        // ─── UX App Configuration ──────────────────────────────────────
        {
            name: 'snow_ws_ux_app_route_add',
            description: 'Register a new route (URL path) in a UX app. **[Write]**',
            inputSchema: { type: 'object', properties: { app_sys_id: { type: 'string', description: 'UX app sys_id' }, path: { type: 'string', description: 'Route path' }, page_sys_id: { type: 'string', description: 'Target UIB page sys_id' }, title: { type: 'string', description: 'Route title' } }, required: ['app_sys_id', 'path', 'page_sys_id'] },
            gate: 'write',
            mutates: true,
        },
        {
            name: 'snow_ws_ux_experience_add',
            description: 'Create a new UX Experience (app shell) configuration. **[Write]**',
            inputSchema: { type: 'object', properties: { name: { type: 'string', description: 'Experience name' }, app_sys_id: { type: 'string', description: 'UX app sys_id' }, landing_page: { type: 'string', description: 'Landing page sys_id' } }, required: ['name', 'app_sys_id'] },
            gate: 'write',
            mutates: true,
        },
    ];
}
/** The given fields that were sent, and no others (ARC-09-C121). */
function declaredOnly(args, fields) {
    return Object.fromEntries(fields.filter((f) => args[f] !== undefined).map((f) => [f, args[f]]));
}
export async function dispatchWorkspaceAction(client, name, args) {
    switch (name) {
        case 'snow_ws_uib_pages_index': {
            let query = '';
            if (args.app)
                query = `application=${args.app}`;
            const resp = await client.queryRecords({ table: 'sys_ux_page', query: query || undefined, limit: args.limit || 25, fields: 'sys_id,title,path,application,sys_updated_on' });
            return { count: resp.count, pages: resp.records };
        }
        case 'snow_ws_uib_page_read': {
            if (!args.sys_id)
                throw new ServiceNowError('sys_id is required', 'INVALID_REQUEST');
            return await client.getRecord('sys_ux_page', args.sys_id);
        }
        case 'snow_ws_uib_page_add': {
            requireWrite();
            if (!args.title || !args.path)
                throw new ServiceNowError('title and path are required', 'INVALID_REQUEST');
            const result = await client.createRecord('sys_ux_page', { title: args.title, path: args.path, ...(args.app ? { application: args.app } : {}) });
            return { action: 'created', ...result };
        }
        case 'snow_ws_uib_page_modify': {
            requireWrite();
            if (!args.sys_id)
                throw new ServiceNowError('sys_id is required', 'INVALID_REQUEST');
            // ARC-09-C121: the declared fields and nothing else. This spread every other argument into the PATCH, so an
            // undeclared one was written to the page; the router now refuses one, and this writes only these.
            const result = await client.updateRecord('sys_ux_page', args.sys_id, declaredOnly(args, ['title', 'path', 'layout']));
            return { action: 'updated', ...result };
        }
        case 'snow_ws_uib_page_remove': {
            requireWrite();
            if (!args.sys_id)
                throw new ServiceNowError('sys_id is required', 'INVALID_REQUEST');
            await client.deleteRecord('sys_ux_page', args.sys_id);
            return { action: 'deleted', sys_id: args.sys_id };
        }
        case 'snow_ws_uib_components_index': {
            const resp = await client.queryRecords({ table: 'sys_ux_macroponent', query: args.scope ? `sys_scope=${args.scope}` : undefined, limit: args.limit || 50, fields: 'sys_id,name,label,category,sys_scope,sys_updated_on' });
            return { count: resp.count, components: resp.records };
        }
        case 'snow_ws_uib_component_add': {
            requireScripting();
            if (!args.name || !args.label)
                throw new ServiceNowError('name and label are required', 'INVALID_REQUEST');
            const result = await client.createRecord('sys_ux_macroponent', { name: args.name, label: args.label, ...(args.description ? { description: args.description } : {}), ...(args.category ? { category: args.category } : {}) });
            return { action: 'created', ...result };
        }
        case 'snow_ws_uib_component_modify': {
            requireScripting();
            if (!args.sys_id)
                throw new ServiceNowError('sys_id is required', 'INVALID_REQUEST');
            const result = await client.updateRecord('sys_ux_macroponent', args.sys_id, declaredOnly(args, ['label', 'description']));
            return { action: 'updated', ...result };
        }
        case 'snow_ws_uib_data_brokers_index': {
            const resp = await client.queryRecords({ table: 'sys_ux_data_broker_transform', query: args.page_sys_id ? `page=${args.page_sys_id}` : undefined, limit: args.limit || 25, fields: 'sys_id,name,table,page,sys_updated_on' });
            return { count: resp.count, data_brokers: resp.records };
        }
        case 'snow_ws_uib_data_broker_add': {
            requireScripting();
            if (!args.name || !args.table)
                throw new ServiceNowError('name and table are required', 'INVALID_REQUEST');
            const result = await client.createRecord('sys_ux_data_broker_transform', { name: args.name, table: args.table, ...(args.query ? { query: args.query } : {}), ...(args.page ? { page: args.page } : {}) });
            return { action: 'created', ...result };
        }
        case 'snow_ws_workspaces_index': {
            const resp = await client.queryRecords({ table: 'sys_aw_workspace', query: args.active !== false ? 'active=true' : undefined, limit: args.limit || 25, fields: 'sys_id,name,description,table,active,icon,sys_updated_on' });
            return { count: resp.count, workspaces: resp.records };
        }
        case 'snow_ws_workspace_read': {
            if (!args.sys_id)
                throw new ServiceNowError('sys_id is required', 'INVALID_REQUEST');
            const ws = await client.getRecord('sys_aw_workspace', args.sys_id);
            const lists = await client.queryRecords({ table: 'sys_aw_list', query: `workspace=${args.sys_id}`, limit: 50, fields: 'sys_id,title,table,query,columns' });
            return { ...ws, lists: lists.records };
        }
        case 'snow_ws_workspace_add': {
            requireWrite();
            if (!args.name || !args.table)
                throw new ServiceNowError('name and table are required', 'INVALID_REQUEST');
            const result = await client.createRecord('sys_aw_workspace', { name: args.name, table: args.table, active: 'true', ...(args.description ? { description: args.description } : {}), ...(args.icon ? { icon: args.icon } : {}) });
            return { action: 'created', ...result };
        }
        case 'snow_ws_workspace_list_configure': {
            requireWrite();
            if (!args.workspace_sys_id || !args.table || !args.title)
                throw new ServiceNowError('workspace_sys_id, table, and title are required', 'INVALID_REQUEST');
            const result = await client.createRecord('sys_aw_list', { workspace: args.workspace_sys_id, table: args.table, title: args.title, ...(args.query ? { query: args.query } : {}), ...(args.columns ? { columns: args.columns } : {}) });
            return { action: 'created', ...result };
        }
        case 'snow_ws_ux_app_route_add': {
            requireWrite();
            if (!args.app_sys_id || !args.path || !args.page_sys_id)
                throw new ServiceNowError('app_sys_id, path, and page_sys_id required', 'INVALID_REQUEST');
            const result = await client.createRecord('sys_ux_app_route', { application: args.app_sys_id, path: args.path, page: args.page_sys_id, ...(args.title ? { title: args.title } : {}) });
            return { action: 'created', ...result };
        }
        case 'snow_ws_ux_experience_add': {
            requireWrite();
            if (!args.name || !args.app_sys_id)
                throw new ServiceNowError('name and app_sys_id are required', 'INVALID_REQUEST');
            const result = await client.createRecord('sys_ux_app_config', { name: args.name, application: args.app_sys_id, ...(args.landing_page ? { landing_page: args.landing_page } : {}) });
            return { action: 'created', ...result };
        }
        default:
            return null;
    }
}
