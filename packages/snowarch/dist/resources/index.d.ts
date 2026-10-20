/**
 * MCP Resources — @ mentions that users can reference in conversation.
 *
 * Resources appear as @mention completions in clients that support them
 * (Claude Desktop, Cursor, etc.). Each resource returns live ServiceNow data.
 *
 * Available mentions:
 *   @my-incidents    — open incidents assigned to current user
 *   @open-changes    — change requests pending approval
 *   @sla-breaches    — records currently breaching SLA
 *   @instance:info   — current active instance metadata
 *   @ci:<name>       — CMDB CI by name
 *   @kb:<title>      — Knowledge article by title
 */
import type { ServiceNowClient } from '../servicenow/client.js';
export interface McpResource {
    uri: string;
    name: string;
    description: string;
    mimeType: string;
}
/** Static resource list exposed to AI clients. */
export declare function getResources(): McpResource[];
/** Read a resource URI and return live data from ServiceNow. */
export declare function readResource(client: ServiceNowClient, uri: string): Promise<unknown>;
