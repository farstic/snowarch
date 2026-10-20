/**
 * Virtual Agent (VA) creation and management tools.
 *
 * Extends the read-only VA listing in now-assist.ts with full topic/conversation authoring.
 *
 * Tier 0 (Read):  list_va_topics (already in now-assist), get_va_conversation, discover_va_topics
 * Tier 1 (Write): create_va_topic, update_va_topic
 * Tier AI:        send_va_message (requires NOW_ASSIST_ENABLED)
 *
 * ServiceNow tables: sys_cs_topic, sys_cs_conversation, sys_cs_topic_block
 * API: /api/sn_cs/topic, /api/sn_cs/bot/integration
 */
import type { ServiceNowClient } from '../servicenow/client.js';
import type { ToolDefinition } from './types.js';
export declare function vaToolManifest(): ToolDefinition[];
export declare function dispatchVaAction(client: ServiceNowClient, name: string, args: Record<string, any>): Promise<any>;
