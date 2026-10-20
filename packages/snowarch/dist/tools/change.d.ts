/**
 * Change Request Management tools.
 * Read tools: Tier 0. Write tools: Tier 1 (WRITE_ENABLED=true).
 */
import type { ServiceNowClient } from '../servicenow/client.js';
import type { ToolDefinition } from './types.js';
export declare function changeToolManifest(): ToolDefinition[];
export declare function dispatchChangeAction(client: ServiceNowClient, name: string, args: Record<string, any>): Promise<any>;
