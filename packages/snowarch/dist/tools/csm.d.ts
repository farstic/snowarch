/**
 * Customer Service Management (CSM) tools — cases, consumers, accounts, and contacts.
 * Read tools: Tier 0. Write tools: Tier 1 (WRITE_ENABLED=true).
 */
import type { ServiceNowClient } from '../servicenow/client.js';
import type { ToolDefinition } from './types.js';
export declare function csmToolManifest(): ToolDefinition[];
export declare function dispatchCsmAction(client: ServiceNowClient, name: string, args: Record<string, any>): Promise<any>;
