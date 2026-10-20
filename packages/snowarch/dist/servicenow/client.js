import { ServiceNowError } from '../utils/errors.js';
import { logger } from '../utils/logging.js';
import { snFetch } from './http.js';
import { classifyNetworkError } from './net-errors.js';
/** The host, for a message; the raw value when it cannot be parsed — this never throws. */
const hostOfUrl = (url) => { try {
    return new URL(url).host;
}
catch {
    return url;
} };
import { currentInstanceOrNull } from './context.js';
/**
 * Errors the retry loop rethrows at once: the instance answered, and asking again gets the same
 * answer. `INSUFFICIENT_PRIVILEGES` (a 403) is an access decision, not a fault (ARC-09-C99).
 */
const NOT_RETRIED = ['AUTHENTICATION_FAILED', 'INVALID_REQUEST', 'NOT_FOUND', 'INSUFFICIENT_PRIVILEGES',
    'INSTANCE_REFUSED'];
/**
 * ARC-09-C182 — what refused a 403, read from its text (the message and the detail). The ACL wording is an access
 * decision and decides first; a data policy or a business rule is the instance's own rule, whose remedy is the record,
 * not the roles. Anything else stays the access decision it was.
 */
const ACL_REFUSAL = /acl exception|security constraints|insufficient rights/;
const RULE_REFUSAL = /data policy exception|aborted by business rule|was aborted by|the following fields are mandatory/;
function refusalCode(text) {
    const t = text.toLowerCase();
    if (ACL_REFUSAL.test(t))
        return 'INSUFFICIENT_PRIVILEGES';
    return RULE_REFUSAL.test(t) ? 'INSTANCE_REFUSED' : 'INSUFFICIENT_PRIVILEGES';
}
/** How much of a refusal's non-JSON body the message shows (ARC-09-C176): enough to name a gateway, not a page. */
const NON_JSON_BODY_SHOWN = 200;
/** A response body as a message shows it (ARC-09-C179): the parsed JSON re-serialised, or the raw text, collapsed and cut. */
function shownBody(body) {
    if (body === undefined)
        return '(empty)';
    const text = (typeof body === 'string' ? body : JSON.stringify(body)).replace(/\s+/g, ' ').trim();
    return text === '' ? '(empty)' : text.slice(0, NON_JSON_BODY_SHOWN);
}
// ─── The Batch API's bodies (ARC-09-C108) ────────────────────────────────────────────────────
//
// vendor/ServiceNowDocs/markdown/api-reference/rest-apis/batch-api.md: `rest_requests.body` is the
// "Base64-encoded body of the request ... Before encoding, the body can be in any format", and
// `serviced_requests.body` is the "Base64 encoded body of the response. To get the value of the body,
// Base64 decode the content of this parameter."
/** A request body as the page wants it: the Base64 of its text. A string is a body in a format of the caller's choosing. */
function encodeBatchBody(body) {
    const text = typeof body === 'string' ? body : JSON.stringify(body);
    return Buffer.from(text, 'utf8').toString('base64');
}
/**
 * A response body as the caller can use it: decoded, then parsed when it is JSON. Base64 that is not JSON
 * (the page's own example answers in XML) comes back as the decoded text. A string that is NOT Base64 - or
 * whose bytes are not UTF-8, which is what a short plain word like "test" decodes to - is kept as it came:
 * guessing would turn a plain body into garbage. A body that is already JSON text is parsed.
 */
function decodeBatchBody(body) {
    if (typeof body !== 'string' || body === '')
        return body;
    const compact = body.replace(/\s+/g, '');
    let text = body;
    if (/^[A-Za-z0-9+/]+={0,2}$/.test(compact) && compact.length % 4 === 0) {
        const decoded = Buffer.from(compact, 'base64').toString('utf8');
        // The round trip is the whole test: bytes that are not UTF-8 decode to replacement characters, which
        // do not encode back to the same string, and a string that is not canonical Base64 does not either.
        // (A check for U+FFFD in the text would add nothing and would refuse a body that really contains one.)
        if (Buffer.from(decoded, 'utf8').toString('base64') === compact)
            text = decoded;
    }
    try {
        return JSON.parse(text);
    }
    catch {
        return text;
    }
}
// ─── Input validation helpers ────────────────────────────────────────────────
/** Validate and sanitize ServiceNow table names (alphanumeric + underscores only) */
function validateTableName(table) {
    if (!table || !/^[a-zA-Z][a-zA-Z0-9_]*$/.test(table)) {
        throw new ServiceNowError(`Invalid table name: "${table}". Must contain only letters, numbers, and underscores.`, 'VALIDATION_ERROR');
    }
    return table;
}
/** Validate ServiceNow sys_id format (32-char hex string) */
function validateSysId(sysId) {
    if (!sysId || !/^[0-9a-f]{32}$/i.test(sysId)) {
        throw new ServiceNowError(`Invalid sys_id: "${sysId}". Must be a 32-character hex string.`, 'VALIDATION_ERROR');
    }
    return sysId;
}
/**
 * Allowlist of safe GlideSystem functions permitted in javascript: query expressions. ARC-09-C172 added the Start, End
 * and Local forms of the …Ago functions: the GlideSystem API documents them, and the platform's own filter operators
 * write them into encoded queries (`markdown/platform-user-interface/r_OpAvailableFiltersQueries.md`).
 */
const SAFE_GS_PATTERN = /^javascript:gs\.(getUserID|beginningOfToday|endOfToday|beginningOfYesterday|endOfYesterday|beginningOfLastMonth|endOfLastMonth|beginningOfThisMonth|endOfThisMonth|beginningOfThisQuarter|endOfThisQuarter|beginningOfThisYear|endOfThisYear|beginningOfNextMonth|endOfNextMonth|beginningOfLast7Days|endOfLast7Days|beginningOfLastYear|endOfLastYear|daysAgo|daysAgoStart|daysAgoEnd|daysAgoLocal|hoursAgo|hoursAgoStart|hoursAgoEnd|minutesAgo|minutesAgoStart|minutesAgoEnd|monthsAgo|monthsAgoStart|monthsAgoEnd|quartersAgo|quartersAgoStart|quartersAgoEnd|yearsAgo|now|dateGenerate)\([\d,\s'":-]*\)$/i;
/** Validate and sanitize ServiceNow encoded query strings */
export function validateQuery(query) {
    if (!query)
        return query;
    // Validate javascript: expressions against safe GlideSystem function allowlist
    const jsMatches = query.match(/javascript:[^@^]*/gi);
    if (jsMatches) {
        for (const match of jsMatches) {
            if (!SAFE_GS_PATTERN.test(match.trim())) {
                throw new ServiceNowError(`Query contains unsafe JavaScript expression: "${match.substring(0, 60)}…". Only standard GlideSystem date/user `
                    + 'functions are allowed; for anything else, compute the value and send it literally, '
                    + 'e.g. sys_created_on>2026-10-17 06:00:00.', 'VALIDATION_ERROR');
            }
        }
    }
    // Enforce max query length
    if (query.length > 4096) {
        throw new ServiceNowError('Query string exceeds maximum length of 4096 characters.', 'VALIDATION_ERROR');
    }
    return query;
}
/**
 * ARC-09-C125 — a query's page size: the instance's `maxRecords`, this when the store sets none, and never more
 * than `MAX_PAGE`. Exported because `snow_core_records_query`'s description states both, from here, so the
 * advertised default cannot drift from the one sent again (it said "default: 10" while this sent 100).
 */
export const DEFAULT_MAX_RECORDS = 100;
export const MAX_PAGE = 1000;
export class ServiceNowClient {
    baseUrl;
    authMethod;
    authMode;
    oauthConfig;
    basicConfig;
    maxRetries;
    retryDelayMs;
    requestTimeoutMs;
    /** For impersonation mode: user sys_id to pass in X-Sn-Impersonate */
    impersonateUserSysId;
    /** For per-user mode: pre-loaded token overrides service-account auth */
    perUserBearerToken;
    accessToken;
    tokenExpiry;
    constructor(config) {
        this.baseUrl = config.instanceUrl.replace(/\/$/, ''); // Remove trailing slash
        this.authMethod = config.authMethod;
        this.authMode = config.authMode || 'service-account';
        this.oauthConfig = config.oauth;
        this.basicConfig = config.basic;
        // `??`, not `||`. With `||`, a configured **0** is falsy and silently becomes the default,
        // so `MAX_RETRIES=0` gave three retries and `RETRY_DELAY_MS=0` gave a one-second backoff —
        // "no retries" and "no delay" were unexpressible, and nothing said so. Found while an
        // audit test that set both to 0 took seven seconds a call (1 s + 2 s + 4 s of backoff).
        this.maxRetries = config.maxRetries ?? 3;
        this.retryDelayMs = config.retryDelayMs ?? 1000;
        this.requestTimeoutMs = config.requestTimeoutMs ?? 30000;
        this.impersonateUserSysId = config.impersonateUserSysId;
        this.perUserBearerToken = config.perUserBearerToken;
    }
    /**
     * Return a copy of this client configured to run as a specific user.
     * Used for per-request user context switching without mutating the shared client.
     */
    withUser(options) {
        const copy = Object.create(Object.getPrototypeOf(this));
        Object.assign(copy, this);
        if (options.sysId) {
            copy.authMode = 'impersonation';
            copy.impersonateUserSysId = options.sysId;
        }
        if (options.bearerToken) {
            copy.authMode = 'per-user';
            copy.perUserBearerToken = options.bearerToken;
        }
        return copy;
    }
    /**
     * Authenticate with ServiceNow using OAuth or Basic Auth
     */
    async authenticate() {
        if (this.authMethod === 'basic') {
            // Basic auth doesn't require token acquisition
            return;
        }
        // Check if we have a valid token
        if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
            return; // Token still valid
        }
        // Acquire OAuth token
        if (!this.oauthConfig?.clientId || !this.oauthConfig?.clientSecret) {
            throw new ServiceNowError('OAuth client ID and secret are required for OAuth authentication', 'AUTHENTICATION_FAILED');
        }
        if (!this.oauthConfig?.username || !this.oauthConfig?.password) {
            throw new ServiceNowError('Username and password are required for OAuth password grant', 'AUTHENTICATION_FAILED');
        }
        const tokenUrl = `${this.baseUrl}/oauth_token.do`;
        const body = new URLSearchParams({
            grant_type: 'password',
            client_id: this.oauthConfig.clientId,
            client_secret: this.oauthConfig.clientSecret,
            username: this.oauthConfig.username,
            password: this.oauthConfig.password,
        });
        try {
            const response = await snFetch(tokenUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: body.toString(),
            });
            if (!response.ok) {
                throw new ServiceNowError(`OAuth authentication failed: ${response.status} ${response.statusText}`, 'AUTHENTICATION_FAILED');
            }
            const tokenData = await response.json();
            this.accessToken = tokenData.access_token;
            // Set expiry to 90% of actual expiry time for safety margin
            this.tokenExpiry = Date.now() + (tokenData.expires_in * 1000 * 0.9);
            logger.debug('OAuth token acquired successfully');
        }
        catch (error) {
            if (error instanceof ServiceNowError) {
                throw error;
            }
            throw new ServiceNowError(`OAuth authentication error: ${error instanceof Error ? error.message : 'Unknown error'}`, 'AUTHENTICATION_FAILED');
        }
    }
    /**
     * Get authorization header for requests.
     * Per-user mode returns the user's own Bearer token directly.
     * Impersonation and service-account modes use the configured service account.
     */
    getAuthHeader() {
        // Per-user: use the individual user's token (highest precedence)
        if (this.authMode === 'per-user' && this.perUserBearerToken) {
            return `Bearer ${this.perUserBearerToken}`;
        }
        if (this.authMethod === 'basic') {
            if (!this.basicConfig?.username || !this.basicConfig?.password) {
                throw new ServiceNowError('Username and password are required for Basic authentication', 'AUTHENTICATION_FAILED');
            }
            const credentials = Buffer.from(`${this.basicConfig.username}:${this.basicConfig.password}`).toString('base64');
            return `Basic ${credentials}`;
        }
        else {
            if (!this.accessToken) {
                throw new ServiceNowError('OAuth token not available. Call authenticate() first.', 'AUTHENTICATION_FAILED');
            }
            return `Bearer ${this.accessToken}`;
        }
    }
    /**
     * Returns the X-Sn-Impersonate header value if impersonation mode is active.
     * ServiceNow executes the request in the context of the named user's roles/ACLs.
     */
    getImpersonateHeader() {
        if (this.authMode === 'impersonation' && this.impersonateUserSysId) {
            return this.impersonateUserSysId;
        }
        return undefined;
    }
    /**
     * Make HTTP request with retry logic
     *
     * `requestedRetries` can only LOWER the client's own policy (`this.maxRetries`). It is reachable
     * from a tool argument (`QueryRecordsParams.retries`), so a value that raised it, or that was not
     * a count at all (`NaN`, `Infinity`, a string), would let a caller pick how many times this
     * client hammers an instance. Anything that is not a non-negative integer is ignored.
     */
    async request(url, options = {}, requestedRetries = this.maxRetries, onResponse) {
        let lastError;
        const maxRetries = Number.isInteger(requestedRetries) && requestedRetries >= 0
            ? Math.min(requestedRetries, this.maxRetries)
            : this.maxRetries;
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            let retryAfterMs; // set from a 429/503 Retry-After header
            try {
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs);
                const extraHeaders = {};
                const impersonateHeader = this.getImpersonateHeader();
                if (impersonateHeader) {
                    extraHeaders['X-Sn-Impersonate'] = impersonateHeader;
                }
                const response = await snFetch(url, {
                    ...options,
                    signal: controller.signal,
                    headers: {
                        'Accept': 'application/json',
                        'Content-Type': 'application/json',
                        'Authorization': this.getAuthHeader(),
                        ...extraHeaders,
                        ...options.headers,
                    },
                });
                clearTimeout(timeout);
                // Handle HTTP errors
                if (!response.ok) {
                    const errorText = await response.text();
                    let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
                    let errorDetail;
                    try {
                        const errorJson = JSON.parse(errorText);
                        if (errorJson.error?.message) {
                            errorMessage = errorJson.error.message;
                        }
                        // ServiceNow nests the specific cause (e.g. the referencing table/field) in `detail`
                        if (errorJson.error?.detail) {
                            errorDetail = String(errorJson.error.detail);
                        }
                    }
                    catch {
                        // Not JSON (a gateway's page, say): its own text, shortened, after the status line.
                        const body = errorText.replace(/\s+/g, ' ').trim();
                        if (body)
                            errorMessage = `${errorMessage}: ${body.slice(0, NON_JSON_BODY_SHOWN)}`;
                    }
                    // ARC-09-C176 — the detail is where a refusal says what refused it (an ACL, a Business Rule, a
                    // scope), so it is part of the message the caller reads, not only of `details`.
                    if (errorDetail && !errorMessage.includes(errorDetail))
                        errorMessage = `${errorMessage}: ${errorDetail}`;
                    // Map HTTP status to error codes. The default was `API_ERROR`, which is in no
                    // registry and so reached a caller with no meaning and no remedy attached —
                    // invisible until `ServiceNowError` took the registry's union as its code type.
                    // `REQUEST_FAILED` is the registered code for exactly this case: the instance
                    // refused and its response is the only information there is.
                    let errorCode = 'REQUEST_FAILED';
                    if (response.status === 401) {
                        errorCode = 'AUTHENTICATION_FAILED';
                    }
                    else if (response.status === 403) {
                        errorCode = refusalCode(`${errorMessage} ${errorDetail ?? ''}`);
                    }
                    else if (response.status === 404) {
                        errorCode = 'NOT_FOUND';
                    }
                    else if (response.status === 400) {
                        errorCode = 'INVALID_REQUEST';
                    }
                    else if (response.status === 429 || response.status === 503) {
                        errorCode = 'RATE_LIMITED';
                        // Honor Retry-After (delta-seconds or HTTP-date) for the backoff below.
                        const ra = response.headers.get('retry-after');
                        if (ra) {
                            const secs = Number(ra);
                            retryAfterMs = Number.isFinite(secs)
                                ? secs * 1000
                                : Math.max(0, new Date(ra).getTime() - Date.now());
                        }
                    }
                    throw new ServiceNowError(errorMessage, errorCode, {
                        status: response.status,
                        detail: errorDetail,
                    });
                }
                // 204 No Content or empty body (e.g. a successful DELETE) has nothing to parse.
                // Parsing it as JSON would throw, get caught below, and trigger a spurious retry
                // whose second DELETE then 404s — making a successful delete report NOT_FOUND.
                // ARC-09-C125: a caller that needs a header of a successful answer (X-Total-Count) reads it here.
                onResponse?.(response);
                if (response.status === 204)
                    return undefined;
                const body = await response.text();
                if (!body)
                    return undefined;
                try {
                    return JSON.parse(body);
                }
                catch {
                    return body;
                }
            }
            catch (error) {
                lastError = error instanceof Error ? error : new Error('Unknown error');
                // Don't retry an answer: the instance understood the request and refused it. A 401 is
                // not made valid by asking again (and risks a lockout), a 400 or 404 does not change, and
                // a 403 is an access decision (ARC-09-C99) - the same role is checked the same way each
                // time, so a retry costs 1s + 2s + 4s of backoff to be told no four times. What is retried
                // is what can clear: a rate limit, a server error, a request that never arrived.
                if (error instanceof ServiceNowError) {
                    if (NOT_RETRIED.includes(error.code)) {
                        throw error;
                    }
                }
                // Retry on network errors, rate limits, or server errors
                if (attempt < maxRetries) {
                    const backoff = this.retryDelayMs * Math.pow(2, attempt); // Exponential backoff
                    // A 429/503 Retry-After takes precedence over backoff (capped at 60s).
                    const delay = retryAfterMs !== undefined ? Math.min(retryAfterMs, 60000) : backoff;
                    logger.warn(`Request failed, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue;
                }
            }
        }
        // Surface the real cause from a fetch failure, CLASSIFIED.
        //
        // This used to throw the raw system code — `ENOTFOUND`, `UNABLE_TO_VERIFY_LEAF_SIGNATURE`,
        // `ECONNREFUSED` — with the message `Failed to query records: <cause.message>`. Every one of
        // those is accurate and none of them tells a user on a corporate laptop what to do, which is
        // R-3: the three most common failures there have three different remedies, and the one people
        // reach for first (their credentials) is the one that is fine.
        if (lastError) {
            const cause = lastError.cause;
            if (cause) {
                // The host is passed, so the server-facing message names the instance the request was
                // for rather than the registry's `<host>` placeholder.
                const diagnosis = classifyNetworkError(lastError, process.env, { host: hostOfUrl(this.baseUrl) });
                throw new ServiceNowError(`Failed to query records: ${cause.message} — ${diagnosis.remedy}`, diagnosis.code);
            }
            throw lastError;
        }
        throw new Error('Request failed after retries');
    }
    /**
     * Query records from a ServiceNow table
     */
    async queryRecords(params) {
        // Validate inputs
        validateTableName(params.table);
        if (params.query)
            validateQuery(params.query);
        // Authenticate before making API calls
        await this.authenticate();
        // Build query parameters
        const queryParams = new URLSearchParams();
        if (params.query) {
            queryParams.set('sysparm_query', params.query);
        }
        if (params.fields) {
            queryParams.set('sysparm_fields', params.fields);
        }
        let limit;
        if (params.limit !== undefined && params.limit > 0) {
            limit = Math.min(params.limit, MAX_PAGE);
        }
        else {
            // Default page size from the addressed instance's maxRecords (store-declared, default
            // 100), capped at 1000. It used to come from process.env.MAX_RECORDS with a fallback
            // of 10 — process-global, and so the same for every instance the server held.
            // Outside a request (a direct client construction in a test) there is no ambient
            // instance, and 100 is the documented default.
            const rt = currentInstanceOrNull();
            limit = Math.min(rt?.maxRecords ?? (Number(process.env.MAX_RECORDS) || DEFAULT_MAX_RECORDS), MAX_PAGE);
        }
        queryParams.set('sysparm_limit', limit.toString());
        if (params.offset !== undefined) {
            queryParams.set('sysparm_offset', params.offset.toString());
        }
        if (params.orderBy) {
            // `-field` means descending, and the platform's encoded form is `ORDERBYDESC<field>` —
            // ONE term. This used to build `ORDERBY<field>^ORDERBYDESC`: two terms, the first sorting
            // ascending and the second a bare operator with no field. ServiceNow does not reject it,
            // it just sorts ascending, so every "newest first" query returned the OLDEST records and
            // looked like it had worked. That is the defect behind field-notes' sort workaround and
            // the "newest is years old" note in the legacy setup text.
            //
            // Multiple fields are comma-separated and joined per term, each carrying its own
            // direction: `-priority,sys_created_on` → `ORDERBYDESCpriority^ORDERBYsys_created_on`.
            const terms = params.orderBy.split(',')
                .map((raw) => raw.trim())
                .filter((raw) => raw.length > 0)
                .map((raw) => (raw.startsWith('-')
                ? `ORDERBYDESC${raw.slice(1)}`
                : `ORDERBY${raw}`));
            if (terms.length > 0) {
                const sort = terms.join('^');
                queryParams.set('sysparm_query', params.query ? `${params.query}^${sort}` : sort);
            }
            else if (params.query) {
                // `orderBy: ','` or `'  '` — nothing to sort by, but the query must still survive.
                queryParams.set('sysparm_query', params.query);
            }
        }
        const url = `${this.baseUrl}/api/now/table/${params.table}?${queryParams.toString()}`;
        logger.info(`Querying ServiceNow table: ${params.table}`);
        logger.debug(`Query: ${this.maskQuery(params.query)}`);
        try {
            // ARC-09-C125: X-Total-Count, the "Total count of records returned by the query"
            // (markdown/api-reference/rest-apis/c_TableAPI.md:463), is how a caller tells a page from the
            // whole list: `count` is the page's length. Null when the instance does not send it.
            let totalHeader = null;
            const response = await this.request(url, {}, params.retries, (r) => { totalHeader = r.headers?.get?.('x-total-count') ?? null; });
            const total = totalHeader !== null && /^\d+$/.test(String(totalHeader).trim()) ? Number(totalHeader) : null;
            return {
                count: response.result.length,
                records: response.result,
                limit,
                offset: params.offset ?? 0,
                total,
            };
        }
        catch (error) {
            if (error instanceof ServiceNowError) {
                throw error;
            }
            throw new ServiceNowError(`Failed to query records: ${error instanceof Error ? error.message : 'Unknown error'}`, 'QUERY_FAILED');
        }
    }
    /**
     * Get table schema/structure
     */
    async getTableSchema(tableName) {
        await this.authenticate();
        const url = `${this.baseUrl}/api/now/table/${tableName}?sysparm_exclude_reference_link=true&sysparm_limit=1`;
        logger.info(`Getting schema for table: ${tableName}`);
        try {
            // Get table structure by querying with limit=1
            const response = await this.request(url);
            // Extract field names and types from the result
            if (response.result && response.result.length > 0) {
                const sample = response.result[0];
                const columns = Object.keys(sample).map(key => ({
                    element: key,
                    value_sample: sample[key],
                }));
                return {
                    table: tableName,
                    columns,
                };
            }
            return {
                table: tableName,
                columns: [],
            };
        }
        catch (error) {
            if (error instanceof ServiceNowError) {
                throw error;
            }
            throw new ServiceNowError(`Failed to get table schema: ${error instanceof Error ? error.message : 'Unknown error'}`, 'QUERY_FAILED');
        }
    }
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
    getAuthUsername() {
        return this.authMethod === 'oauth' ? this.oauthConfig?.username : this.basicConfig?.username;
    }
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
    maskQuery(query) {
        if (!query)
            return 'none';
        const user = this.getAuthUsername();
        if (!user)
            return query;
        return query.split(user).join('<user>');
    }
    async getRecord(table, sysId, fields) {
        validateTableName(table);
        validateSysId(sysId);
        await this.authenticate();
        const queryParams = new URLSearchParams();
        if (fields) {
            queryParams.set('sysparm_fields', fields);
        }
        const url = `${this.baseUrl}/api/now/table/${table}/${sysId}${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
        logger.info(`Getting record from ${table}: ${sysId}`);
        try {
            const response = await this.request(url);
            return response.result;
        }
        catch (error) {
            if (error instanceof ServiceNowError) {
                throw error;
            }
            throw new ServiceNowError(`Failed to get record: ${error instanceof Error ? error.message : 'Unknown error'}`, 'QUERY_FAILED');
        }
    }
    /**
     * Get user details by email or username
     */
    async getUser(userIdentifier) {
        await this.authenticate();
        // Try user_name, email, or sys_id
        if (/^[0-9a-f]{32}$/i.test(userIdentifier)) {
            return await this.getRecord('sys_user', userIdentifier);
        }
        const query = `user_name=${userIdentifier}^ORemail=${userIdentifier}`;
        const url = `${this.baseUrl}/api/now/table/sys_user?sysparm_query=${query}&sysparm_limit=1`;
        logger.info(`Looking up user: ${userIdentifier}`);
        try {
            const response = await this.request(url);
            if (response.result.length === 0) {
                throw new ServiceNowError(`User not found: ${userIdentifier}`, 'NOT_FOUND');
            }
            return response.result[0];
        }
        catch (error) {
            if (error instanceof ServiceNowError) {
                throw error;
            }
            throw new ServiceNowError(`Failed to get user: ${error instanceof Error ? error.message : 'Unknown error'}`, 'QUERY_FAILED');
        }
    }
    /**
     * Get group details by name or sys_id
     */
    async getGroup(groupIdentifier) {
        await this.authenticate();
        // Check if it's a sys_id (32 hex chars) or name
        const isSysId = /^[0-9a-f]{32}$/i.test(groupIdentifier);
        const query = isSysId ? `sys_id=${groupIdentifier}` : `name=${groupIdentifier}`;
        const url = `${this.baseUrl}/api/now/table/sys_user_group?sysparm_query=${query}&sysparm_limit=1`;
        logger.info(`Looking up group: ${groupIdentifier}`);
        try {
            const response = await this.request(url);
            if (response.result.length === 0) {
                throw new ServiceNowError(`Group not found: ${groupIdentifier}`, 'NOT_FOUND');
            }
            return response.result[0];
        }
        catch (error) {
            if (error instanceof ServiceNowError) {
                throw error;
            }
            throw new ServiceNowError(`Failed to get group: ${error instanceof Error ? error.message : 'Unknown error'}`, 'QUERY_FAILED');
        }
    }
    /**
     * Search CMDB configuration items
     */
    async searchCmdbCi(query, limit = 10) {
        await this.authenticate();
        const queryParams = new URLSearchParams();
        if (query) {
            queryParams.set('sysparm_query', query);
        }
        queryParams.set('sysparm_limit', Math.min(limit, 100).toString());
        const url = `${this.baseUrl}/api/now/table/cmdb_ci?${queryParams.toString()}`;
        logger.info('Searching CMDB CIs');
        try {
            const response = await this.request(url);
            return {
                count: response.result.length,
                records: response.result,
            };
        }
        catch (error) {
            if (error instanceof ServiceNowError) {
                throw error;
            }
            throw new ServiceNowError(`Failed to search CMDB CIs: ${error instanceof Error ? error.message : 'Unknown error'}`, 'QUERY_FAILED');
        }
    }
    /**
     * Get a specific CMDB configuration item
     */
    async getCmdbCi(ciSysId, fields) {
        return this.getRecord('cmdb_ci', ciSysId, fields);
    }
    /**
     * List relationships for a CI
     */
    async listRelationships(ciSysId) {
        await this.authenticate();
        const query = `parent=${ciSysId}^ORchild=${ciSysId}`;
        const url = `${this.baseUrl}/api/now/table/cmdb_rel_ci?sysparm_query=${query}`;
        logger.info(`Listing relationships for CI: ${ciSysId}`);
        try {
            const response = await this.request(url);
            return {
                count: response.result.length,
                relationships: response.result,
            };
        }
        catch (error) {
            if (error instanceof ServiceNowError) {
                throw error;
            }
            throw new ServiceNowError(`Failed to list relationships: ${error instanceof Error ? error.message : 'Unknown error'}`, 'QUERY_FAILED');
        }
    }
    /**
     * List discovery schedules
     */
    async listDiscoverySchedules(activeOnly = false) {
        await this.authenticate();
        const query = activeOnly ? 'active=true' : '';
        const url = `${this.baseUrl}/api/now/table/discovery_schedule${query ? '?sysparm_query=' + query : ''}`;
        logger.info('Listing discovery schedules');
        try {
            const response = await this.request(url);
            return {
                count: response.result.length,
                schedules: response.result,
            };
        }
        catch (error) {
            if (error instanceof ServiceNowError) {
                throw error;
            }
            throw new ServiceNowError(`Failed to list discovery schedules: ${error instanceof Error ? error.message : 'Unknown error'}`, 'QUERY_FAILED');
        }
    }
    /**
     * List MID servers
     */
    async listMidServers(activeOnly = false) {
        await this.authenticate();
        const query = activeOnly ? 'status=Up' : '';
        const url = `${this.baseUrl}/api/now/table/ecc_agent${query ? '?sysparm_query=' + query : ''}`;
        logger.info('Listing MID servers');
        try {
            const response = await this.request(url);
            return {
                count: response.result.length,
                mid_servers: response.result,
            };
        }
        catch (error) {
            if (error instanceof ServiceNowError) {
                throw error;
            }
            throw new ServiceNowError(`Failed to list MID servers: ${error instanceof Error ? error.message : 'Unknown error'}`, 'QUERY_FAILED');
        }
    }
    /**
     * List active events
     */
    async listActiveEvents(query, limit = 10) {
        await this.authenticate();
        const queryParams = new URLSearchParams();
        if (query) {
            queryParams.set('sysparm_query', query);
        }
        queryParams.set('sysparm_limit', limit.toString());
        const url = `${this.baseUrl}/api/now/table/em_event?${queryParams.toString()}`;
        logger.info('Listing active events');
        try {
            const response = await this.request(url);
            return {
                count: response.result.length,
                records: response.result,
            };
        }
        catch (error) {
            if (error instanceof ServiceNowError) {
                throw error;
            }
            throw new ServiceNowError(`Failed to list events: ${error instanceof Error ? error.message : 'Unknown error'}`, 'QUERY_FAILED');
        }
    }
    /**
     * Get CMDB health dashboard metrics
     */
    async cmdbHealthDashboard() {
        await this.authenticate();
        logger.info('Getting CMDB health metrics');
        try {
            // Get server metrics
            const serversUrl = `${this.baseUrl}/api/now/table/cmdb_ci_server?sysparm_fields=sys_id,ip_address,os,serial_number`;
            const serversResponse = await this.request(serversUrl);
            const servers = serversResponse.result;
            const serversWithIp = servers.filter(s => s.ip_address).length;
            const serversWithOs = servers.filter(s => s.os).length;
            const serversWithSerial = servers.filter(s => s.serial_number).length;
            // Get network device metrics
            const networkUrl = `${this.baseUrl}/api/now/table/cmdb_ci_network_adapter?sysparm_fields=sys_id,ip_address,mac_address&sysparm_limit=100`;
            const networkResponse = await this.request(networkUrl);
            const network = networkResponse.result;
            const networkWithIp = network.filter(n => n.ip_address).length;
            const networkWithMac = network.filter(n => n.mac_address).length;
            return {
                server_metrics: {
                    total: servers.length,
                    with_ip: serversWithIp,
                    with_os: serversWithOs,
                    with_serial: serversWithSerial,
                    ip_completeness: servers.length > 0 ? ((serversWithIp / servers.length) * 100).toFixed(2) : '0',
                    os_completeness: servers.length > 0 ? ((serversWithOs / servers.length) * 100).toFixed(2) : '0',
                },
                network_metrics: {
                    total: network.length,
                    with_ip: networkWithIp,
                    with_mac: networkWithMac,
                    ip_completeness: network.length > 0 ? ((networkWithIp / network.length) * 100).toFixed(2) : '0',
                    mac_completeness: network.length > 0 ? ((networkWithMac / network.length) * 100).toFixed(2) : '0',
                },
            };
        }
        catch (error) {
            if (error instanceof ServiceNowError) {
                throw error;
            }
            throw new ServiceNowError(`Failed to get CMDB health: ${error instanceof Error ? error.message : 'Unknown error'}`, 'QUERY_FAILED');
        }
    }
    /**
     * Get service mapping summary
     */
    async serviceMappingSummary(serviceSysId) {
        await this.authenticate();
        logger.info(`Getting service mapping summary for: ${serviceSysId}`);
        try {
            // Get service details
            const serviceUrl = `${this.baseUrl}/api/now/table/cmdb_ci_service/${serviceSysId}`;
            const serviceResponse = await this.request(serviceUrl);
            // Get related CIs
            const relatedUrl = `${this.baseUrl}/api/now/table/cmdb_rel_ci?sysparm_query=parent=${serviceSysId}^ORchild=${serviceSysId}`;
            const relatedResponse = await this.request(relatedUrl);
            return {
                service: serviceResponse.result,
                related_cis_count: relatedResponse.result.length,
                related_cis: relatedResponse.result,
            };
        }
        catch (error) {
            if (error instanceof ServiceNowError) {
                throw error;
            }
            throw new ServiceNowError(`Failed to get service mapping: ${error instanceof Error ? error.message : 'Unknown error'}`, 'QUERY_FAILED');
        }
    }
    /**
     * Create a change request
     */
    async createChangeRequest(params) {
        await this.authenticate();
        logger.info('Creating change request');
        const url = `${this.baseUrl}/api/now/table/change_request`;
        try {
            const response = await this.request(url, {
                method: 'POST',
                body: JSON.stringify(params),
            });
            return response.result;
        }
        catch (error) {
            if (error instanceof ServiceNowError) {
                throw error;
            }
            throw new ServiceNowError(`Failed to create change request: ${error instanceof Error ? error.message : 'Unknown error'}`, 'QUERY_FAILED');
        }
    }
    /**
     * Create a record in any ServiceNow table
     */
    async createRecord(table, data) {
        validateTableName(table);
        await this.authenticate();
        logger.info(`Creating record in ${table}`);
        const url = `${this.baseUrl}/api/now/table/${table}`;
        try {
            let status;
            const response = await this.request(url, {
                method: 'POST',
                body: JSON.stringify(data),
            }, this.maxRetries, (r) => { status = r.status; });
            // ARC-09-C179 — an answer with no record in it is not a created record, whatever its status: the instance may
            // have discarded the insert. Refused here, with the status and the body, so no caller reports it as created.
            const record = typeof response === 'object' && response !== null ? response.result : undefined;
            if (!record || typeof record !== 'object' || !record.sys_id) {
                throw new ServiceNowError(`No record returned for the create on ${table} (HTTP ${status ?? 'unknown'}); body: `
                    + `${shownBody(response)}. The instance may have discarded the insert: read ${table} before adding it again.`, 'CREATE_FAILED', { status, table });
            }
            return record;
        }
        catch (error) {
            if (error instanceof ServiceNowError)
                throw error;
            throw new ServiceNowError(`Failed to create record in ${table}: ${error instanceof Error ? error.message : 'Unknown error'}`, 'CREATE_FAILED');
        }
    }
    /**
     * Update a record in any ServiceNow table
     */
    async updateRecord(table, sysId, data) {
        validateTableName(table);
        validateSysId(sysId);
        await this.authenticate();
        logger.info(`Updating record ${sysId} in ${table}`);
        const url = `${this.baseUrl}/api/now/table/${table}/${sysId}`;
        try {
            const response = await this.request(url, {
                method: 'PATCH',
                body: JSON.stringify(data),
            });
            return response.result;
        }
        catch (error) {
            if (error instanceof ServiceNowError)
                throw error;
            throw new ServiceNowError(`Failed to update record ${sysId} in ${table}: ${error instanceof Error ? error.message : 'Unknown error'}`, 'UPDATE_FAILED');
        }
    }
    /**
     * Delete a record from any ServiceNow table.
     *
     * Attempts the API DELETE, then — on failure — classifies the cause and throws a
     * ServiceNowError whose message clearly explains *why* the delete failed. ServiceNow
     * returns HTTP 403 for both access-control (ACL) refusals and reference/cascade blocks,
     * so the status alone is insufficient; the cause is matched against the error message and
     * the nested `error.detail` field (which usually names the referencing table/field).
     */
    async deleteRecord(table, sysId) {
        validateTableName(table);
        validateSysId(sysId);
        await this.authenticate();
        logger.info(`Deleting record ${sysId} from ${table}`);
        const url = `${this.baseUrl}/api/now/table/${table}/${sysId}`;
        try {
            await this.request(url, { method: 'DELETE' });
        }
        catch (error) {
            const { code, message } = this.classifyDeleteFailure(error, table, sysId);
            const sn = error instanceof ServiceNowError ? error : undefined;
            const detail = sn && sn.details && typeof sn.details === 'object'
                ? sn.details.detail
                : undefined;
            logger.warn(`Delete failed (${code}) for ${table}/${sysId}: ${message}`);
            throw new ServiceNowError(message, code, {
                table,
                sysId,
                originalMessage: error instanceof Error ? error.message : 'Unknown error',
                detail,
            });
        }
    }
    /**
     * Classify a delete failure into a clear category + explanation.
     * Categories: DELETE_NOT_FOUND, DELETE_CONSTRAINT, DELETE_ACL_DENIED, DELETE_FAILED.
     */
    classifyDeleteFailure(error, table, sysId) {
        const sn = error instanceof ServiceNowError ? error : undefined;
        const meta = sn && sn.details && typeof sn.details === 'object' ? sn.details : {};
        const status = meta.status;
        const detail = meta.detail;
        const haystack = `${sn?.message ?? (error instanceof Error ? error.message : '')} ${detail ?? ''}`.toLowerCase();
        const ACL = /acl|aborted|insufficient (rights|privilege)|not authorized|security|write operation .* not permitted|no permission|operation against file/;
        // ARC-09-C177: the instance words an ACL refusal "ACL Exception Delete Failed due to security constraints"
        // (PN-16). That wording decides before the constraint pattern, which no longer matches the bare word.
        const ACL_WORDING = /acl exception|security constraints/;
        const CONSTRAINT = /referenced by|cannot be deleted because|cascade|referential integrity|foreign|child record|in use by|dependent/;
        const NOT_FOUND = /no record|record not found|does not exist|not found/;
        const suffix = detail ? ` ServiceNow detail: ${detail}` : '';
        if (status === 404 || NOT_FOUND.test(haystack)) {
            return {
                code: 'DELETE_NOT_FOUND',
                message: `Cannot delete ${table}/${sysId}: the record does not exist (it may have already been deleted).`,
            };
        }
        if (!ACL_WORDING.test(haystack) && CONSTRAINT.test(haystack)) {
            return {
                code: 'DELETE_CONSTRAINT',
                message: `Cannot delete ${table}/${sysId}: it is referenced by other records (reference/cascade constraint). ` +
                    `Remove or reassign the dependent records first.${suffix}`,
            };
        }
        if (status === 403 || ACL.test(haystack)) {
            return {
                code: 'DELETE_ACL_DENIED',
                message: `Cannot delete ${table}/${sysId}: permission denied by ServiceNow access control (ACL). ` +
                    `Your account lacks delete rights on this table/record, or a Business Rule blocked the operation.${suffix}`,
            };
        }
        // The message already carries the detail since ARC-09-C176; it is added here only when it does not.
        const said = sn?.message ?? (error instanceof Error ? error.message : 'Unknown error');
        return {
            code: 'DELETE_FAILED',
            message: `Failed to delete ${table}/${sysId}: ${said}` + (detail && !said.includes(detail) ? ` (detail: ${detail})` : ''),
        };
    }
    /**
     * Call Now Assist / Generative AI endpoints (latest release)
     */
    async callNowAssist(endpoint, payload) {
        await this.authenticate();
        logger.info(`Calling Now Assist endpoint: ${endpoint}`);
        const url = `${this.baseUrl}${endpoint}`;
        try {
            const response = await this.request(url, {
                method: 'POST',
                body: JSON.stringify(payload),
            });
            return response;
        }
        catch (error) {
            if (error instanceof ServiceNowError)
                throw error;
            throw new ServiceNowError(`Now Assist call failed: ${error instanceof Error ? error.message : 'Unknown error'}`, 'NOW_ASSIST_ERROR');
        }
    }
    /**
     * The CI/CD API, `/api/sn_cicd/<path>` (ARC-09-C94). Its endpoints take their arguments in the query
     * string and carry no request body ("Request body ... None" on every page this server calls), and
     * they answer `{ result: {...} }`; this returns the `result`
     * (vendor/ServiceNowDocs/markdown/api-reference/rest-apis/cicd-api.md).
     *
     * `retries` can only lower the client's own policy, as everywhere else: the call that STARTS
     * something is sent once, because a retry after an answer lost on the way back starts it twice.
     */
    async callCicd(method, path, query = {}, retries) {
        await this.authenticate();
        const qs = new URLSearchParams(query).toString();
        const url = `${this.baseUrl}/api/sn_cicd/${path}${qs ? `?${qs}` : ''}`;
        logger.info(`Calling the CI/CD API: ${method} /api/sn_cicd/${path}`);
        const response = await this.request(url, { method }, retries);
        return response?.result ?? {};
    }
    /**
     * Run aggregate/stats query on a table (ServiceNow Reporting API)
     */
    async runAggregateQuery(table, groupBy, _aggregate = 'COUNT', query) {
        await this.authenticate();
        const params = new URLSearchParams();
        params.set('sysparm_group_by', groupBy);
        if (query)
            params.set('sysparm_query', query);
        params.set('sysparm_count', 'true');
        const url = `${this.baseUrl}/api/now/stats/${table}?${params.toString()}`;
        try {
            const response = await this.request(url);
            return response.result;
        }
        catch (error) {
            if (error instanceof ServiceNowError)
                throw error;
            throw new ServiceNowError(`Aggregate query failed: ${error instanceof Error ? error.message : 'Unknown error'}`, 'QUERY_FAILED');
        }
    }
    /**
     * Natural language search (simplified implementation)
     */
    async naturalLanguageSearch(query, limit = 10) {
        // For now, search across incidents - in a full implementation,
        // this would use NLP to determine the table and build the query
        logger.info(`Natural language search: ${query}`);
        const searchQuery = `short_descriptionLIKE${query}^ORdescriptionLIKE${query}`;
        return this.queryRecords({
            table: 'incident',
            query: searchQuery,
            limit,
        });
    }
    /**
     * Upload a file attachment to a ServiceNow record via the Attachment API.
     * Accepts base64-encoded content and uploads it as a multipart form.
     */
    async uploadAttachment(table, recordSysId, fileName, contentType, contentBase64) {
        await this.authenticate();
        const url = `${this.baseUrl}/api/now/attachment/file?table_name=${encodeURIComponent(table)}&table_sys_id=${encodeURIComponent(recordSysId)}&file_name=${encodeURIComponent(fileName)}`;
        logger.info(`Uploading attachment "${fileName}" to ${table}:${recordSysId}`);
        try {
            // Decode base64 to binary
            const binary = Buffer.from(contentBase64, 'base64');
            const response = await snFetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': contentType,
                    'Authorization': this.getAuthHeader(),
                    'Accept': 'application/json',
                },
                body: binary,
            });
            if (!response.ok) {
                const errorText = await response.text();
                let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
                try {
                    const errorJson = JSON.parse(errorText);
                    if (errorJson.error?.message)
                        errorMessage = errorJson.error.message;
                }
                catch {
                    // ignore parse error
                }
                throw new ServiceNowError(errorMessage, 'ATTACHMENT_UPLOAD_FAILED');
            }
            const data = await response.json();
            return data.result ?? data;
        }
        catch (error) {
            if (error instanceof ServiceNowError)
                throw error;
            throw new ServiceNowError(`Failed to upload attachment: ${error instanceof Error ? error.message : 'Unknown error'}`, 'ATTACHMENT_UPLOAD_FAILED');
        }
    }
    /**
     * Execute multiple REST API operations in a single HTTP call (Batch API).
     * Uses /api/now/v1/batch endpoint. Up to 50 operations per batch.
     */
    async batchRequest(operations) {
        await this.authenticate();
        logger.info(`Executing batch request with ${operations.length} operations`);
        if (operations.length > 50) {
            throw new ServiceNowError('Maximum 50 operations per batch request', 'INVALID_REQUEST');
        }
        const batchPayload = {
            batch_request_id: `snowarch_${Date.now()}`,
            rest_requests: operations.map(op => ({
                id: op.id,
                method: op.method,
                url: op.url.startsWith('/') ? op.url : `/${op.url}`,
                headers: [
                    { name: 'Content-Type', value: 'application/json' },
                    { name: 'Accept', value: 'application/json' },
                ],
                ...(op.body ? { body: encodeBatchBody(op.body) } : {}),
            })),
        };
        const url = `${this.baseUrl}/api/now/v1/batch`;
        try {
            const response = await this.request(url, {
                method: 'POST',
                body: JSON.stringify(batchPayload),
            });
            // Each item's body is Base64 (see decodeBatchBody); `id` and `status_code` are kept as they were.
            const results = (response.serviced_requests || []).map((r) => ({
                id: r.id,
                status_code: r.status_code,
                body: decodeBatchBody(r.body),
            }));
            // `unserviced_requests`: the ids the platform did not process because the batch reached a size or
            // processing limit. Without this a cut batch returned fewer results than operations, with no word
            // that the missing ones had not run - and in a batch of writes, that is the dangerous half.
            const unserviced = (Array.isArray(response.unserviced_requests) ? response.unserviced_requests : [])
                .map((u) => (u !== null && typeof u === 'object' ? u.id : u))
                .filter((u) => u !== undefined && u !== null)
                .map((u) => String(u));
            return {
                batch_id: batchPayload.batch_request_id,
                total: operations.length,
                results,
                unserviced,
                ...(unserviced.length > 0 ? {
                    note: `${unserviced.length} of ${operations.length} operation(s) were not processed because the batch `
                        + `reached a size or processing limit: ${unserviced.join(', ')}. They have not been run; send them `
                        + 'again in a smaller batch after checking which of the others took effect.',
                } : {}),
            };
        }
        catch (error) {
            if (error instanceof ServiceNowError)
                throw error;
            throw new ServiceNowError(`Batch request failed: ${error instanceof Error ? error.message : 'Unknown error'}`, 'BATCH_FAILED');
        }
    }
    // client.executeScript was removed by ARC-04-S08. It posted to sys_script_execution, an
    // endpoint that does not exist on a PDI; the two tools that used it are now [Unsupported]
    // stubs that fail before any HTTP rather than after a 404.
    /**
     * Natural language update (simplified implementation)
     */
    async naturalLanguageUpdate(_instruction, _table) {
        // This is a simplified implementation - a full version would parse
        // the instruction to extract record identifier and field updates
        logger.warn('Natural language update is experimental and requires manual parsing');
        throw new ServiceNowError('Natural language update requires custom parsing logic - not yet implemented', 'NOT_IMPLEMENTED');
    }
}
