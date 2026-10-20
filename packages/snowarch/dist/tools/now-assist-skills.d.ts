/**
 * Now Assist Skills management tools — create, list, get, and test Now Assist skills.
 * All tools require NOW_ASSIST_ENABLED=true (Tier AI).
 * Write tools additionally require WRITE_ENABLED=true (Tier 1).
 */
import type { ServiceNowClient } from '../servicenow/client.js';
import type { ToolDefinition } from './types.js';
export declare function nowAssistSkillsToolManifest(): ToolDefinition[];
export declare function dispatchNowAssistSkillsAction(client: ServiceNowClient, name: string, args: Record<string, any>): Promise<any>;
