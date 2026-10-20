/**
 * Scripting Management tools — latest release (ES2021/ES12 support).
 * All tools require SCRIPTING_ENABLED=true (Tier 3).
 * Note: ServiceNow supports Promises, async/await, optional chaining.
 * GlideEncrypter is deprecated in recent releases.
 */
import type { ServiceNowClient } from '../servicenow/client.js';
import type { ToolDefinition } from './types.js';
export declare function scriptToolManifest(): ToolDefinition[];
export declare function dispatchScriptAction(client: ServiceNowClient, name: string, args: Record<string, any>): Promise<any>;
