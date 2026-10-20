/**
 * Machine Learning tools — anomaly detection, change risk prediction,
 * incident forecasting, model training, NLU analysis, process optimization.
 *
 * NOTE: Does NOT duplicate existing Now Assist tools (categorize_incident,
 * suggest_resolution, ai_search, get_pi_models). These ML tools focus on
 * ServiceNow Predictive Intelligence and ML Workbench capabilities.
 *
 * ServiceNow tables: ml_solution, ml_solution_version, sys_cs_conversation
 */
import type { ServiceNowClient } from '../servicenow/client.js';
import type { ToolDefinition } from './types.js';
export declare function mlToolManifest(): ToolDefinition[];
export declare function dispatchMlAction(client: ServiceNowClient, name: string, args: Record<string, any>): Promise<any>;
