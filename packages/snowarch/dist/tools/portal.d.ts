/**
 * Service Portal & UI Builder tools — manage portals, pages, widgets, and themes.
 * Read tools: Tier 0. Write/deploy tools: Tier 1 (WRITE_ENABLED=true).
 * Inspired by snow-flow's "Deployment" category tools.
 */
import type { ServiceNowClient } from '../servicenow/client.js';
import type { ToolDefinition } from './types.js';
export declare function portalToolManifest(): ToolDefinition[];
export declare function dispatchPortalAction(client: ServiceNowClient, name: string, args: Record<string, any>): Promise<any>;
