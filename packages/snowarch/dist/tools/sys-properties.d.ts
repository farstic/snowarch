/**
 * System Properties tools — read and manage ServiceNow sys_properties records.
 *
 * Tier 0 (Read): list, get, search, bulk_get, categories
 * Tier 1 (Write): set, delete, bulk_set, import
 * Tier 0 (Audit): history (read-only)
 *
 * ServiceNow table: sys_properties, sys_audit_sys_properties
 */
import type { ServiceNowClient } from '../servicenow/client.js';
import type { ToolDefinition } from './types.js';
export declare function sysPropertiesToolManifest(): ToolDefinition[];
export declare function dispatchSysPropertiesAction(client: ServiceNowClient, name: string, args: Record<string, any>): Promise<any>;
