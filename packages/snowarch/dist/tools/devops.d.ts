/**
 * DevOps integration tools — CI/CD pipelines, deployment tracking, and velocity metrics.
 *
 * Tier 0 (Read):  list_devops_pipelines, get_devops_pipeline, list_deployments,
 *                  get_deployment, get_devops_insights
 * Tier 1 (Write): create_devops_change, track_deployment
 *
 * ServiceNow tables: sn_devops_pipeline, sn_devops_artifact, sn_devops_deploy_task,
 *                    sn_devops_change_request
 */
import type { ServiceNowClient } from '../servicenow/client.js';
import type { ToolDefinition } from './types.js';
export declare function devopsToolManifest(): ToolDefinition[];
export declare function dispatchDevopsAction(client: ServiceNowClient, name: string, args: Record<string, any>): Promise<any>;
