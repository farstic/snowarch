/**
 * HR Service Delivery (HRSD) tools — full lifecycle for HR cases, services, and profiles.
 * Read tools: Tier 0. Write tools: Tier 1 (WRITE_ENABLED=true).
 */
import type { ServiceNowClient } from '../servicenow/client.js';
import type { ToolDefinition } from './types.js';
export declare function hrsdToolManifest(): ToolDefinition[];
export declare function dispatchHrsdAction(client: ServiceNowClient, name: string, args: Record<string, any>): Promise<any>;
