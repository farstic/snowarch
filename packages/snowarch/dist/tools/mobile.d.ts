/**
 * ServiceNow Mobile tools — mobile app configuration, layout management,
 * push notifications, offline sync, and mobile analytics.
 *
 * ServiceNow tables: sys_sg_mobile_app_config, sys_sg_mobile_layout,
 *   sys_sg_mobile_applet, sys_sg_push_notification, sys_sg_offline_sync
 */
import type { ServiceNowClient } from '../servicenow/client.js';
import type { ToolDefinition } from './types.js';
export declare function mobileToolManifest(): ToolDefinition[];
export declare function dispatchMobileAction(client: ServiceNowClient, name: string, args: Record<string, any>): Promise<any>;
