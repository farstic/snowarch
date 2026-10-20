import type { CicdResult, ServiceNowConfig, QueryRecordsParams, QueryRecordsResponse, ServiceNowRecord } from './types.js';
/** Validate and sanitize ServiceNow encoded query strings */
export declare function validateQuery(query: string): string;
/**
 * ARC-09-C125 — a query's page size: the instance's `maxRecords`, this when the store sets none, and never more
 * than `MAX_PAGE`. Exported because `snow_core_records_query`'s description states both, from here, so the
 * advertised default cannot drift from the one sent again (it said "default: 10" while this sent 100).
 */
export declare const DEFAULT_MAX_RECORDS = 100;
export declare const MAX_PAGE = 1000;
export declare class ServiceNowClient {
    private baseUrl;
    private authMethod;
    private authMode;
    private oauthConfig?;
    private basicConfig?;
    private maxRetries;
    private retryDelayMs;
    private requestTimeoutMs;
    /** For impersonation mode: user sys_id to pass in X-Sn-Impersonate */
    private impersonateUserSysId?;
    /** For per-user mode: pre-loaded token overrides service-account auth */
    private perUserBearerToken?;
    private accessToken?;
    private tokenExpiry?;
    constructor(config: ServiceNowConfig);
    /**
     * Return a copy of this client configured to run as a specific user.
     * Used for per-request user context switching without mutating the shared client.
     */
    withUser(options: {
        sysId?: string;
        bearerToken?: string;
    }): ServiceNowClient;
    /**
     * Authenticate with ServiceNow using OAuth or Basic Auth
     */
    private authenticate;
    /**
     * Get authorization header for requests.
     * Per-user mode returns the user's own Bearer token directly.
     * Impersonation and service-account modes use the configured service account.
     */
    private getAuthHeader;
    /**
     * Returns the X-Sn-Impersonate header value if impersonation mode is active.
     * ServiceNow executes the request in the context of the named user's roles/ACLs.
     */
    private getImpersonateHeader;
    /**
     * Make HTTP request with retry logic
     *
     * `requestedRetries` can only LOWER the client's own policy (`this.maxRetries`). It is reachable
     * from a tool argument (`QueryRecordsParams.retries`), so a value that raised it, or that was not
     * a count at all (`NaN`, `Infinity`, a string), would let a caller pick how many times this
     * client hammers an instance. Anything that is not a non-negative integer is ignored.
     */
    private request;
    /**
     * Query records from a ServiceNow table
     */
    queryRecords(params: QueryRecordsParams): Promise<QueryRecordsResponse>;
    /**
     * Get table schema/structure
     */
    getTableSchema(tableName: string): Promise<any>;
    /**
     * Get a single record by sys_id
     */
    /**
     * The user name this client authenticates as.
     *
     * `snow_us_capture_target_set` needs it to resolve `sys_user` and to scope
     * `snow_us_active_update_set_ensure` to the caller's own in-progress update sets. It is
     * the USER NAME, never the password, and no tool puts it in a response — a caller who can
     * see the answer can already see the instance, but a response is also a log line.
     */
    getAuthUsername(): string | undefined;
    /**
     * The encoded query, with this client's own account name replaced.
     *
     * `snow_us_active_update_set_ensure` builds `…^sys_created_by=<username>` (ARC-04-S07, so
     * that it returns only the caller's update sets), and at debug level that string went
     * straight to stderr. ARC-04-S10's no-secrets sweep caught it: the fixture username appeared
     * in the captured log.
     *
     * Replacing the known account name rather than pattern-matching `sys_created_by=`: the value
     * is the thing that must not be printed, and it can arrive under any field. This does not
     * make queries free of personal data in general — a caller's own `caller_id=` filter still
     * prints, which is documented — it removes the ONE value the server itself put there.
     */
    private maskQuery;
    getRecord(table: string, sysId: string, fields?: string): Promise<ServiceNowRecord>;
    /**
     * Get user details by email or username
     */
    getUser(userIdentifier: string): Promise<ServiceNowRecord>;
    /**
     * Get group details by name or sys_id
     */
    getGroup(groupIdentifier: string): Promise<ServiceNowRecord>;
    /**
     * Search CMDB configuration items
     */
    searchCmdbCi(query?: string, limit?: number): Promise<QueryRecordsResponse>;
    /**
     * Get a specific CMDB configuration item
     */
    getCmdbCi(ciSysId: string, fields?: string): Promise<ServiceNowRecord>;
    /**
     * List relationships for a CI
     */
    listRelationships(ciSysId: string): Promise<any>;
    /**
     * List discovery schedules
     */
    listDiscoverySchedules(activeOnly?: boolean): Promise<any>;
    /**
     * List MID servers
     */
    listMidServers(activeOnly?: boolean): Promise<any>;
    /**
     * List active events
     */
    listActiveEvents(query?: string, limit?: number): Promise<QueryRecordsResponse>;
    /**
     * Get CMDB health dashboard metrics
     */
    cmdbHealthDashboard(): Promise<any>;
    /**
     * Get service mapping summary
     */
    serviceMappingSummary(serviceSysId: string): Promise<any>;
    /**
     * Create a change request
     */
    createChangeRequest(params: any): Promise<ServiceNowRecord>;
    /**
     * Create a record in any ServiceNow table
     */
    createRecord(table: string, data: Record<string, any>): Promise<ServiceNowRecord>;
    /**
     * Update a record in any ServiceNow table
     */
    updateRecord(table: string, sysId: string, data: Record<string, any>): Promise<ServiceNowRecord>;
    /**
     * Delete a record from any ServiceNow table.
     *
     * Attempts the API DELETE, then — on failure — classifies the cause and throws a
     * ServiceNowError whose message clearly explains *why* the delete failed. ServiceNow
     * returns HTTP 403 for both access-control (ACL) refusals and reference/cascade blocks,
     * so the status alone is insufficient; the cause is matched against the error message and
     * the nested `error.detail` field (which usually names the referencing table/field).
     */
    deleteRecord(table: string, sysId: string): Promise<void>;
    /**
     * Classify a delete failure into a clear category + explanation.
     * Categories: DELETE_NOT_FOUND, DELETE_CONSTRAINT, DELETE_ACL_DENIED, DELETE_FAILED.
     */
    private classifyDeleteFailure;
    /**
     * Call Now Assist / Generative AI endpoints (latest release)
     */
    callNowAssist(endpoint: string, payload: Record<string, any>): Promise<any>;
    /**
     * The CI/CD API, `/api/sn_cicd/<path>` (ARC-09-C94). Its endpoints take their arguments in the query
     * string and carry no request body ("Request body ... None" on every page this server calls), and
     * they answer `{ result: {...} }`; this returns the `result`
     * (vendor/ServiceNowDocs/markdown/api-reference/rest-apis/cicd-api.md).
     *
     * `retries` can only lower the client's own policy, as everywhere else: the call that STARTS
     * something is sent once, because a retry after an answer lost on the way back starts it twice.
     */
    callCicd(method: 'GET' | 'POST', path: string, query?: Record<string, string>, retries?: number): Promise<CicdResult>;
    /**
     * Run aggregate/stats query on a table (ServiceNow Reporting API)
     */
    runAggregateQuery(table: string, groupBy: string, _aggregate?: string, query?: string): Promise<any>;
    /**
     * Natural language search (simplified implementation)
     */
    naturalLanguageSearch(query: string, limit?: number): Promise<any>;
    /**
     * Upload a file attachment to a ServiceNow record via the Attachment API.
     * Accepts base64-encoded content and uploads it as a multipart form.
     */
    uploadAttachment(table: string, recordSysId: string, fileName: string, contentType: string, contentBase64: string): Promise<any>;
    /**
     * Execute multiple REST API operations in a single HTTP call (Batch API).
     * Uses /api/now/v1/batch endpoint. Up to 50 operations per batch.
     */
    batchRequest(operations: Array<{
        id: string;
        method: string;
        url: string;
        body?: any;
    }>): Promise<any>;
    /**
     * Natural language update (simplified implementation)
     */
    naturalLanguageUpdate(_instruction: string, _table: string): Promise<any>;
}
