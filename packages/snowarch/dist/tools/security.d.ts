/**
 * Security Operations (SecOps) tools — security incidents, vulnerabilities, and GRC.
 * Read tools: Tier 0. Write tools: Tier 1 (WRITE_ENABLED=true).
 */
import type { ServiceNowClient } from '../servicenow/client.js';
import type { ToolDefinition } from './types.js';
export declare function securityToolManifest(): ToolDefinition[];
export declare function dispatchSecurityAction(client: ServiceNowClient, name: string, args: Record<string, any>): Promise<any>;
