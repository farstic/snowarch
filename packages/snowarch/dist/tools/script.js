import { ServiceNowError } from '../utils/errors.js';
import { requireScripting } from '../utils/permissions.js';
export function scriptToolManifest() {
    return [
        {
            name: 'snow_scr_business_rules_index',
            description: 'List business rules (requires SCRIPTING_ENABLED=true)',
            inputSchema: {
                type: 'object',
                properties: {
                    table: { type: 'string', description: 'Filter by table name' },
                    active: { type: 'boolean', description: 'Filter to active rules only' },
                    limit: { type: 'number', description: 'Max results (default: 20)' },
                },
                required: [],
            },
            gate: 'none',
            mutates: false,
        },
        {
            name: 'snow_scr_business_rule_read',
            description: 'Get full details and script body of a business rule (requires SCRIPTING_ENABLED=true)',
            inputSchema: {
                type: 'object',
                properties: {
                    sys_id: { type: 'string', description: 'System ID of the business rule' },
                },
                required: ['sys_id'],
            },
            gate: 'none',
            mutates: false,
        },
        {
            name: 'snow_scr_business_rule_add',
            description: '[Scripting] Create a new business rule in one write (requires SCRIPTING_ENABLED=true): filter_condition, advanced and active are all set on the create, so no follow-up modify is needed and no half-built rule sits on the table. A name or value the platform stores cut at its column limit, or a filter or Advanced switch the response does not show as set, comes back in `warnings`. ServiceNow supports ES2021 async/await in scripts. Defaults: advanced true, active true, action_insert true, action_update true, action_delete false, action_query false.',
            inputSchema: {
                type: 'object',
                properties: {
                    name: { type: 'string', description: 'Rule name' },
                    table: { type: 'string', description: 'Table this rule applies to' },
                    when: { type: 'string', enum: ['before', 'after', 'async', 'display'], description: 'When the rule runs: "before" | "after" | "async" | "display". Anything else is refused before the write.' },
                    script: { type: 'string', description: 'Server-side JavaScript. ServiceNow supports ES2021 (async/await, ?., ??).' },
                    condition: { type: 'string', description: 'Optional condition SCRIPT (the Advanced section\'s Condition field). For a condition built from field tests, use filter_condition.' },
                    filter_condition: { type: 'string', description: 'Optional filter as an encoded query (for example "priority=1^state=2"): the form\'s Filter Conditions builder, which decides whether the rule runs. Omit it only for a rule that should run on every matching operation. For changes, changesTo or changesFrom use the condition script (for example current.priority.changesTo(1)); their encoded-query form, and this column name, are not documented in the bundled corpus - verify on the instance.' },
                    advanced: { type: 'boolean', description: 'Enable the form\'s Advanced section, where the script lives (default: true — this tool requires a script). The column name, and what the platform does with a script when this is false, are not documented in the bundled corpus - verify on the instance.' },
                    active: { type: 'boolean', description: 'Whether to activate the rule (default: true)' },
                    order: { type: 'integer', description: 'Execution order, a whole number: rules run from lowest to highest (default: 100 when omitted; 0 is a valid order and is sent as 0). Anything that is not a whole number is refused before the write.' },
                    action_insert: { type: 'boolean', description: 'Run on insert (default: true)' },
                    action_update: { type: 'boolean', description: 'Run on update (default: true)' },
                    action_delete: { type: 'boolean', description: 'Run on delete (default: false)' },
                    action_query: { type: 'boolean', description: 'Run on query (default: false)' },
                },
                required: ['name', 'table', 'when', 'script'],
            },
            gate: 'scripting',
            mutates: true,
            table: 'sys_script',
        },
        {
            name: 'snow_scr_business_rule_modify',
            description: '[Scripting] Update a business rule (requires SCRIPTING_ENABLED=true)',
            inputSchema: {
                type: 'object',
                properties: {
                    sys_id: { type: 'string', description: 'System ID of the rule' },
                    fields: { type: 'object', description: 'Key-value pairs to update (name, script, active, advanced, condition [a script], filter_condition [an encoded query], etc.)' },
                },
                required: ['sys_id', 'fields'],
            },
            gate: 'scripting',
            mutates: true,
            table: 'sys_script',
        },
        {
            name: 'snow_scr_script_includes_index',
            description: 'List script includes (requires SCRIPTING_ENABLED=true)',
            inputSchema: {
                type: 'object',
                properties: {
                    query: { type: 'string', description: 'Filter (e.g., "nameLIKEUtil")' },
                    active: { type: 'boolean', description: 'Filter to active includes' },
                    limit: { type: 'number', description: 'Max results (default: 20)' },
                },
                required: [],
            },
            gate: 'none',
            mutates: false,
        },
        {
            name: 'snow_scr_script_include_read',
            description: 'Get full script body of a script include (requires SCRIPTING_ENABLED=true)',
            inputSchema: {
                type: 'object',
                properties: {
                    sys_id_or_name: { type: 'string', description: 'Script include sys_id or api_name' },
                },
                required: ['sys_id_or_name'],
            },
            gate: 'none',
            mutates: false,
        },
        {
            name: 'snow_scr_script_include_add',
            description: '[Scripting] Create a new script include (requires SCRIPTING_ENABLED=true)',
            inputSchema: {
                type: 'object',
                properties: {
                    name: { type: 'string', description: 'Script include name' },
                    script: { type: 'string', description: 'Script body (class definition). ServiceNow supports ES2021.' },
                    api_name: { type: 'string', description: 'API name used to call this from other scripts' },
                    access: { type: 'string', description: '"public" or "package_private" (default: "public")' },
                    active: { type: 'boolean', description: 'Whether to activate (default: true)' },
                },
                required: ['name', 'script'],
            },
            gate: 'scripting',
            mutates: true,
            table: 'sys_script_include',
        },
        {
            name: 'snow_scr_script_include_modify',
            description: '[Scripting] Update a script include (requires SCRIPTING_ENABLED=true)',
            inputSchema: {
                type: 'object',
                properties: {
                    sys_id: { type: 'string', description: 'System ID of the script include' },
                    fields: { type: 'object', description: 'Key-value pairs to update' },
                },
                required: ['sys_id', 'fields'],
            },
            gate: 'scripting',
            mutates: true,
            table: 'sys_script_include',
        },
        {
            name: 'snow_scr_client_scripts_index',
            description: 'List client scripts (requires SCRIPTING_ENABLED=true)',
            inputSchema: {
                type: 'object',
                properties: {
                    table: { type: 'string', description: 'Filter by table name' },
                    type: { type: 'string', description: '"onLoad" | "onChange" | "onSubmit" | "onCellEdit"' },
                    active: { type: 'boolean', description: 'Filter to active scripts' },
                    limit: { type: 'number', description: 'Max results (default: 20)' },
                },
                required: [],
            },
            gate: 'none',
            mutates: false,
        },
        {
            name: 'snow_scr_client_script_read',
            description: 'Get full details and script body of a client script (requires SCRIPTING_ENABLED=true)',
            inputSchema: {
                type: 'object',
                properties: {
                    sys_id: { type: 'string', description: 'System ID of the client script' },
                },
                required: ['sys_id'],
            },
            gate: 'none',
            mutates: false,
        },
        {
            name: 'snow_scr_changesets_index',
            description: 'List update sets (changesets) (requires SCRIPTING_ENABLED=true)',
            inputSchema: {
                type: 'object',
                properties: {
                    state: { type: 'string', description: 'Filter by state: "in progress", "complete", "ignore"' },
                    limit: { type: 'number', description: 'Max results (default: 20)' },
                },
                required: [],
            },
            gate: 'none',
            mutates: false,
        },
        {
            name: 'snow_scr_changeset_read',
            description: 'Get details of an update set (requires SCRIPTING_ENABLED=true)',
            inputSchema: {
                type: 'object',
                properties: {
                    sys_id_or_name: { type: 'string', description: 'Update set sys_id or name' },
                },
                required: ['sys_id_or_name'],
            },
            gate: 'none',
            mutates: false,
        },
        {
            name: 'snow_scr_changeset_commit',
            description: '[Scripting] Commit an update set (requires SCRIPTING_ENABLED=true)',
            inputSchema: {
                type: 'object',
                properties: {
                    sys_id: { type: 'string', description: 'System ID of the update set' },
                },
                required: ['sys_id'],
            },
            gate: 'scripting',
            mutates: true,
        },
        {
            name: 'snow_scr_changeset_publish',
            description: '[Scripting] Publish/export an update set to XML for deployment (requires SCRIPTING_ENABLED=true)',
            inputSchema: {
                type: 'object',
                properties: {
                    sys_id: { type: 'string', description: 'System ID of the update set' },
                },
                required: ['sys_id'],
            },
            gate: 'scripting',
            mutates: true,
        },
        // ── Client Script CRUD ───────────────────────────────────────────────────
        {
            name: 'snow_scr_client_script_add',
            description: '[Scripting] Create a new client script (onLoad, onChange, onSubmit, onCellEdit) (requires SCRIPTING_ENABLED=true)',
            inputSchema: {
                type: 'object',
                properties: {
                    name: { type: 'string', description: 'Script name' },
                    table: { type: 'string', description: 'Table this client script applies to' },
                    type: { type: 'string', description: '"onLoad" | "onChange" | "onSubmit" | "onCellEdit"' },
                    script: { type: 'string', description: 'Client-side JavaScript. Use g_form, g_user, etc.' },
                    field_name: { type: 'string', description: 'Field name (required for onChange/onCellEdit)' },
                    active: { type: 'boolean', description: 'Whether to activate the script (default: true)' },
                    global: { type: 'boolean', description: 'Run script globally (default: false)' },
                },
                required: ['name', 'table', 'type', 'script'],
            },
            gate: 'scripting',
            mutates: true,
            table: 'sys_script_client',
        },
        {
            name: 'snow_scr_client_script_modify',
            description: '[Scripting] Update an existing client script (requires SCRIPTING_ENABLED=true)',
            inputSchema: {
                type: 'object',
                properties: {
                    sys_id: { type: 'string', description: 'Client script sys_id' },
                    fields: { type: 'object', description: 'Fields to update (script, active, name, type, etc.)' },
                },
                required: ['sys_id', 'fields'],
            },
            gate: 'scripting',
            mutates: true,
            table: 'sys_script_client',
        },
        // ── UI Policies ──────────────────────────────────────────────────────────
        {
            name: 'snow_scr_ui_policies_index',
            description: 'List UI Policies for a table (field visibility, mandatory, read-only rules) (requires SCRIPTING_ENABLED=true)',
            inputSchema: {
                type: 'object',
                properties: {
                    table: { type: 'string', description: 'Filter by table name' },
                    active: { type: 'boolean', description: 'Filter to active policies only' },
                    limit: { type: 'number', description: 'Max results (default: 25)' },
                },
                required: [],
            },
            gate: 'none',
            mutates: false,
        },
        {
            name: 'snow_scr_ui_policy_read',
            description: 'Get full details and conditions of a UI Policy (requires SCRIPTING_ENABLED=true)',
            inputSchema: {
                type: 'object',
                properties: {
                    sys_id: { type: 'string', description: 'UI Policy sys_id' },
                },
                required: ['sys_id'],
            },
            gate: 'none',
            mutates: false,
        },
        {
            name: 'snow_scr_ui_policy_add',
            description: '[Scripting] Create a new UI Policy to control field behavior dynamically (requires SCRIPTING_ENABLED=true)',
            inputSchema: {
                type: 'object',
                properties: {
                    short_description: { type: 'string', description: 'Policy description' },
                    table: { type: 'string', description: 'Table to apply this policy on' },
                    conditions: { type: 'string', description: 'Encoded query conditions that trigger the policy' },
                    script: { type: 'string', description: 'Optional script to run when conditions are met' },
                    active: { type: 'boolean', description: 'Whether to activate immediately (default: true)' },
                    run_scripts: { type: 'boolean', description: 'Run script in addition to UI actions (default: false)' },
                },
                required: ['short_description', 'table'],
            },
            gate: 'scripting',
            mutates: true,
            table: 'sys_ui_policy',
        },
        // ── UI Actions ───────────────────────────────────────────────────────────
        {
            name: 'snow_scr_ui_actions_index',
            description: 'List UI Actions (buttons, context menus, related links) for a table (requires SCRIPTING_ENABLED=true)',
            inputSchema: {
                type: 'object',
                properties: {
                    table: { type: 'string', description: 'Filter by table name' },
                    type: { type: 'string', description: 'Filter by type: button, context_menu, related_link, list_link, list_button, list_context_menu' },
                    active: { type: 'boolean', description: 'Filter to active actions only' },
                    limit: { type: 'number', description: 'Max results (default: 25)' },
                },
                required: [],
            },
            gate: 'none',
            mutates: false,
        },
        {
            name: 'snow_scr_ui_action_read',
            description: 'Get full details and script of a UI Action (requires SCRIPTING_ENABLED=true)',
            inputSchema: {
                type: 'object',
                properties: {
                    sys_id: { type: 'string', description: 'UI Action sys_id' },
                },
                required: ['sys_id'],
            },
            gate: 'none',
            mutates: false,
        },
        {
            name: 'snow_scr_ui_action_add',
            description: '[Scripting] Create a new UI Action (button or link) on a form (requires SCRIPTING_ENABLED=true)',
            inputSchema: {
                type: 'object',
                properties: {
                    name: { type: 'string', description: 'Button/link label visible to users' },
                    table: { type: 'string', description: 'Table to add this action on' },
                    action_name: { type: 'string', description: 'Internal action name (no spaces)' },
                    script: { type: 'string', description: 'Server-side script to execute when clicked' },
                    type: { type: 'string', description: '"button" | "context_menu" | "related_link" | "list_button"' },
                    condition: { type: 'string', description: 'Condition to show/hide the action' },
                    active: { type: 'boolean', description: 'Whether to activate immediately (default: true)' },
                    form_button: { type: 'boolean', description: 'Show on form (default: true)' },
                    list_button: { type: 'boolean', description: 'Show on list (default: false)' },
                },
                required: ['name', 'table', 'action_name'],
            },
            gate: 'scripting',
            mutates: true,
            table: 'sys_ui_action',
        },
        {
            name: 'snow_scr_ui_action_modify',
            description: '[Scripting] Update an existing UI Action (requires SCRIPTING_ENABLED=true)',
            inputSchema: {
                type: 'object',
                properties: {
                    sys_id: { type: 'string', description: 'UI Action sys_id' },
                    fields: { type: 'object', description: 'Fields to update (name, script, active, condition, etc.)' },
                },
                required: ['sys_id', 'fields'],
            },
            gate: 'scripting',
            mutates: true,
            table: 'sys_ui_action',
        },
        // ── ACL Management ───────────────────────────────────────────────────────
        {
            name: 'snow_scr_acls_index',
            description: 'List Access Control rules (ACLs) — who can read/write/create/delete records (requires SCRIPTING_ENABLED=true)',
            inputSchema: {
                type: 'object',
                properties: {
                    table: { type: 'string', description: 'Filter ACLs by table name' },
                    operation: { type: 'string', description: 'Filter by operation: read, write, create, delete, execute' },
                    active: { type: 'boolean', description: 'Filter to active ACLs only' },
                    limit: { type: 'number', description: 'Max results (default: 25)' },
                },
                required: [],
            },
            gate: 'none',
            mutates: false,
        },
        {
            name: 'snow_scr_acl_read',
            description: 'Get full details of an ACL rule including its script and role requirements (requires SCRIPTING_ENABLED=true)',
            inputSchema: {
                type: 'object',
                properties: {
                    sys_id: { type: 'string', description: 'ACL sys_id' },
                },
                required: ['sys_id'],
            },
            gate: 'none',
            mutates: false,
        },
        {
            name: 'snow_scr_acl_add',
            description: '[Scripting] Create a new ACL rule to control access to a table or field (requires SCRIPTING_ENABLED=true)',
            inputSchema: {
                type: 'object',
                properties: {
                    name: { type: 'string', description: 'ACL name (typically "table.field" or "table.*")' },
                    type: { type: 'string', description: '"record" | "field" | "rest_endpoint" | "soap_endpoint"' },
                    operation: { type: 'string', description: '"read" | "write" | "create" | "delete" | "execute"' },
                    admin_overrides: { type: 'boolean', description: 'Allow admin to override (default: true)' },
                    active: { type: 'boolean', description: 'Whether to activate immediately (default: true)' },
                    script: { type: 'string', description: 'Optional condition script (return true to allow)' },
                    roles: { type: 'string', description: 'Comma-separated roles required (e.g. "admin,itil")' },
                    description: { type: 'string', description: 'Description of this access rule' },
                },
                required: ['name', 'operation'],
            },
            gate: 'scripting',
            mutates: true,
            table: 'sys_security_acl',
        },
        {
            name: 'snow_scr_acl_modify',
            description: '[Scripting] Update an existing ACL rule (requires SCRIPTING_ENABLED=true)',
            inputSchema: {
                type: 'object',
                properties: {
                    sys_id: { type: 'string', description: 'ACL sys_id' },
                    fields: { type: 'object', description: 'Fields to update (active, script, roles, condition, etc.)' },
                },
                required: ['sys_id', 'fields'],
            },
            gate: 'scripting',
            mutates: true,
            table: 'sys_security_acl',
        },
    ];
}
const SCRIPT_TOOL_NAMES = new Set([
    'snow_scr_business_rules_index', 'snow_scr_business_rule_read', 'snow_scr_business_rule_add', 'snow_scr_business_rule_modify',
    'snow_scr_script_includes_index', 'snow_scr_script_include_read', 'snow_scr_script_include_add', 'snow_scr_script_include_modify',
    'snow_scr_client_scripts_index', 'snow_scr_client_script_read', 'snow_scr_client_script_add', 'snow_scr_client_script_modify',
    'snow_scr_changesets_index', 'snow_scr_changeset_read', 'snow_scr_changeset_commit', 'snow_scr_changeset_publish',
    'snow_scr_ui_policies_index', 'snow_scr_ui_policy_read', 'snow_scr_ui_policy_add',
    'snow_scr_ui_actions_index', 'snow_scr_ui_action_read', 'snow_scr_ui_action_add', 'snow_scr_ui_action_modify',
    'snow_scr_acls_index', 'snow_scr_acl_read', 'snow_scr_acl_add', 'snow_scr_acl_modify',
]);
/**
 * A boolean argument, or the fallback when it was not given. Anything else is refused: the server does
 * not validate arguments against the input schema, so a client can send the STRING "false", and
 * reading that as "not given" created a LIVE rule when an inactive one was asked for.
 */
function strictBool(name, v, fallback) {
    if (v === undefined || v === null)
        return fallback;
    if (typeof v === 'boolean')
        return v;
    throw new ServiceNowError(`${name} must be true or false`, 'INVALID_REQUEST');
}
const isTrue = (v) => v === true || v === 'true';
/**
 * The four values the form's When field takes: "display, before, async, or after the database operation
 * is complete" (vendor/ServiceNowDocs/markdown/api-reference/business-rules-classic/c_BusinessRules.md).
 */
const RULE_WHEN = ['before', 'after', 'async', 'display'];
/** A value for an error message: short, and never the whole of something a caller typed. */
const shown = (v) => {
    const text = typeof v === 'string' ? JSON.stringify(v) : (Array.isArray(v) ? 'an array' : typeof v === 'object' && v !== null ? 'an object' : String(v));
    return text.length > 40 ? `${text.slice(0, 37)}...` : text;
};
/**
 * The rule's execution order. Omitted or null is the form's default of 100; 0 is an order like any other
 * (it used to become 100). The corpus says "a number indicating the sequence ... from lowest to highest";
 * that the column is a whole number is not printed there, and a fraction sent to an integer column would be
 * cut or rounded without a word, so only a whole number goes through.
 */
function ruleOrder(v) {
    if (v === undefined || v === null)
        return 100;
    if (typeof v !== 'number' || !Number.isInteger(v))
        throw new ServiceNowError(`order must be a whole number (got ${shown(v)}); omit it for the default of 100`, 'INVALID_REQUEST');
    return v;
}
export async function dispatchScriptAction(client, name, args) {
    // Only gate scripting tools — return null for unrelated tools so dispatch continues
    if (!SCRIPT_TOOL_NAMES.has(name))
        return null;
    // The gate is NOT here any more. It used to sit before the switch, so SCRIPTING gated
    // reads as well as writes — listing a Script Include needed a write flag. SCRIPTING means
    // *writing* those objects (01 §6.3); each mutating case now opens with the gate, and the
    // reads have none. tests/tools/gate-split.test.ts derives both families from the
    // registered catalogue, so a new tool cannot slip through unclassified.
    switch (name) {
        case 'snow_scr_business_rules_index': {
            let query = '';
            if (args.active !== undefined)
                query = `active=${args.active}`;
            if (args.table)
                query = query ? `${query}^collection=${args.table}` : `collection=${args.table}`;
            const resp = await client.queryRecords({ table: 'sys_script', query: query || undefined, limit: args.limit || 20, fields: 'sys_id,name,collection,when,active,order,sys_updated_on' });
            return { count: resp.count, business_rules: resp.records, note: 'ServiceNow supports ES2021 (async/await, ?., ??) in script bodies' };
        }
        case 'snow_scr_business_rule_read': {
            if (!args.sys_id)
                throw new ServiceNowError('sys_id is required', 'INVALID_REQUEST');
            return await client.getRecord('sys_script', args.sys_id);
        }
        case 'snow_scr_business_rule_add': {
            requireScripting();
            if (!args.name || !args.table || !args.when || !args.script)
                throw new ServiceNowError('name, table, when, and script are required', 'INVALID_REQUEST');
            // ARC-09-C103: `when` and `order` are checked HERE, before any write. A rule created with the wrong
            // `when` exists, is active, and fires in the wrong place - or not at all - and `order || 100` turned
            // an order of 0 into 100 and passed "abc" through to the platform.
            if (typeof args.when !== 'string' || !RULE_WHEN.includes(args.when))
                throw new ServiceNowError(`when must be one of ${RULE_WHEN.map((w) => `"${w}"`).slice(0, -1).join(', ')} or "${RULE_WHEN[RULE_WHEN.length - 1]}" `
                    + `(got ${shown(args.when)})`, 'INVALID_REQUEST');
            const order = ruleOrder(args.order);
            // All four action_* flags are ALWAYS sent, as booleans. The payload used to omit them
            // entirely, and a sys_script row created with no action flags fires on nothing — the rule
            // existed, looked correct in the UI list, and never ran (field-notes §5). Defaults match
            // the platform's own form: insert and update on, delete and query off.
            const flag = (v, fallback) => (typeof v === 'boolean' ? v : fallback);
            // ARC-09-C92: the filter and the Advanced switch are part of the CREATE. They were not
            // accepted at all, so a rule that was meant to carry a filter had to be created without one —
            // live on its whole table, or held inactive — and completed by a second write. A filter that is
            // not a string is refused HERE, before any write: dropping it would create exactly the
            // unconditioned rule this exists to prevent. `null`, '' and whitespace mean "not given"
            // (nothing to clear on a create, and a blank conditions value is not a filter).
            //
            // Grounding: the form labels "Filter Conditions", "Advanced" and "Condition", and that the
            // Condition field is available under Advanced, are printed in
            // vendor/ServiceNowDocs/markdown/api-reference/business-rules-classic/c_BusinessRules.md. The
            // COLUMN names `filter_condition` and `advanced` are not printed anywhere in the bundled corpus
            // - verify on the instance. That is why the response is checked below.
            if (args.filter_condition !== undefined && args.filter_condition !== null
                && typeof args.filter_condition !== 'string')
                throw new ServiceNowError('filter_condition must be a string (an encoded query, for example "priority=1^state=2")', 'INVALID_REQUEST');
            const advanced = strictBool('advanced', args.advanced, true);
            const active = strictBool('active', args.active, true);
            const data = {
                name: args.name, collection: args.table, when: args.when, script: args.script,
                ...(typeof args.filter_condition === 'string' && args.filter_condition.trim() !== ''
                    ? { filter_condition: args.filter_condition } : {}),
                condition: args.condition,
                // Default TRUE: this tool requires a script, and the form's Condition script is available
                // under Advanced (c_BusinessRules.md, above). Whether a script posted without it is ignored
                // is not stated in the bundled corpus - verify on the instance; sending it is the path the
                // form documents.
                advanced,
                active, order,
                action_insert: flag(args.action_insert, true),
                action_update: flag(args.action_update, true),
                action_delete: flag(args.action_delete, false),
                action_query: flag(args.action_query, false),
            };
            const result = await client.createRecord('sys_script', data);
            // The name the platform STORED, not the one that was sent. This line used to repeat the
            // argument, so a name cut at the column's limit was reported whole (ARC-09-C93). If it was cut,
            // `warnings` on this result says so and gives the limit.
            const stored = typeof result?.name === 'string' && result.name !== '' ? result.name : args.name;
            // "One write" is only true if the platform kept what the write carried. A column name it does not
            // know is ignored without an error, and the rule would then exist without its filter, live. The
            // check is for PRESENCE, not equality: the platform may normalise a conditions value.
            const notStored = [];
            const missing = (field, why) => ({
                code: 'FIELD_NOT_STORED', table: 'sys_script', ...(typeof result?.sys_id === 'string' ? { sys_id: result.sys_id } : {}),
                field,
                message: `sys_script.${field} was sent but the response does not show it as set: ${why} The rule exists`
                    + `${data.active ? ' and is active' : ''}. Read it back with snow_scr_business_rule_read; if it is not set, `
                    + `correct it with snow_scr_business_rule_modify (do not add the rule again, which would make a second rule)`
                    + `${data.active ? ' and set active to false first' : ''}.`,
            });
            if ('filter_condition' in data
                && !(typeof result?.filter_condition === 'string' && result.filter_condition.trim() !== ''))
                notStored.push(missing('filter_condition', 'the rule may run on every matching operation.'));
            if (advanced && !isTrue(result?.advanced))
                notStored.push(missing('advanced', 'the script may not run.'));
            const base = 'GlideEncrypter is deprecated in recent releases; use new sn_si.Vault or keystore APIs instead';
            const note = advanced ? base
                : `${base}. advanced is false, so the script and condition fields are in the section the form hides; whether the platform runs them is not documented in the bundled corpus - verify on the instance.`;
            return {
                ...result, summary: `Created business rule ${stored}`, note,
                ...(notStored.length > 0 ? { warnings: notStored } : {}),
            };
        }
        case 'snow_scr_business_rule_modify': {
            requireScripting();
            if (!args.sys_id || !args.fields)
                throw new ServiceNowError('sys_id and fields are required', 'INVALID_REQUEST');
            const result = await client.updateRecord('sys_script', args.sys_id, args.fields);
            return { ...result, summary: `Updated business rule ${args.sys_id}` };
        }
        case 'snow_scr_script_includes_index': {
            let query = '';
            if (args.active !== undefined)
                query = `active=${args.active}`;
            if (args.query)
                query = query ? `${query}^${args.query}` : args.query;
            const resp = await client.queryRecords({ table: 'sys_script_include', query: query || undefined, limit: args.limit || 20, fields: 'sys_id,name,api_name,active,access,sys_updated_on' });
            return { count: resp.count, script_includes: resp.records };
        }
        case 'snow_scr_script_include_read': {
            if (!args.sys_id_or_name)
                throw new ServiceNowError('sys_id_or_name is required', 'INVALID_REQUEST');
            if (/^[0-9a-f]{32}$/i.test(args.sys_id_or_name)) {
                return await client.getRecord('sys_script_include', args.sys_id_or_name);
            }
            const resp = await client.queryRecords({ table: 'sys_script_include', query: `api_name=${args.sys_id_or_name}^ORname=${args.sys_id_or_name}`, limit: 1 });
            if (resp.count === 0)
                throw new ServiceNowError(`Script include not found: ${args.sys_id_or_name}`, 'NOT_FOUND');
            return resp.records[0];
        }
        case 'snow_scr_script_include_add': {
            requireScripting();
            if (!args.name || !args.script)
                throw new ServiceNowError('name and script are required', 'INVALID_REQUEST');
            const data = { name: args.name, script: args.script, api_name: args.api_name || args.name, access: args.access || 'public', active: args.active !== false };
            const result = await client.createRecord('sys_script_include', data);
            return { ...result, summary: `Created script include ${args.name}`, note: 'ES2021 (async/await, ?., ??) supported in the latest release' };
        }
        case 'snow_scr_script_include_modify': {
            requireScripting();
            if (!args.sys_id || !args.fields)
                throw new ServiceNowError('sys_id and fields are required', 'INVALID_REQUEST');
            return await client.updateRecord('sys_script_include', args.sys_id, args.fields);
        }
        case 'snow_scr_client_scripts_index': {
            let query = '';
            if (args.active !== undefined)
                query = `active=${args.active}`;
            if (args.table)
                query = query ? `${query}^table=${args.table}` : `table=${args.table}`;
            if (args.type)
                query = query ? `${query}^type=${args.type}` : `type=${args.type}`;
            const resp = await client.queryRecords({ table: 'sys_script_client', query: query || undefined, limit: args.limit || 20, fields: 'sys_id,name,table,type,active,sys_updated_on' });
            return { count: resp.count, client_scripts: resp.records };
        }
        case 'snow_scr_client_script_read': {
            if (!args.sys_id)
                throw new ServiceNowError('sys_id is required', 'INVALID_REQUEST');
            return await client.getRecord('sys_script_client', args.sys_id);
        }
        case 'snow_scr_changesets_index': {
            let query = '';
            if (args.state)
                query = `state=${args.state}`;
            const resp = await client.queryRecords({ table: 'sys_update_set', query: query || undefined, limit: args.limit || 20, fields: 'sys_id,name,state,description,application,sys_updated_on' });
            return { count: resp.count, changesets: resp.records, note: 'Latest ReleaseOps provides automated deployment pipelines for changesets' };
        }
        case 'snow_scr_changeset_read': {
            if (!args.sys_id_or_name)
                throw new ServiceNowError('sys_id_or_name is required', 'INVALID_REQUEST');
            if (/^[0-9a-f]{32}$/i.test(args.sys_id_or_name)) {
                return await client.getRecord('sys_update_set', args.sys_id_or_name);
            }
            const resp = await client.queryRecords({ table: 'sys_update_set', query: `name=${args.sys_id_or_name}^ORsys_id=${args.sys_id_or_name}`, limit: 1 });
            if (resp.count === 0)
                throw new ServiceNowError(`Changeset not found: ${args.sys_id_or_name}`, 'NOT_FOUND');
            return resp.records[0];
        }
        case 'snow_scr_changeset_commit': {
            requireScripting();
            if (!args.sys_id)
                throw new ServiceNowError('sys_id is required', 'INVALID_REQUEST');
            const result = await client.updateRecord('sys_update_set', args.sys_id, { state: 'complete' });
            return { ...result, summary: `Committed changeset ${args.sys_id}` };
        }
        case 'snow_scr_changeset_publish': {
            requireScripting();
            if (!args.sys_id)
                throw new ServiceNowError('sys_id is required', 'INVALID_REQUEST');
            const result = await client.updateRecord('sys_update_set', args.sys_id, { state: 'complete' });
            return { ...result, summary: `Published changeset ${args.sys_id}` };
        }
        // ── Client Script CRUD ───────────────────────────────────────────────────
        case 'snow_scr_client_script_add': {
            requireScripting();
            if (!args.name || !args.table || !args.type || !args.script)
                throw new ServiceNowError('name, table, type, and script are required', 'INVALID_REQUEST');
            const data = {
                name: args.name,
                table: args.table,
                type: args.type,
                script: args.script,
                active: args.active !== false,
                global: args.global ?? false,
            };
            if (args.field_name)
                data.field_name = args.field_name;
            const result = await client.createRecord('sys_script_client', data);
            return { ...result, summary: `Created client script "${args.name}" (${args.type}) on table "${args.table}"` };
        }
        case 'snow_scr_client_script_modify': {
            requireScripting();
            if (!args.sys_id || !args.fields)
                throw new ServiceNowError('sys_id and fields are required', 'INVALID_REQUEST');
            const result = await client.updateRecord('sys_script_client', args.sys_id, args.fields);
            return { ...result, summary: `Updated client script ${args.sys_id}` };
        }
        // ── UI Policies ──────────────────────────────────────────────────────────
        case 'snow_scr_ui_policies_index': {
            let query = '';
            if (args.active !== undefined)
                query = `active=${args.active}`;
            if (args.table)
                query = query ? `${query}^model_table=${args.table}` : `model_table=${args.table}`;
            const resp = await client.queryRecords({
                table: 'sys_ui_policy',
                query: query || undefined,
                limit: args.limit || 25,
                fields: 'sys_id,short_description,model_table,active,conditions,sys_updated_on',
            });
            return { count: resp.count, ui_policies: resp.records };
        }
        case 'snow_scr_ui_policy_read': {
            if (!args.sys_id)
                throw new ServiceNowError('sys_id is required', 'INVALID_REQUEST');
            return await client.getRecord('sys_ui_policy', args.sys_id);
        }
        case 'snow_scr_ui_policy_add': {
            requireScripting();
            if (!args.short_description || !args.table)
                throw new ServiceNowError('short_description and table are required', 'INVALID_REQUEST');
            const data = {
                short_description: args.short_description,
                model_table: args.table,
                active: args.active !== false,
                run_scripts: args.run_scripts ?? false,
            };
            if (args.conditions)
                data.conditions = args.conditions;
            if (args.script)
                data.script = args.script;
            const result = await client.createRecord('sys_ui_policy', data);
            return { ...result, summary: `Created UI policy "${args.short_description}" on table "${args.table}"` };
        }
        // ── UI Actions ───────────────────────────────────────────────────────────
        case 'snow_scr_ui_actions_index': {
            let query = '';
            if (args.active !== undefined)
                query = `active=${args.active}`;
            if (args.table)
                query = query ? `${query}^table=${args.table}` : `table=${args.table}`;
            if (args.type)
                query = query ? `${query}^action_type=${args.type}` : `action_type=${args.type}`;
            const resp = await client.queryRecords({
                table: 'sys_ui_action',
                query: query || undefined,
                limit: args.limit || 25,
                fields: 'sys_id,name,table,action_type,active,form_button,list_button,sys_updated_on',
            });
            return { count: resp.count, ui_actions: resp.records };
        }
        case 'snow_scr_ui_action_read': {
            if (!args.sys_id)
                throw new ServiceNowError('sys_id is required', 'INVALID_REQUEST');
            return await client.getRecord('sys_ui_action', args.sys_id);
        }
        case 'snow_scr_ui_action_add': {
            requireScripting();
            if (!args.name || !args.table || !args.action_name)
                throw new ServiceNowError('name, table, and action_name are required', 'INVALID_REQUEST');
            const data = {
                name: args.name,
                table: args.table,
                action_name: args.action_name,
                active: args.active !== false,
                form_button: args.form_button !== false,
                list_button: args.list_button ?? false,
            };
            if (args.script)
                data.script = args.script;
            if (args.condition)
                data.condition = args.condition;
            if (args.type)
                data.action_type = args.type;
            const result = await client.createRecord('sys_ui_action', data);
            return { ...result, summary: `Created UI action "${args.name}" on table "${args.table}"` };
        }
        case 'snow_scr_ui_action_modify': {
            requireScripting();
            if (!args.sys_id || !args.fields)
                throw new ServiceNowError('sys_id and fields are required', 'INVALID_REQUEST');
            const result = await client.updateRecord('sys_ui_action', args.sys_id, args.fields);
            return { ...result, summary: `Updated UI action ${args.sys_id}` };
        }
        // ── ACL Management ───────────────────────────────────────────────────────
        case 'snow_scr_acls_index': {
            let query = '';
            if (args.active !== undefined)
                query = `active=${args.active}`;
            if (args.table)
                query = query ? `${query}^name=${args.table}.*^ORname=${args.table}` : `nameLIKE${args.table}`;
            if (args.operation)
                query = query ? `${query}^operation=${args.operation}` : `operation=${args.operation}`;
            const resp = await client.queryRecords({
                table: 'sys_security_acl',
                query: query || undefined,
                limit: args.limit || 25,
                fields: 'sys_id,name,type,operation,active,admin_overrides,sys_updated_on',
            });
            return { count: resp.count, acls: resp.records };
        }
        case 'snow_scr_acl_read': {
            if (!args.sys_id)
                throw new ServiceNowError('sys_id is required', 'INVALID_REQUEST');
            return await client.getRecord('sys_security_acl', args.sys_id);
        }
        case 'snow_scr_acl_add': {
            requireScripting();
            if (!args.name || !args.operation)
                throw new ServiceNowError('name and operation are required', 'INVALID_REQUEST');
            const data = {
                name: args.name,
                operation: args.operation,
                type: args.type || 'record',
                active: args.active !== false,
                admin_overrides: args.admin_overrides !== false,
            };
            if (args.script)
                data.script = args.script;
            if (args.description)
                data.description = args.description;
            const result = await client.createRecord('sys_security_acl', data);
            return { ...result, summary: `Created ACL "${args.name}" for operation "${args.operation}"` };
        }
        case 'snow_scr_acl_modify': {
            requireScripting();
            if (!args.sys_id || !args.fields)
                throw new ServiceNowError('sys_id and fields are required', 'INVALID_REQUEST');
            const result = await client.updateRecord('sys_security_acl', args.sys_id, args.fields);
            return { ...result, summary: `Updated ACL ${args.sys_id}` };
        }
        default:
            return null;
    }
}
