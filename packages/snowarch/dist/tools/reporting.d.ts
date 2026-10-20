/**
 * Reporting & Analytics tools — ServiceNow Reporting API + branded report generation.
 * All tools are Tier 0 (read-only) unless noted.
 * ServiceNow API: GET /api/now/reporting, /api/now/stats/{table}, /api/now/pa/widget/{sys_id}
 */
import type { ServiceNowClient } from '../servicenow/client.js';
import type { ToolDefinition } from './types.js';
export declare function reportingToolManifest(): ToolDefinition[];
export declare function dispatchReportingAction(client: ServiceNowClient, name: string, args: Record<string, any>): Promise<any>;
