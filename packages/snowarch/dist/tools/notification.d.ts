/**
 * Notification, Email, and Attachment tools.
 * Read tools: Tier 0. Write tools: Tier 1 (WRITE_ENABLED=true).
 * Inspired by servicenow-helper's direct script deployment and snow-flow's artifact management.
 */
import type { ServiceNowClient } from '../servicenow/client.js';
import type { ToolDefinition } from './types.js';
export declare function notificationToolManifest(): ToolDefinition[];
export declare function dispatchNotificationAction(client: ServiceNowClient, name: string, args: Record<string, any>): Promise<any>;
