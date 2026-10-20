import { ServiceNowError } from '../utils/errors.js';
import { requireNowAssist, requireWrite } from '../utils/permissions.js';
export function nowAssistSkillsToolManifest() {
    return [
        {
            name: 'snow_nas_now_assist_skill_add',
            description: 'Create a Now Assist skill definition (requires NOW_ASSIST_ENABLED + WRITE_ENABLED)',
            inputSchema: {
                type: 'object',
                properties: {
                    name: { type: 'string', description: 'Skill name' },
                    description: { type: 'string', description: 'Skill description' },
                    input_schema: { type: 'string', description: 'JSON schema string defining the skill input' },
                    output_schema: { type: 'string', description: 'JSON schema string defining the skill output' },
                    prompt_template: { type: 'string', description: 'Prompt template for the skill' },
                    model: { type: 'string', description: 'Optional model identifier to use for this skill' },
                },
                required: ['name', 'description', 'input_schema', 'output_schema', 'prompt_template'],
            },
            gate: 'now_assist',
            mutates: true,
            alsoRequires: 'write',
        },
        {
            name: 'snow_nas_now_assist_skills_index',
            description: 'List Now Assist skill definitions (requires NOW_ASSIST_ENABLED)',
            inputSchema: {
                type: 'object',
                properties: {
                    active: { type: 'boolean', description: 'Filter by active status' },
                    limit: { type: 'number', description: 'Max records to return (default 25)' },
                    query: { type: 'string', description: 'Additional encoded query string' },
                },
                required: [],
            },
            gate: 'now_assist',
            mutates: false,
        },
        {
            name: 'snow_nas_now_assist_skill_read',
            description: 'Get a single Now Assist skill definition by sys_id (requires NOW_ASSIST_ENABLED)',
            inputSchema: {
                type: 'object',
                properties: {
                    sys_id: { type: 'string', description: 'System ID of the skill' },
                },
                required: ['sys_id'],
            },
            gate: 'now_assist',
            mutates: false,
        },
        {
            name: 'snow_nas_now_assist_skill_test',
            description: 'Invoke a Now Assist skill with test input to verify behavior (requires NOW_ASSIST_ENABLED)',
            inputSchema: {
                type: 'object',
                properties: {
                    skill_sys_id: { type: 'string', description: 'System ID of the skill to test' },
                    test_input: { type: 'object', description: 'Test input payload to send to the skill' },
                },
                required: ['skill_sys_id', 'test_input'],
            },
            gate: 'now_assist',
            mutates: false,
        },
    ];
}
const SKILL_TOOL_NAMES = new Set([
    'snow_nas_now_assist_skill_add', 'snow_nas_now_assist_skills_index', 'snow_nas_now_assist_skill_read', 'snow_nas_now_assist_skill_test',
]);
export async function dispatchNowAssistSkillsAction(client, name, args) {
    if (!SKILL_TOOL_NAMES.has(name))
        return null;
    requireNowAssist();
    switch (name) {
        case 'snow_nas_now_assist_skill_add': {
            requireWrite();
            if (!args.name)
                throw new ServiceNowError('name is required', 'INVALID_REQUEST');
            if (!args.description)
                throw new ServiceNowError('description is required', 'INVALID_REQUEST');
            if (!args.input_schema)
                throw new ServiceNowError('input_schema is required', 'INVALID_REQUEST');
            if (!args.output_schema)
                throw new ServiceNowError('output_schema is required', 'INVALID_REQUEST');
            if (!args.prompt_template)
                throw new ServiceNowError('prompt_template is required', 'INVALID_REQUEST');
            const data = {
                name: args.name,
                description: args.description,
                input_schema: args.input_schema,
                output_schema: args.output_schema,
                prompt_template: args.prompt_template,
                active: true,
            };
            if (args.model)
                data.model = args.model;
            const record = await client.createRecord('sn_now_assist_skill', data);
            return { message: 'Now Assist skill created', skill: record };
        }
        case 'snow_nas_now_assist_skills_index': {
            const parts = [];
            if (args.active !== undefined)
                parts.push(`active=${args.active}`);
            if (args.query)
                parts.push(args.query);
            const query = parts.length > 0 ? parts.join('^') : undefined;
            const resp = await client.queryRecords({
                table: 'sn_now_assist_skill',
                query,
                limit: args.limit || 25,
                fields: 'sys_id,name,description,active,model,sys_updated_on',
            });
            return { count: resp.count, skills: resp.records };
        }
        case 'snow_nas_now_assist_skill_read': {
            if (!args.sys_id)
                throw new ServiceNowError('sys_id is required', 'INVALID_REQUEST');
            const record = await client.getRecord('sn_now_assist_skill', args.sys_id);
            return { skill: record };
        }
        case 'snow_nas_now_assist_skill_test': {
            if (!args.skill_sys_id)
                throw new ServiceNowError('skill_sys_id is required', 'INVALID_REQUEST');
            if (!args.test_input)
                throw new ServiceNowError('test_input is required', 'INVALID_REQUEST');
            const result = await client.callNowAssist('/api/sn_assist/skill/invoke', {
                skill: args.skill_sys_id,
                input: args.test_input,
            });
            return { skill_sys_id: args.skill_sys_id, test_input: args.test_input, result };
        }
        default:
            return null;
    }
}
