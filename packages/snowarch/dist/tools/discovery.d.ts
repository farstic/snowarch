/**
 * Table schema discovery: what are this table's columns?
 *
 * It used to do more than that. `snow_disco_table_discover` MINTED tools — after discovering
 * `u_widget` the session gained `dynamic_query_u_widget`, `dynamic_create_u_widget` and three
 * more, dispatched by `dispatchDynamicAction` and named by `buildToolNames`. ARC-04-S08 removed
 * all of it, because a catalogue that depends on what was called earlier in the session cannot
 * be described by any contract, cannot be cached by any client, and — the part that matters for
 * the gates — mints WRITE tools whose gating lives in a code path no parity test walks, since
 * the names do not exist until runtime.
 *
 * What replaces them is not smaller: the columns come back as DATA, and the caller uses
 * `snow_core_records_query`, `snow_core_record_add` and their siblings, which are declared,
 * gated, counted and in the contract. Same operations, on tools someone can audit.
 */
import type { ServiceNowClient } from '../servicenow/client.js';
import type { ToolDefinition } from './types.js';
export declare function discoveryToolManifest(): ToolDefinition[];
export declare function dispatchDiscoveryAction(client: ServiceNowClient, name: string, args: Record<string, any>): Promise<any>;
