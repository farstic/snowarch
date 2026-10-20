import type { ServiceNowClient } from '../servicenow/client.js';
import type { ToolDefinition } from './types.js';
export declare function fluentToolManifest(): ToolDefinition[];
export declare function dispatchFluentAction(client: ServiceNowClient, name: string, args: Record<string, any>): Promise<any>;
