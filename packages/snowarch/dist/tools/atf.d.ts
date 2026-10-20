/**
 * ATF (Automated Test Framework) tools — latest release.
 * Read tools: Tier 0. Execution tools require ATF_ENABLED=true, and run suites through the CI/CD API
 * (ARC-09-C94, `atf-cicd.ts`).
 * Latest release added: Failure Insight (get_atf_failure_insight) showing metadata diffs.
 */
import type { ServiceNowClient } from '../servicenow/client.js';
import type { ToolDefinition } from './types.js';
export declare function atfToolManifest(): ToolDefinition[];
export declare function dispatchAtfAction(client: ServiceNowClient, name: string, args: Record<string, any>): Promise<any>;
