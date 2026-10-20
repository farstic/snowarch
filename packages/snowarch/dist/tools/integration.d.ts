/**
 * Integration tools — REST Messages, Transform Maps, Import Sets, and Event Registry.
 * Read tools: Tier 0. Write tools: Tier 1 (WRITE_ENABLED=true).
 * Inspired by snow-flow's "Automation/Integration" category.
 */
import type { ServiceNowClient } from '../servicenow/client.js';
import type { ToolDefinition } from './types.js';
export declare function integrationToolManifest(): ToolDefinition[];
export declare function dispatchIntegrationAction(client: ServiceNowClient, name: string, args: Record<string, any>): Promise<any>;
