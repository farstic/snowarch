/**
 * Core platform tools – the original 15 tools migrated from tools/index.ts.
 * These are always available (Tier 0).
 */
import type { ServiceNowClient } from '../servicenow/client.js';
import type { ToolDefinition } from './types.js';
export declare function coreToolManifest(): ToolDefinition[];
export declare function dispatchCoreAction(client: ServiceNowClient, name: string, args: Record<string, any>): Promise<any>;
