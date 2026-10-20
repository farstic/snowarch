/**
 * Scoped Application (App Studio) tools — manage ServiceNow scoped apps.
 * Read tools: Tier 0. Write/create tools: Tier 1 (WRITE_ENABLED=true).
 * ServiceNow table: sys_app (scoped applications), sys_scope (application scopes).
 */
import type { ServiceNowClient } from '../servicenow/client.js';
import type { ToolDefinition } from './types.js';
export declare function appStudioToolManifest(): ToolDefinition[];
export declare function dispatchAppStudioAction(client: ServiceNowClient, name: string, args: Record<string, any>): Promise<any>;
