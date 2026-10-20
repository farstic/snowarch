/**
 * Update Set management tools — full lifecycle for ServiceNow Update Sets.
 *
 * Goes beyond the basic changeset tools in script.ts to provide:
 * - Create / switch / preview / complete / export
 * - Auto-creation guard (ensure active update set exists)
 * - Batch artifact registration
 *
 * Tier 0 (Read):  get_current_update_set, list_update_sets, preview_update_set
 * Tier 3 (Script): create_update_set, switch_update_set, complete_update_set,
 *                   export_update_set, retrieve_remote_update_set
 *
 * ServiceNow tables: sys_update_set, sys_update_xml, sys_remote_update_set
 */
import type { ServiceNowClient } from '../servicenow/client.js';
import type { ToolDefinition } from './types.js';
export declare function updateSetToolManifest(): ToolDefinition[];
export declare function dispatchUpdateSetAction(client: ServiceNowClient, name: string, args: Record<string, any>): Promise<any>;
