/**
 * Tool Router — aggregates all domain tool modules and implements the
 * MCP_TOOL_PACKAGE role-based packaging system.
 *
 * Tool packages (set via MCP_TOOL_PACKAGE env var):
 *   full (default), service_desk, change_coordinator, knowledge_author,
 *   catalog_builder, system_administrator, platform_developer, itom_engineer,
 *   agile_manager, ai_developer, portal_developer, integration_engineer
 */
import type { ServiceNowClient } from '../servicenow/client.js';
import type { ToolDefinition } from './types.js';
export declare const ROLE_BUNDLE_MAP: Record<string, string[]>;
/**
 * The catalogue. Computed once at module load and returned as the SAME array every time.
 *
 * It used to append `schemaCache.getGeneratedTools()` — tools invented at runtime from a
 * discovered table's columns. That made `tools/list` answer differently depending on what had
 * been called earlier in the session: a client that cached the list held a stale one, and a
 * tool could appear that no contract, no test and no documentation had ever seen. The
 * contract (ARC-04-S06) cannot describe a catalogue that changes shape, so the catalogue does
 * not change shape. `snow_disco_table_discover` still discovers columns; it just returns them
 * as data instead of minting tools.
 */
/**
 * The role-bundle filter, exported as a pure function of (tools, package name).
 *
 * Separated from the constant below so the bundles can be tested without a test setting an
 * environment variable and calling `collectToolCatalog()` again — which is what the suite used
 * to do, and which now proves nothing, because re-reading the environment is exactly the
 * behaviour that was removed.
 */
export declare function selectPackage(all: ToolDefinition[], packageName: string): ToolDefinition[];
export declare function collectToolCatalog(): ToolDefinition[];
/**
 * Every tool invocation passes through here, so this is where a write is checked against what the
 * platform STORED (ARC-09-C93, `src/servicenow/stored-values.ts`).
 *
 * The client is wrapped for this one invocation. The wrapper only RECORDS a cut it sees (no I/O), and
 * once the tool has returned — or thrown — `settle` reads the dictionary for the cut columns and the
 * warnings go onto the result as `warnings`, or onto the error of a tool that failed after it wrote.
 * A tool needs no edit for its writes to be covered (createRecord, updateRecord, the Batch API,
 * attachments, change requests, a `withUser` copy); what the wrapper cannot compare is listed in the
 * module header. The instance-free core
 * tools arrive with no client and are dispatched as they were. An invocation that arrives holding an
 * already wrapped client (an orchestration step) joins the outer one, which reports for all of them.
 */
export declare function routeToolInvocation(client: ServiceNowClient, name: string, args: Record<string, unknown>): Promise<any>;
