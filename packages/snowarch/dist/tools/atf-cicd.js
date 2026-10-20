import { ServiceNowError } from '../utils/errors.js';
export const CICD_PAGE = 'vendor/ServiceNowDocs/markdown/api-reference/rest-apis/cicd-api.md';
const SPOKE_PAGE = 'vendor/ServiceNowDocs/markdown/integrate-applications/integration-hub/cicd-spoke.md';
/** How long a run is waited for when the caller does not say, in seconds. */
export const DEFAULT_BUDGET_SECONDS = 300;
/**
 * The most a caller may ask to wait. Any finite budget ends, but a caller could ask for a day; past
 * half an hour the run is better left to finish on the instance and its result record read later.
 */
export const MAX_BUDGET_SECONDS = 1800;
/** One progress read every five seconds: sixty in the default budget, not one a moment. */
const POLL_INTERVAL_MS = 5000;
/**
 * What the platform answers for a path it does not serve — measured, not documented
 * (docs/PLATFORM-NOTES.md PN-15): 404 to a GET, 400 to a POST, the same message to both. The message,
 * not the status, tells "the API is not here" from "the suite is not here" (a 404 the page documents
 * as "Not found. The requested item wasn't found.").
 */
const ABSENT_PATH = /Requested URI does not represent any resource/i;
const SYS_ID = /^[0-9a-f]{32}$/i;
/** The page's status numbers that end a run. */
const FINISHED = new Set(['2', '3', '4']);
const STATUS_LABEL = { 0: 'Pending', 1: 'Running', 2: 'Successful', 3: 'Failed', 4: 'Canceled' };
/** A sys_id argument, checked: 32 hexadecimal characters, and anything else is not sent anywhere. */
export function sysIdArg(value, argument = 'sys_id') {
    if (typeof value !== 'string' || !SYS_ID.test(value)) {
        throw new ServiceNowError(`${argument} must be a sys_id, 32 hexadecimal characters; got ${JSON.stringify(value)}`, 'VALIDATION_ERROR');
    }
    return value;
}
/** `budget_seconds`, checked: from 1 to MAX_BUDGET_SECONDS, DEFAULT_BUDGET_SECONDS when absent. */
export function budgetArg(value) {
    if (value === undefined || value === null)
        return DEFAULT_BUDGET_SECONDS;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 1 || value > MAX_BUDGET_SECONDS) {
        throw new ServiceNowError(`budget_seconds must be a number of seconds from 1 to ${MAX_BUDGET_SECONDS} (default ${DEFAULT_BUDGET_SECONDS}); `
            + `got ${JSON.stringify(value)}`, 'VALIDATION_ERROR');
    }
    return value;
}
const labelOf = (a) => String(a.status_label || STATUS_LABEL[String(a.status)] || 'unknown');
const reasonOf = (a) => String(a.error || a.status_message || a.status_detail || `status ${labelOf(a)}, no reason given`);
const count = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
/**
 * A CI/CD refusal as the remedy for it, in the terms of the step it stopped at. Before the run is
 * accepted nothing has started; after it, the run goes on whatever this server can read.
 */
function refusal(error, step, suite, progressId) {
    if (!(error instanceof ServiceNowError))
        return error;
    // A failed sign-in has its own remedy in the always-loaded rule file; it passes through untouched.
    if (error.code === 'AUTHENTICATION_FAILED')
        return error;
    const status = error.details?.status;
    const after = step === 'run'
        ? 'Nothing was run.'
        : `The run of test suite ${suite} was started (CI/CD progress id ${progressId}) and is not cancelled; `
            + `its ${step} could not be read.`;
    if (ABSENT_PATH.test(error.message)) {
        return new ServiceNowError(`The CI/CD API is not served on this instance: /api/sn_cicd answered "${error.message}". The corpus documents `
            + `the CICD REST API as "a ServiceNow AI Platform feature active by default" (${SPOKE_PAGE}) and names no plugin `
            + `that provides it, so ask the instance administrator why /api/sn_cicd is not available here. ${after}`, 'NOT_FOUND', error.details);
    }
    if (status === 403) {
        return new ServiceNowError(`The CI/CD API refused this account (HTTP 403: ${error.message}). "The sn_cicd.sys_ci_automation or admin role `
            + `is required to use this API" (${CICD_PAGE}): ask the instance administrator to grant sn_cicd.sys_ci_automation `
            + `to the account this server signs in as. ${after}`, 'INSUFFICIENT_PRIVILEGES', error.details);
    }
    if (status === 404) {
        return new ServiceNowError(step === 'run'
            ? `The CI/CD API found no test suite ${suite} (HTTP 404: ${error.message}); check the sys_id with `
                + `snow_atf_atf_suites_index. ${after}`
            : `The CI/CD API found no ${step} for the run (HTTP 404: ${error.message}). ${after}`, 'NOT_FOUND', error.details);
    }
    if (status === 405) {
        return new ServiceNowError(`The CI/CD API answered HTTP 405 (${error.message}), which ${CICD_PAGE} documents as "Invalid method. The `
            + `functionality is inactive." Ask the instance administrator which CI/CD functionality is inactive here. ${after}`, 'REQUEST_FAILED', error.details);
    }
    if (step === 'run' && status === 400) {
        return new ServiceNowError(`The CI/CD API rejected the run of test suite ${suite} (HTTP 400: ${error.message}). ${after}`, 'INVALID_REQUEST', error.details);
    }
    if (step === 'run') {
        // No answer that says what happened: the run may have started. It was sent once (`callCicd`
        // with no retries), so at most one run exists, and the caller is told where it would be.
        return new ServiceNowError(`${error.message} — the run of test suite ${suite} was sent once and not retried, because a second request `
            + `could start the suite twice; before running it again, look for a new sys_atf_test_suite_result record `
            + `for the suite.`, error.code, error.details);
    }
    return new ServiceNowError(`${error.message} — ${after}`, error.code, error.details);
}
async function cicd(send, step, suite, progressId) {
    try {
        return await send();
    }
    catch (error) {
        throw refusal(error, step, suite, progressId);
    }
}
/**
 * Start the suite, follow its progress until it finishes or the budget runs out, and read its results.
 * Never waits past the budget, and never cancels: a run still going when the budget ends is reported
 * as such, with its ids.
 */
export async function runSuite(client, suite, budgetSeconds) {
    // `retries` 0: the POST that starts a run is sent once (see `callCicd`).
    const started = await cicd(() => client.callCicd('POST', 'testsuite/run', { test_suite_sys_id: suite }, 0), 'run', suite);
    // The page's failure example is a run refused at the start: status 3, and an `error` naming the
    // property that stopped it (`sn_atf.schedule.enabled`). A Failed answer to the run is no run at all.
    if (String(started.status) === '3') {
        throw new ServiceNowError(`The CI/CD API did not start test suite ${suite}: ${reasonOf(started)}. Nothing was run.`, 'REQUEST_FAILED');
    }
    const progressId = started.links?.progress?.id;
    if (typeof progressId !== 'string' || !progressId) {
        throw new ServiceNowError(`The CI/CD API answered the run of test suite ${suite} with no progress id, so the run cannot be followed `
            + `(status ${labelOf(started)}). If it started, its result is a new sys_atf_test_suite_result record for the suite.`, 'REQUEST_FAILED');
    }
    const deadline = Date.now() + budgetSeconds * 1000;
    let progress = started;
    while (!FINISHED.has(String(progress.status))) {
        const left = deadline - Date.now();
        if (left <= 0)
            return unfinished(suite, progressId, progress, budgetSeconds);
        await new Promise((resolve) => { setTimeout(resolve, Math.min(POLL_INTERVAL_MS, left)); });
        progress = await cicd(() => client.callCicd('GET', `progress/${encodeURIComponent(progressId)}`), 'progress', suite, progressId);
    }
    const resultId = progress.links?.results?.id;
    if (typeof resultId !== 'string' || !resultId) {
        if (String(progress.status) === '3') {
            throw new ServiceNowError(`The run of test suite ${suite} failed with no result to read: ${reasonOf(progress)} (CI/CD progress id ${progressId}).`, 'REQUEST_FAILED');
        }
        const label = labelOf(progress);
        return {
            outcome: label.toLowerCase(), status_label: label, suite: { sys_id: suite }, progress_id: progressId,
            budget_seconds: budgetSeconds,
            summary: `The run of test suite ${suite} ended ${label} with no results link, so there are no counts to report `
                + `(CI/CD progress id ${progressId}).`,
        };
    }
    const results = await cicd(() => client.callCicd('GET', `testsuite/results/${encodeURIComponent(resultId)}`), 'results', suite, progressId);
    const name = typeof results.test_suite_name === 'string' && results.test_suite_name ? results.test_suite_name : undefined;
    const counts = {
        success: count(results.rolledup_test_success_count),
        failure: count(results.rolledup_test_failure_count),
        error: count(results.rolledup_test_error_count),
        skipped: count(results.rolledup_test_skip_count),
    };
    const outcome = String(results.test_suite_status || labelOf(progress)).toLowerCase();
    return {
        outcome,
        status_label: labelOf(progress),
        suite: { sys_id: suite, name },
        counts,
        duration: typeof results.test_suite_duration === 'string' ? results.test_suite_duration : undefined,
        result_record: { table: 'sys_atf_test_suite_result', sys_id: resultId },
        progress_id: progressId,
        budget_seconds: budgetSeconds,
        summary: `Test suite ${name ?? suite} ran: ${outcome} — ${counts.success} passed, ${counts.failure} failed, `
            + `${counts.error} with errors, ${counts.skipped} skipped. The run's records are under sys_atf_test_suite_result `
            + `${resultId}; read it with snow_atf_atf_suite_result_read.`,
    };
}
function unfinished(suite, progressId, progress, budgetSeconds) {
    const label = labelOf(progress);
    const resultId = progress.links?.results?.id;
    const known = typeof resultId === 'string' && resultId !== '';
    return {
        outcome: label.toLowerCase(),
        status_label: label,
        suite: { sys_id: suite },
        ...(known ? { result_record: { table: 'sys_atf_test_suite_result', sys_id: resultId } } : {}),
        progress_id: progressId,
        percent_complete: typeof progress.percent_complete === 'number' ? progress.percent_complete : undefined,
        budget_seconds: budgetSeconds,
        summary: `Test suite ${suite} was started and is still ${label} after ${budgetSeconds} s, the budget, so its outcome `
            + 'is not known yet. The run was not cancelled: it continues on the instance, and '
            + (known
                ? `read its result later with snow_atf_atf_suite_result_read (sys_atf_test_suite_result ${resultId}).`
                : `its result will be a new sys_atf_test_suite_result record for the suite (CI/CD progress id ${progressId}).`),
    };
}
/** A reference field as the Table API returns it: a plain value, or `{ link, value }`. */
const refValue = (field) => {
    if (typeof field === 'string')
        return field;
    const value = field?.value;
    return typeof value === 'string' ? value : undefined;
};
/**
 * The suites that hold a test, read from `sys_atf_test_suite_test`, the "Test Suite Test" table
 * (vendor/ServiceNowDocs/markdown/build-workflows/workflow-studio/activate-process-automation-designer-for-app-engine.md)
 * behind a suite's "Test Suite Tests" related list, whose rows have a Test field
 * (vendor/ServiceNowDocs/markdown/application-development/automated-test-framework-atf/atf-add-test-to-suite.md).
 *
 * The column names `test` and `test_suite` are NOT in the corpus; the live README's after-the-fix run
 * reads them. A query naming a column that does not exist is not refused — "the instance ignores the
 * invalid part" and returns rows (vendor/ServiceNowDocs/markdown/api-reference/rest-apis/c_TableAPI.md) —
 * so a row counts only when the test it carries IS this test. A wrong column name then finds no suite
 * and the tool refuses; it can never pick a suite the test is not in.
 */
export async function suitesHolding(client, test) {
    const resp = await client.queryRecords({ table: 'sys_atf_test_suite_test', query: `test=${test}`, fields: 'test,test_suite', limit: 100 });
    const suites = resp.records
        .filter((row) => refValue(row.test) === test)
        .map((row) => refValue(row.test_suite))
        .filter((s) => typeof s === 'string' && s !== '');
    return [...new Set(suites)];
}
/** The most membership rows read for one suite: the client's largest page. */
const SUITE_ROWS = 1000;
/**
 * Test ids per `sys_atf_test` query: `sys_idIN` and a hundred sys_ids come to about 3,300 characters,
 * inside the 4,096 the client allows a query (`validateQuery` in client.ts).
 */
const IDS_PER_QUERY = 100;
/**
 * The tests a suite holds, read from its `sys_atf_test_suite_test` rows (ARC-09-C113), in the order the
 * rows came and each test once. A row counts only when the suite it carries IS this suite — the guard
 * `suitesHolding` has, for the same reason. `capped` says the read stopped at SUITE_ROWS rows.
 */
export async function testsOfSuite(client, suite) {
    const resp = await client.queryRecords({
        table: 'sys_atf_test_suite_test', query: `test_suite=${suite}`, fields: 'test,test_suite', limit: SUITE_ROWS,
    });
    const tests = resp.records
        .filter((row) => refValue(row.test_suite) === suite)
        .map((row) => refValue(row.test))
        .filter((t) => typeof t === 'string' && t !== '');
    return { tests: [...new Set(tests)], capped: resp.records.length >= SUITE_ROWS };
}
/**
 * `snow_atf_atf_tests_index` for one suite (ARC-09-C113). It used to query `sys_atf_test` on
 * `test_suite`, a column the corpus does not put there, and a condition on a column that does not
 * exist is ignored rather than refused (c_TableAPI.md), so the suite filter could drop out and list
 * every active test as the suite's. Now: the suite's tests from its membership rows, then those
 * tests from `sys_atf_test` by `sys_idIN` — "fieldINvalue1,value2,value3"
 * (vendor/ServiceNowDocs/markdown/platform-user-interface/c_EncodedQueryStrings.md) — IDS_PER_QUERY at
 * a time, with the `active` filter the tool always had, up to `limit`. A suite with no rows lists
 * nothing; it never falls back to every test.
 */
export async function listSuiteTests(client, suite, activeOnly, limit) {
    const { tests: ids, capped } = await testsOfSuite(client, suite);
    if (ids.length === 0) {
        return { count: 0, tests: [], summary: `Test suite ${suite} holds no tests: no sys_atf_test_suite_test row names it.` };
    }
    const tests = [];
    for (let i = 0; i < ids.length && tests.length < limit; i += IDS_PER_QUERY) {
        const batch = ids.slice(i, i + IDS_PER_QUERY);
        const query = `${activeOnly ? 'active=true^' : ''}sys_idIN${batch.join(',')}`;
        const resp = await client.queryRecords({ table: 'sys_atf_test', query, limit: limit - tests.length });
        tests.push(...resp.records);
    }
    return {
        count: tests.length,
        tests,
        summary: `Test suite ${suite} holds ${ids.length} test(s)${capped ? ` in its first ${SUITE_ROWS} rows` : ''}, read from `
            + `its sys_atf_test_suite_test rows; ${tests.length} listed${activeOnly ? ', active only' : ''}`
            + `${tests.length >= limit ? `, up to the limit of ${limit}` : ''}.`,
    };
}
/** Names for a list of suites, for a refusal that asks the caller to pick one. */
export async function suiteNames(client, suites) {
    const resp = await client.queryRecords({
        table: 'sys_atf_test_suite', query: suites.map((s) => `sys_id=${s}`).join('^OR'), fields: 'sys_id,name', limit: suites.length,
    });
    const byId = new Map(resp.records.map((r) => [String(r.sys_id), typeof r.name === 'string' ? r.name : undefined]));
    return suites.map((s) => ({ sys_id: s, name: byId.get(s) }));
}
