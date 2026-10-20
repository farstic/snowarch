/**
 * Deployment & Artifact lifecycle tools — artifact validation, push/pull,
 * deployment tracking, rollback, and solution packaging.
 *
 * NOTE: Does NOT duplicate existing devops.ts (pipelines, deployments) or
 * updateset.ts (update set CRUD). These tools add artifact-level management
 * and deployment orchestration.
 *
 * ServiceNow tables: sys_update_xml, sys_remote_update_set, sys_app,
 *   sys_store_app, sn_devops_artifact
 */
import type { ServiceNowClient } from '../servicenow/client.js';
import type { ToolDefinition } from './types.js';
export declare function deploymentToolManifest(): ToolDefinition[];
export declare function dispatchDeploymentAction(client: ServiceNowClient, name: string, args: Record<string, any>): Promise<any>;
