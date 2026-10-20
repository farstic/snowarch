/**
 * Agile/Scrum tools.
 * Read tools: Tier 0. Write tools: Tier 1 (WRITE_ENABLED=true).
 * Tables: rm_story, rm_epic, rm_scrum_task
 */
import type { ServiceNowClient } from '../servicenow/client.js';
import type { ToolDefinition } from './types.js';
export declare function agileToolManifest(): ToolDefinition[];
export declare function dispatchAgileAction(client: ServiceNowClient, name: string, args: Record<string, any>): Promise<any>;
