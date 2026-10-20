import { ServiceNowError } from '../utils/errors.js';
import { requireWrite } from '../utils/permissions.js';
export function knowledgeToolManifest() {
    return [
        {
            name: 'snow_kb_knowledge_bases_index',
            description: 'List all knowledge bases available in the instance',
            inputSchema: {
                type: 'object',
                properties: {
                    limit: { type: 'number', description: 'Max results (default: 20)' },
                },
                required: [],
            },
            gate: 'none',
            mutates: false,
        },
        {
            name: 'snow_kb_knowledge_query',
            description: 'Search knowledge base articles by keyword',
            inputSchema: {
                type: 'object',
                properties: {
                    query: { type: 'string', description: 'Search keywords or phrase' },
                    limit: { type: 'number', description: 'Max articles (default: 10)' },
                    knowledge_base: { type: 'string', description: 'Optional: filter by knowledge base sys_id or name' },
                },
                required: ['query'],
            },
            gate: 'none',
            mutates: false,
        },
        {
            name: 'snow_kb_knowledge_article_read',
            description: 'Get the full content of a knowledge article by number (KB...) or sys_id',
            inputSchema: {
                type: 'object',
                properties: {
                    number_or_sysid: { type: 'string', description: 'Article number (KB...) or sys_id' },
                },
                required: ['number_or_sysid'],
            },
            gate: 'none',
            mutates: false,
        },
        {
            name: 'snow_kb_knowledge_article_add',
            description: 'Create a new knowledge article (requires WRITE_ENABLED=true)',
            inputSchema: {
                type: 'object',
                properties: {
                    short_description: { type: 'string', description: 'Article title' },
                    text: { type: 'string', description: 'Article body (HTML or plain text)' },
                    knowledge_base_sys_id: { type: 'string', description: 'sys_id of the target knowledge base' },
                    category: { type: 'string', description: 'Article category' },
                },
                required: ['short_description', 'text', 'knowledge_base_sys_id'],
            },
            gate: 'write',
            mutates: true,
            table: 'kb_knowledge',
        },
        {
            name: 'snow_kb_knowledge_article_modify',
            description: 'Update a knowledge article (requires WRITE_ENABLED=true)',
            inputSchema: {
                type: 'object',
                properties: {
                    sys_id: { type: 'string', description: 'System ID of the article' },
                    fields: { type: 'object', description: 'Key-value pairs to update (e.g., {"text": "...updated content..."})' },
                },
                required: ['sys_id', 'fields'],
            },
            gate: 'write',
            mutates: true,
            table: 'kb_knowledge',
        },
        {
            name: 'snow_kb_knowledge_article_publish',
            description: 'Publish a draft knowledge article (requires WRITE_ENABLED=true)',
            inputSchema: {
                type: 'object',
                properties: {
                    sys_id: { type: 'string', description: 'System ID of the article to publish' },
                },
                required: ['sys_id'],
            },
            gate: 'write',
            mutates: true,
            table: 'kb_knowledge',
        },
        {
            name: 'snow_kb_knowledge_article_retire',
            description: '[Write] Retire a knowledge article (mark as outdated)',
            inputSchema: {
                type: 'object',
                properties: {
                    article_id: { type: 'string', description: 'Article number (KB...) or sys_id' },
                },
                required: ['article_id'],
            },
            gate: 'write',
            mutates: true,
            table: 'kb_knowledge',
        },
    ];
}
export async function dispatchKnowledgeAction(client, name, args) {
    switch (name) {
        case 'snow_kb_knowledge_bases_index': {
            const resp = await client.queryRecords({ table: 'kb_knowledge_base', query: 'active=true', limit: args.limit || 20, fields: 'sys_id,title,description,owner,workflow_state' });
            return { count: resp.count, knowledge_bases: resp.records };
        }
        case 'snow_kb_knowledge_query': {
            if (!args.query)
                throw new ServiceNowError('query is required', 'INVALID_REQUEST');
            let query = `short_descriptionLIKE${args.query}^ORtextLIKE${args.query}^workflow_state=published`;
            if (args.knowledge_base)
                query += `^kb_knowledge_base.title=${args.knowledge_base}^ORkb_knowledge_base=${args.knowledge_base}`;
            const resp = await client.queryRecords({ table: 'kb_knowledge', query, limit: args.limit || 10, fields: 'sys_id,number,short_description,workflow_state,kb_knowledge_base,view_count' });
            return { count: resp.count, articles: resp.records };
        }
        case 'snow_kb_knowledge_article_read': {
            if (!args.number_or_sysid)
                throw new ServiceNowError('number_or_sysid is required', 'INVALID_REQUEST');
            if (/^[0-9a-f]{32}$/i.test(args.number_or_sysid)) {
                return await client.getRecord('kb_knowledge', args.number_or_sysid);
            }
            const resp = await client.queryRecords({ table: 'kb_knowledge', query: `number=${args.number_or_sysid}^ORsys_id=${args.number_or_sysid}`, limit: 1 });
            if (resp.count === 0)
                throw new ServiceNowError(`Article not found: ${args.number_or_sysid}`, 'NOT_FOUND');
            return resp.records[0];
        }
        case 'snow_kb_knowledge_article_add': {
            requireWrite();
            if (!args.short_description || !args.text || !args.knowledge_base_sys_id)
                throw new ServiceNowError('short_description, text, and knowledge_base_sys_id are required', 'INVALID_REQUEST');
            const result = await client.createRecord('kb_knowledge', {
                short_description: args.short_description,
                text: args.text,
                kb_knowledge_base: args.knowledge_base_sys_id,
                category: args.category,
                workflow_state: 'draft',
            });
            return { ...result, summary: `Created knowledge article ${result.number || result.sys_id}` };
        }
        case 'snow_kb_knowledge_article_modify': {
            requireWrite();
            if (!args.sys_id || !args.fields)
                throw new ServiceNowError('sys_id and fields are required', 'INVALID_REQUEST');
            const result = await client.updateRecord('kb_knowledge', args.sys_id, args.fields);
            return { ...result, summary: `Updated knowledge article ${args.sys_id}` };
        }
        case 'snow_kb_knowledge_article_publish': {
            requireWrite();
            if (!args.sys_id)
                throw new ServiceNowError('sys_id is required', 'INVALID_REQUEST');
            const result = await client.updateRecord('kb_knowledge', args.sys_id, { workflow_state: 'published' });
            return { ...result, summary: `Published knowledge article ${args.sys_id}` };
        }
        case 'snow_kb_knowledge_article_retire': {
            requireWrite();
            if (!args.article_id)
                throw new ServiceNowError('article_id is required', 'INVALID_REQUEST');
            let sysId = args.article_id;
            if (!/^[0-9a-f]{32}$/i.test(args.article_id)) {
                const resp = await client.queryRecords({ table: 'kb_knowledge', query: `number=${args.article_id}^ORsys_id=${args.article_id}`, limit: 1 });
                if (resp.count === 0)
                    throw new ServiceNowError(`Article not found: ${args.article_id}`, 'NOT_FOUND');
                sysId = resp.records[0].sys_id;
            }
            const result = await client.updateRecord('kb_knowledge', sysId, { workflow_state: 'retired' });
            return { ...result, summary: `Retired knowledge article ${args.article_id}` };
        }
        default:
            return null;
    }
}
