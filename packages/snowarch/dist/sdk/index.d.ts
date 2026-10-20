/**
 * snowarch SDK — the client re-export.
 *
 * The only supported programmatic entry point: the ServiceNow client, its error type
 * and the types that describe a query. Everything else this module used to re-export
 * — the direct-execution engine, the LLM client, the prompt catalogue and the report
 * generator — went with D-03 items 3 and 6, and re-exporting a tool catalogue from
 * here would make a second, unversioned way to invoke tools alongside MCP.
 *
 * Import it as `@farstic/snowarch/sdk`; the client alone is `@farstic/snowarch/client`.
 */
export { ServiceNowClient } from '../servicenow/client.js';
export { ServiceNowError } from '../utils/errors.js';
export type { AuthMode, ServiceNowConfig, QueryRecordsParams, QueryRecordsResponse, ServiceNowRecord, ServiceNowReference, ServiceNowApiResponse, } from '../servicenow/types.js';
