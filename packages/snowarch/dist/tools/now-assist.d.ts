/**
 * Now Assist & ServiceNow AI tools — latest release.
 * All tools require NOW_ASSIST_ENABLED=true (Tier AI).
 *
 * ServiceNow APIs used:
 *   - Now Assist Skills: POST /api/sn_assist/skill/invoke
 *   - Agentic Playbooks:  POST /api/sn_assist/playbook/trigger
 *   - AI Search:          GET  /api/now/ai_search/search
 *   - Predictive Intel.:  POST /api/sn_ml/solution/{id}/predict (LightGBM in latest release)
 *   - NLQ:               POST /api/sn_nl_text_to_value/text_query
 *   - Virtual Agent:      GET  /api/sn_cs/topic               (streaming in latest release)
 *   - MS Copilot 365:     GET  /api/sn_assist/copilot/topics
 */
import type { ServiceNowClient } from '../servicenow/client.js';
import type { ToolDefinition } from './types.js';
export declare function nowAssistToolManifest(): ToolDefinition[];
export declare function dispatchNowAssistAction(client: ServiceNowClient, name: string, args: Record<string, any>): Promise<any>;
