/**
 * Workspace & UI Builder tools — next-gen configurable workspaces, UIB pages,
 * components, data brokers, and UX framework configuration.
 *
 * NOTE: Does NOT duplicate existing portal.ts tools (list_portals, create_portal,
 * list_portal_widgets, etc.). These tools focus on the newer UI Builder (UIB) and
 * Configurable Workspace frameworks.
 *
 * ServiceNow tables: sys_ux_page, sys_ux_page_registry, sys_ux_macroponent,
 *   sys_ux_data_broker, sys_ux_client_script, sys_ux_client_state_parameter,
 *   sys_aw_workspace, sys_aw_list, sys_aw_form, aw_agent_workspace
 */
import type { ServiceNowClient } from '../servicenow/client.js';
import type { ToolDefinition } from './types.js';
export declare function workspaceToolManifest(): ToolDefinition[];
export declare function dispatchWorkspaceAction(client: ServiceNowClient, name: string, args: Record<string, any>): Promise<any>;
