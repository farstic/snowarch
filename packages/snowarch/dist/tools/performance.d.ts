/**
 * Performance Analytics & Dashboards tools — PA indicators, scorecards, KPIs, and dashboards.
 * All read-only tools: Tier 0.
 * Inspired by snow-flow's "Analysis" category: KPI management, Performance Analytics, dashboards.
 */
import type { ServiceNowClient } from '../servicenow/client.js';
import type { ToolDefinition } from './types.js';
export declare function performanceToolManifest(): ToolDefinition[];
export declare function dispatchPerformanceAction(client: ServiceNowClient, name: string, args: Record<string, any>): Promise<any>;
