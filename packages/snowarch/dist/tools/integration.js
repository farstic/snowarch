import { ServiceNowError } from '../utils/errors.js';
import { requireWrite, requireScripting } from '../utils/permissions.js';
export function integrationToolManifest() {
    return [
        // ── Outbound REST Messages ───────────────────────────────────────────────
        {
            name: 'snow_intg_rest_messages_index',
            description: 'List outbound REST Message configurations (integrations with external APIs)',
            inputSchema: {
                type: 'object',
                properties: {
                    query: { type: 'string', description: 'Search by name or description' },
                    limit: { type: 'number', description: 'Max records to return (default 25)' },
                },
                required: [],
            },
            gate: 'none',
            mutates: false,
        },
        {
            name: 'snow_intg_rest_message_read',
            description: 'Get full configuration of an outbound REST Message including its endpoints',
            inputSchema: {
                type: 'object',
                properties: {
                    sys_id_or_name: { type: 'string', description: 'REST Message sys_id or name' },
                },
                required: ['sys_id_or_name'],
            },
            gate: 'none',
            mutates: false,
        },
        {
            name: 'snow_intg_rest_message_functions_index',
            description: 'List HTTP methods (functions) defined within a REST Message',
            inputSchema: {
                type: 'object',
                properties: {
                    rest_message_sys_id: { type: 'string', description: 'Parent REST Message sys_id' },
                    limit: { type: 'number', description: 'Max records to return (default 25)' },
                },
                required: ['rest_message_sys_id'],
            },
            gate: 'none',
            mutates: false,
        },
        {
            name: 'snow_intg_rest_message_add',
            description: 'Create a new outbound REST Message definition (requires WRITE_ENABLED=true)',
            inputSchema: {
                type: 'object',
                properties: {
                    name: { type: 'string', description: 'Unique REST Message name' },
                    endpoint: { type: 'string', description: 'Base URL endpoint (e.g. "https://api.example.com/v1")' },
                    description: { type: 'string', description: 'Purpose/description of this integration' },
                    use_mutual_auth: { type: 'boolean', description: 'Whether to use mutual TLS authentication' },
                    authentication_type: {
                        type: 'string',
                        description: 'Auth type: "no_authentication", "basic", "oauth2"',
                    },
                },
                required: ['name', 'endpoint'],
            },
            gate: 'write',
            mutates: true,
        },
        // ── Transform Maps ──────────────────────────────────────────────────────
        {
            name: 'snow_intg_transform_maps_index',
            description: 'List Transform Maps used for importing data into ServiceNow tables',
            inputSchema: {
                type: 'object',
                properties: {
                    query: { type: 'string', description: 'Search by name or target table' },
                    target_table: { type: 'string', description: 'Filter by target table name (e.g. "incident")' },
                    limit: { type: 'number', description: 'Max records to return (default 25)' },
                },
                required: [],
            },
            gate: 'none',
            mutates: false,
        },
        {
            name: 'snow_intg_transform_map_read',
            description: 'Get details of a Transform Map including its field mappings',
            inputSchema: {
                type: 'object',
                properties: {
                    sys_id_or_name: { type: 'string', description: 'Transform Map sys_id or name' },
                },
                required: ['sys_id_or_name'],
            },
            gate: 'none',
            mutates: false,
        },
        {
            name: 'snow_intg_transform_map_exec',
            description: 'Execute a Transform Map on an Import Set to load data (requires WRITE_ENABLED=true)',
            inputSchema: {
                type: 'object',
                properties: {
                    transform_map_sys_id: { type: 'string', description: 'sys_id of the Transform Map to run' },
                    import_set_sys_id: { type: 'string', description: 'sys_id of the Import Set containing source data' },
                },
                required: ['transform_map_sys_id', 'import_set_sys_id'],
            },
            gate: 'write',
            mutates: true,
        },
        {
            name: 'snow_intg_transform_field_maps_index',
            description: 'List field-level mappings within a Transform Map',
            inputSchema: {
                type: 'object',
                properties: {
                    transform_map_sys_id: { type: 'string', description: 'Parent Transform Map sys_id' },
                    limit: { type: 'number', description: 'Max records to return (default 50)' },
                },
                required: ['transform_map_sys_id'],
            },
            gate: 'none',
            mutates: false,
        },
        // ── Import Sets ─────────────────────────────────────────────────────────
        {
            name: 'snow_intg_import_sets_index',
            description: 'List Import Sets with optional filter by state or staging table',
            inputSchema: {
                type: 'object',
                properties: {
                    state: { type: 'string', description: 'Filter by state: loaded, partial, transform_failed, complete' },
                    query: { type: 'string', description: 'Additional encoded query string' },
                    limit: { type: 'number', description: 'Max records to return (default 25)' },
                },
                required: [],
            },
            gate: 'none',
            mutates: false,
        },
        {
            name: 'snow_intg_import_set_read',
            description: 'Get details of a specific Import Set including row count and transform status',
            inputSchema: {
                type: 'object',
                properties: {
                    sys_id: { type: 'string', description: 'Import Set sys_id' },
                },
                required: ['sys_id'],
            },
            gate: 'none',
            mutates: false,
        },
        {
            name: 'snow_intg_import_set_row_add',
            description: 'Insert a row into an Import Set staging table for later transformation (requires WRITE_ENABLED=true)',
            inputSchema: {
                type: 'object',
                properties: {
                    staging_table: {
                        type: 'string',
                        description: 'Staging table name (e.g. "u_import_incident"). Must already exist.',
                    },
                    data: { type: 'object', description: 'Key-value pairs for the staging table row' },
                },
                required: ['staging_table', 'data'],
            },
            gate: 'write',
            mutates: true,
        },
        {
            name: 'snow_intg_data_sources_index',
            description: 'List Import Set data source definitions (file/JDBC/REST loaders)',
            inputSchema: {
                type: 'object',
                properties: {
                    query: { type: 'string', description: 'Search by name' },
                    type: { type: 'string', description: 'Filter by type: file, jdbc, ldap, rest' },
                    limit: { type: 'number', description: 'Max records to return (default 25)' },
                },
                required: [],
            },
            gate: 'none',
            mutates: false,
        },
        // ── Event Registry & Management ─────────────────────────────────────────
        {
            name: 'snow_intg_event_registry_index',
            description: 'List registered event definitions in the ServiceNow event registry',
            inputSchema: {
                type: 'object',
                properties: {
                    query: { type: 'string', description: 'Search events by name or description' },
                    limit: { type: 'number', description: 'Max records to return (default 50)' },
                },
                required: [],
            },
            gate: 'none',
            mutates: false,
        },
        {
            name: 'snow_intg_event_registry_entry_read',
            description: 'Get details of a specific registered event definition',
            inputSchema: {
                type: 'object',
                properties: {
                    name_or_sysid: { type: 'string', description: 'Event name (e.g. "incident.created") or sys_id' },
                },
                required: ['name_or_sysid'],
            },
            gate: 'none',
            mutates: false,
        },
        {
            name: 'snow_intg_event_register',
            description: 'Register a new custom event in the event registry. The name is written '
                + 'to event_name (the matching key on sysevent_register) and suffix is derived from '
                + 'everything after the first dot segment. Requires SCRIPTING_ENABLED=true.',
            inputSchema: {
                type: 'object',
                properties: {
                    name: { type: 'string', description: 'Unique event name (e.g. "my_app.record_created")' },
                    description: { type: 'string', description: 'Description of when this event fires' },
                    table: { type: 'string', description: 'Table that fires this event (e.g. "incident")' },
                    fired_by: { type: 'string', description: 'What fires this event (e.g. "Business Rule: Duplicate detection")' },
                },
                required: ['name', 'table'],
            },
            gate: 'scripting',
            // It calls createRecord on sysevent_register. Declared `false` until ARC-04-S09,
            // which left it out of the generated §2.1 ask-list — a write that never prompted.
            mutates: true,
        },
        {
            name: 'snow_intg_event_fire',
            description: 'Fire a custom ServiceNow event for a specific record (requires WRITE_ENABLED=true)',
            inputSchema: {
                type: 'object',
                properties: {
                    event_name: { type: 'string', description: 'Event name to fire (must be registered)' },
                    table: { type: 'string', description: 'Table name of the target record' },
                    record_sys_id: { type: 'string', description: 'sys_id of the record to fire the event on' },
                    parm1: { type: 'string', description: 'Optional first parameter passed to event handlers' },
                    parm2: { type: 'string', description: 'Optional second parameter passed to event handlers' },
                },
                required: ['event_name', 'table', 'record_sys_id'],
            },
            gate: 'write',
            mutates: true,
        },
        {
            name: 'snow_intg_event_log_index',
            description: 'List recent event log entries (fired events and their processing status)',
            inputSchema: {
                type: 'object',
                properties: {
                    event_name: { type: 'string', description: 'Filter by event name' },
                    state: {
                        type: 'string',
                        description: 'Filter by state: ready, processing, processed, error, transferred',
                    },
                    limit: { type: 'number', description: 'Max records to return (default 50)' },
                },
                required: [],
            },
            gate: 'none',
            mutates: false,
        },
        // ── OAuth & Credentials ─────────────────────────────────────────────────
        {
            name: 'snow_intg_oauth_applications_index',
            description: 'List OAuth application registry entries (client applications that can authenticate)',
            inputSchema: {
                type: 'object',
                properties: {
                    query: { type: 'string', description: 'Search by name or client ID' },
                    limit: { type: 'number', description: 'Max records to return (default 25)' },
                },
                required: [],
            },
            gate: 'none',
            mutates: false,
        },
        {
            name: 'snow_intg_credential_aliases_index',
            description: 'List connection and credential aliases used by integrations',
            inputSchema: {
                type: 'object',
                properties: {
                    query: { type: 'string', description: 'Search by name' },
                    type: { type: 'string', description: 'Filter by type: basic, oauth2, api_key, certificate' },
                    limit: { type: 'number', description: 'Max records to return (default 25)' },
                },
                required: [],
            },
            gate: 'none',
            mutates: false,
        },
    ];
}
export async function dispatchIntegrationAction(client, name, args) {
    switch (name) {
        // ── Outbound REST Messages ───────────────────────────────────────────────
        case 'snow_intg_rest_messages_index': {
            const parts = [];
            if (args.query)
                parts.push(`nameCONTAINS${args.query}^ORdescriptionCONTAINS${args.query}`);
            return await client.queryRecords({
                table: 'sys_rest_message',
                query: parts.join('^') || undefined,
                limit: args.limit ?? 25,
                fields: 'sys_id,name,endpoint,description,authentication_type,sys_updated_on',
            });
        }
        case 'snow_intg_rest_message_read': {
            if (!args.sys_id_or_name)
                throw new ServiceNowError('sys_id_or_name is required', 'INVALID_REQUEST');
            if (/^[0-9a-f]{32}$/i.test(args.sys_id_or_name)) {
                return await client.getRecord('sys_rest_message', args.sys_id_or_name);
            }
            const resp = await client.queryRecords({
                table: 'sys_rest_message',
                query: `name=${args.sys_id_or_name}`,
                limit: 1,
            });
            if (resp.count === 0)
                throw new ServiceNowError(`REST Message not found: ${args.sys_id_or_name}`, 'NOT_FOUND');
            return resp.records[0];
        }
        case 'snow_intg_rest_message_functions_index': {
            if (!args.rest_message_sys_id)
                throw new ServiceNowError('rest_message_sys_id is required', 'INVALID_REQUEST');
            return await client.queryRecords({
                table: 'sys_rest_message_fn',
                query: `rest_message=${args.rest_message_sys_id}`,
                limit: args.limit ?? 25,
                fields: 'sys_id,name,http_method,relative_path,rest_message,sys_updated_on',
            });
        }
        case 'snow_intg_rest_message_add': {
            requireWrite();
            if (!args.name || !args.endpoint)
                throw new ServiceNowError('name and endpoint are required', 'INVALID_REQUEST');
            const data = {
                name: args.name,
                endpoint: args.endpoint,
                description: args.description || '',
                authentication_type: args.authentication_type || 'no_authentication',
            };
            if (args.use_mutual_auth !== undefined)
                data.use_mutual_auth = args.use_mutual_auth;
            const result = await client.createRecord('sys_rest_message', data);
            return { ...result, summary: `Created REST Message "${args.name}"` };
        }
        // ── Transform Maps ──────────────────────────────────────────────────────
        case 'snow_intg_transform_maps_index': {
            const parts = [];
            if (args.target_table)
                parts.push(`target_table=${args.target_table}`);
            if (args.query)
                parts.push(`nameCONTAINS${args.query}^ORtarget_tableCONTAINS${args.query}`);
            return await client.queryRecords({
                table: 'sys_transform_map',
                query: parts.join('^') || undefined,
                limit: args.limit ?? 25,
                fields: 'sys_id,name,target_table,source_table,active,sys_updated_on',
            });
        }
        case 'snow_intg_transform_map_read': {
            if (!args.sys_id_or_name)
                throw new ServiceNowError('sys_id_or_name is required', 'INVALID_REQUEST');
            if (/^[0-9a-f]{32}$/i.test(args.sys_id_or_name)) {
                return await client.getRecord('sys_transform_map', args.sys_id_or_name);
            }
            const resp = await client.queryRecords({
                table: 'sys_transform_map',
                query: `name=${args.sys_id_or_name}`,
                limit: 1,
            });
            if (resp.count === 0)
                throw new ServiceNowError(`Transform Map not found: ${args.sys_id_or_name}`, 'NOT_FOUND');
            return resp.records[0];
        }
        case 'snow_intg_transform_map_exec': {
            requireWrite();
            if (!args.transform_map_sys_id || !args.import_set_sys_id) {
                throw new ServiceNowError('transform_map_sys_id and import_set_sys_id are required', 'INVALID_REQUEST');
            }
            // Trigger transform via Scripted REST — create a sys_import_set_run record
            const data = {
                import_set: args.import_set_sys_id,
                transform_map: args.transform_map_sys_id,
            };
            const result = await client.createRecord('sys_import_set_run', data);
            return {
                ...result,
                summary: `Triggered Transform Map ${args.transform_map_sys_id} on Import Set ${args.import_set_sys_id}`,
            };
        }
        case 'snow_intg_transform_field_maps_index': {
            if (!args.transform_map_sys_id)
                throw new ServiceNowError('transform_map_sys_id is required', 'INVALID_REQUEST');
            return await client.queryRecords({
                table: 'sys_transform_entry',
                query: `map=${args.transform_map_sys_id}`,
                limit: args.limit ?? 50,
                fields: 'sys_id,map,source_field,target_field,coalesce,use_source_script,sys_updated_on',
            });
        }
        // ── Import Sets ─────────────────────────────────────────────────────────
        case 'snow_intg_import_sets_index': {
            const parts = [];
            if (args.state)
                parts.push(`state=${args.state}`);
            if (args.query)
                parts.push(args.query);
            return await client.queryRecords({
                table: 'sys_import_set',
                query: parts.join('^') || undefined,
                limit: args.limit ?? 25,
                fields: 'sys_id,label,state,table_name,import_count,error_count,sys_created_on',
            });
        }
        case 'snow_intg_import_set_read': {
            if (!args.sys_id)
                throw new ServiceNowError('sys_id is required', 'INVALID_REQUEST');
            return await client.getRecord('sys_import_set', args.sys_id);
        }
        case 'snow_intg_import_set_row_add': {
            requireWrite();
            if (!args.staging_table || !args.data) {
                throw new ServiceNowError('staging_table and data are required', 'INVALID_REQUEST');
            }
            const result = await client.createRecord(args.staging_table, args.data);
            return { ...result, summary: `Inserted row into staging table "${args.staging_table}"` };
        }
        case 'snow_intg_data_sources_index': {
            const parts = [];
            if (args.type)
                parts.push(`type=${args.type}`);
            if (args.query)
                parts.push(`nameCONTAINS${args.query}`);
            return await client.queryRecords({
                table: 'sys_data_source',
                query: parts.join('^') || undefined,
                limit: args.limit ?? 25,
                fields: 'sys_id,name,type,format,import_set_table_name,sys_updated_on',
            });
        }
        // ── Event Registry ──────────────────────────────────────────────────────
        case 'snow_intg_event_registry_index': {
            const parts = [];
            if (args.query)
                parts.push(`nameCONTAINS${args.query}^ORdescriptionCONTAINS${args.query}`);
            return await client.queryRecords({
                table: 'sysevent_register',
                query: parts.join('^') || undefined,
                limit: args.limit ?? 50,
                fields: 'sys_id,name,table,description,sys_updated_on',
            });
        }
        case 'snow_intg_event_registry_entry_read': {
            if (!args.name_or_sysid)
                throw new ServiceNowError('name_or_sysid is required', 'INVALID_REQUEST');
            if (/^[0-9a-f]{32}$/i.test(args.name_or_sysid)) {
                return await client.getRecord('sysevent_register', args.name_or_sysid);
            }
            const resp = await client.queryRecords({
                table: 'sysevent_register',
                query: `name=${args.name_or_sysid}`,
                limit: 1,
            });
            if (resp.count === 0) {
                throw new ServiceNowError(`Event registry entry not found: ${args.name_or_sysid}`, 'NOT_FOUND');
            }
            return resp.records[0];
        }
        case 'snow_intg_event_register': {
            requireScripting();
            if (!args.name || !args.table)
                throw new ServiceNowError('name and table are required', 'INVALID_REQUEST');
            // `event_name`, not `name`. `sysevent_register`'s matching key is `event_name`; the `name`
            // column exists but is not what the platform matches on, so a row written with only `name`
            // registered nothing usable and read back with an empty `event_name` (field-notes §4).
            // `suffix` is everything after the first dot segment, the convention the UI applies — a
            // single-segment name has no suffix, and the empty string is correct rather than a
            // fallback to the whole name.
            const eventName = String(args.name);
            const data = {
                event_name: eventName,
                table: args.table,
                description: args.description || '',
                suffix: eventName.split('.').slice(1).join('.'),
                fired_by: args.fired_by || '',
            };
            const result = await client.createRecord('sysevent_register', data);
            return {
                ...result,
                event_name: eventName,
                summary: `Registered event "${eventName}" for table "${args.table}"`,
            };
        }
        case 'snow_intg_event_fire': {
            requireWrite();
            if (!args.event_name || !args.table || !args.record_sys_id) {
                throw new ServiceNowError('event_name, table, and record_sys_id are required', 'INVALID_REQUEST');
            }
            // Fire via sys_event table insert
            const data = {
                name: args.event_name,
                table: args.table,
                instance: args.record_sys_id,
            };
            if (args.parm1)
                data.parm1 = args.parm1;
            if (args.parm2)
                data.parm2 = args.parm2;
            const result = await client.createRecord('sysevent', data);
            return {
                ...result,
                summary: `Fired event "${args.event_name}" on ${args.table}:${args.record_sys_id}`,
            };
        }
        case 'snow_intg_event_log_index': {
            const parts = [];
            if (args.event_name)
                parts.push(`nameCONTAINS${args.event_name}`);
            if (args.state)
                parts.push(`state=${args.state}`);
            return await client.queryRecords({
                table: 'sysevent',
                query: parts.join('^') || undefined,
                limit: args.limit ?? 50,
                orderBy: '-sys_created_on',
                fields: 'sys_id,name,table,instance,state,parm1,parm2,sys_created_on',
            });
        }
        // ── OAuth ────────────────────────────────────────────────────────────────
        case 'snow_intg_oauth_applications_index': {
            const parts = [];
            if (args.query)
                parts.push(`nameCONTAINS${args.query}^ORclient_idCONTAINS${args.query}`);
            return await client.queryRecords({
                table: 'oauth_entity',
                query: parts.join('^') || undefined,
                limit: args.limit ?? 25,
                fields: 'sys_id,name,client_id,type,active,sys_updated_on',
            });
        }
        case 'snow_intg_credential_aliases_index': {
            const parts = [];
            if (args.type)
                parts.push(`type=${args.type}`);
            if (args.query)
                parts.push(`nameCONTAINS${args.query}`);
            return await client.queryRecords({
                table: 'sys_alias',
                query: parts.join('^') || undefined,
                limit: args.limit ?? 25,
                fields: 'sys_id,name,type,description,sys_updated_on',
            });
        }
        default:
            return null;
    }
}
