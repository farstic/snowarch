/**
 * CMDB Reconciliation tools — find duplicates, orphans, stale CIs, and reconcile.
 * Read tools: Tier 0. Reconcile action: Tier 2 (CMDB_WRITE_ENABLED=true).
 */
import type { ServiceNowClient } from '../servicenow/client.js';
import type { ToolDefinition } from './types.js';
export declare function cmdbReconciliationToolManifest(): ToolDefinition[];
export declare function dispatchCmdbReconciliationAction(client: ServiceNowClient, name: string, args: Record<string, any>): Promise<any>;
