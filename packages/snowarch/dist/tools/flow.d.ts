/**
 * Flow Designer tools — list, inspect, trigger, and monitor flows and subflows.
 * Read tools: Tier 0. Trigger/create tools: Tier 1 (WRITE_ENABLED=true).
 */
import type { ServiceNowClient } from '../servicenow/client.js';
import type { ToolDefinition } from './types.js';
export declare function flowToolManifest(): ToolDefinition[];
export declare function dispatchFlowAction(client: ServiceNowClient, name: string, args: Record<string, any>): Promise<any>;
