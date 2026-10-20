/**
 * Orchestration tools — create, list, and execute multi-step playbooks.
 * Playbooks chain tool calls with conditional logic and error handling.
 * Requires NOW_ASSIST_ENABLED (Tier AI). Write tools also require WRITE_ENABLED.
 */
import type { ServiceNowClient } from '../servicenow/client.js';
import type { ToolDefinition } from './types.js';
export declare function orchestrationToolManifest(): ToolDefinition[];
export declare function dispatchOrchestrationAction(client: ServiceNowClient, name: string, args: Record<string, any>): Promise<any>;
