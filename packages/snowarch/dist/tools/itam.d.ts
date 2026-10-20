/**
 * IT Asset Management (ITAM) tools — hardware/software asset lifecycle.
 *
 * Tier 0 (Read):  list_assets, get_asset, list_software_licenses, get_license_compliance,
 *                  list_asset_contracts
 * Tier 1 (Write): create_asset, update_asset, retire_asset
 *
 * ServiceNow tables: alm_asset, alm_hardware, alm_license, ast_contract
 */
import type { ServiceNowClient } from '../servicenow/client.js';
import type { ToolDefinition } from './types.js';
export declare function itamToolManifest(): ToolDefinition[];
export declare function dispatchItamAction(client: ServiceNowClient, name: string, args: Record<string, any>): Promise<any>;
