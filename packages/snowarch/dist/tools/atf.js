import { ServiceNowError } from '../utils/errors.js';
import { requireAtf, requireWrite } from '../utils/permissions.js';
import { addStep, addTest } from './atf-author.js';
import { CICD_PAGE, DEFAULT_BUDGET_SECONDS, MAX_BUDGET_SECONDS, budgetArg, listSuiteTests, runSuite, suiteNames, suitesHolding, sysIdArg, } from './atf-cicd.js';
const BUDGET_PROPERTY = {
    type: 'number',
    description: `How long to wait for the outcome, in seconds, from 1 to ${MAX_BUDGET_SECONDS} (default: ${DEFAULT_BUDGET_SECONDS}). `
        + 'A run still going when it runs out is reported with its ids, not cancelled.',
};
export function atfToolManifest() {
    return [
        {
            name: 'snow_atf_atf_suites_index',
            description: 'List ATF test suites in the instance',
            inputSchema: {
                type: 'object',
                properties: {
                    active: { type: 'boolean', description: 'Filter to active suites only' },
                    query: { type: 'string', description: 'Additional filter' },
                    limit: { type: 'number', description: 'Max results (default: 20)' },
                },
                required: [],
            },
            gate: 'none',
            mutates: false,
        },
        {
            name: 'snow_atf_atf_suite_read',
            description: 'Get details of a test suite including test count',
            inputSchema: {
                type: 'object',
                properties: {
                    sys_id_or_name: { type: 'string', description: 'Test suite sys_id or name' },
                },
                required: ['sys_id_or_name'],
            },
            gate: 'none',
            mutates: false,
        },
        {
            name: 'snow_atf_atf_suite_exec',
            description: 'Run an ATF test suite through the CI/CD API, wait for it within budget_seconds, and return its '
                + 'outcome, the test counts and its sys_atf_test_suite_result record. The account needs the '
                + 'sn_cicd.sys_ci_automation or admin role; a suite with UI tests needs a scheduled Client Test Runner or a '
                + 'headless runner. (requires ATF_ENABLED=true)',
            inputSchema: {
                type: 'object',
                properties: {
                    sys_id: { type: 'string', description: 'System ID of the test suite' },
                    budget_seconds: BUDGET_PROPERTY,
                },
                required: ['sys_id'],
            },
            gate: 'atf',
            mutates: true,
        },
        {
            name: 'snow_atf_atf_tests_index',
            description: 'List ATF test cases. With suite_sys_id, lists the tests that suite holds, read from its Test Suite '
                + 'Tests rows (sys_atf_test_suite_test); a suite with none lists nothing.',
            inputSchema: {
                type: 'object',
                properties: {
                    suite_sys_id: { type: 'string', description: 'System ID of a test suite: list only the tests it holds' },
                    active: { type: 'boolean', description: 'Filter to active tests only' },
                    limit: { type: 'number', description: 'Max results (default: 20)' },
                },
                required: [],
            },
            gate: 'none',
            mutates: false,
        },
        {
            name: 'snow_atf_atf_test_read',
            description: 'Get details of a specific test case',
            inputSchema: {
                type: 'object',
                properties: {
                    sys_id: { type: 'string', description: 'System ID of the test' },
                },
                required: ['sys_id'],
            },
            gate: 'none',
            mutates: false,
        },
        {
            name: 'snow_atf_atf_test_exec',
            description: 'Run an ATF test through the one test suite that holds it: the platform documents no '
                + 'single-test run, so the whole suite runs through the CI/CD API, as snow_atf_atf_suite_exec, and the result '
                + 'says so. Refuses, creating nothing, when the test is in no suite or in several; the refusal lists them. '
                + '(requires ATF_ENABLED=true)',
            inputSchema: {
                type: 'object',
                properties: {
                    sys_id: { type: 'string', description: 'System ID of the test' },
                    budget_seconds: BUDGET_PROPERTY,
                },
                required: ['sys_id'],
            },
            gate: 'atf',
            mutates: true,
        },
        {
            name: 'snow_atf_atf_test_add',
            description: 'Create an ATF test (sys_atf_test) and read it back: every field sent is compared with what the instance '
                + 'stored, and a difference comes back in warnings[]. (requires ATF_ENABLED and WRITE_ENABLED)',
            inputSchema: {
                type: 'object',
                properties: {
                    name: { type: 'string', description: 'Test name' },
                    description: { type: 'string', description: 'Test description' },
                    active: { type: 'boolean', description: 'Whether the test is active (default: true)' },
                },
                required: ['name'],
            },
            gate: 'atf',
            mutates: true,
            alsoRequires: 'write',
        },
        {
            name: 'snow_atf_atf_step_add',
            description: 'Add a step to an ATF test (sys_atf_step) with its input values, and read each record back: the step, each '
                + 'input row, and, from the step\'s side, that each input is attached to it once. Refuses before any write: a test or '
                + 'step config that does not exist, an inactive config, a config name two configs share, an order the test already '
                + 'uses, an input the config does not have, a value longer than its input variable\'s max_length. It lists every '
                + 'input row of the step, including those the instance created from the config\'s defaults, and reports a '
                + 'mandatory input left without a value rather than refusing it, since the instance may default it. A step of the '
                + 'baseline Run Server Side Script config also needs SCRIPTING_ENABLED (other script-bearing configs are not '
                + 'recognised). (requires ATF_ENABLED and WRITE_ENABLED)',
            inputSchema: {
                type: 'object',
                properties: {
                    test: { type: 'string', description: 'System ID of the test' },
                    step_config: { type: 'string', description: 'System ID of the step config, or its exact name (for example "Run Server Side Script")' },
                    order: { type: 'number', description: 'Execution order; leave it out and the instance assigns the next-highest' },
                    active: { type: 'boolean', description: 'Whether the step is active (default: true)' },
                    inputs: { type: 'object', description: 'Input values by input name, as the step config\'s Input Variables name them' },
                },
                required: ['test', 'step_config'],
            },
            gate: 'atf',
            mutates: true,
            alsoRequires: 'write',
        },
        {
            name: 'snow_atf_atf_suite_result_read',
            description: 'Get the results of a test suite run',
            inputSchema: {
                type: 'object',
                properties: {
                    result_sys_id: { type: 'string', description: 'System ID of the suite result record' },
                },
                required: ['result_sys_id'],
            },
            gate: 'none',
            mutates: false,
        },
        {
            name: 'snow_atf_atf_test_results_index',
            description: 'List individual test results within a suite run',
            inputSchema: {
                type: 'object',
                properties: {
                    suite_result_sys_id: { type: 'string', description: 'Filter by suite result sys_id' },
                    limit: { type: 'number', description: 'Max results (default: 50)' },
                },
                required: [],
            },
            gate: 'none',
            mutates: false,
        },
        {
            name: 'snow_atf_atf_failure_insight_read',
            description: 'Get ATF Failure Insight data — metadata changes between last successful and failed run (role changes, field value changes)',
            inputSchema: {
                type: 'object',
                properties: {
                    result_sys_id: { type: 'string', description: 'System ID of the failed suite result' },
                },
                required: ['result_sys_id'],
            },
            gate: 'none',
            mutates: false,
        },
    ];
}
export async function dispatchAtfAction(client, name, args) {
    switch (name) {
        case 'snow_atf_atf_suites_index': {
            let query = args.active !== false ? 'active=true' : '';
            if (args.query)
                query = query ? `${query}^${args.query}` : args.query;
            const resp = await client.queryRecords({ table: 'sys_atf_test_suite', query: query || undefined, limit: args.limit || 20, fields: 'sys_id,name,active,description,sys_updated_on' });
            return { count: resp.count, suites: resp.records };
        }
        case 'snow_atf_atf_suite_read': {
            if (!args.sys_id_or_name)
                throw new ServiceNowError('sys_id_or_name is required', 'INVALID_REQUEST');
            if (/^[0-9a-f]{32}$/i.test(args.sys_id_or_name)) {
                return await client.getRecord('sys_atf_test_suite', args.sys_id_or_name);
            }
            const resp = await client.queryRecords({ table: 'sys_atf_test_suite', query: `name=${args.sys_id_or_name}`, limit: 1 });
            if (resp.count === 0)
                throw new ServiceNowError(`Test suite not found: ${args.sys_id_or_name}`, 'NOT_FOUND');
            return resp.records[0];
        }
        case 'snow_atf_atf_suite_exec': {
            requireAtf();
            if (!args.sys_id)
                throw new ServiceNowError('sys_id is required', 'INVALID_REQUEST');
            return await runSuite(client, sysIdArg(args.sys_id), budgetArg(args.budget_seconds));
        }
        case 'snow_atf_atf_tests_index': {
            const activeOnly = args.active !== false;
            const limit = args.limit || 20;
            // ARC-09-C113: a suite's tests are its sys_atf_test_suite_test rows, not a column on sys_atf_test.
            if (args.suite_sys_id)
                return await listSuiteTests(client, sysIdArg(args.suite_sys_id, 'suite_sys_id'), activeOnly, limit);
            const resp = await client.queryRecords({ table: 'sys_atf_test', query: activeOnly ? 'active=true' : undefined, limit });
            return { count: resp.count, tests: resp.records };
        }
        case 'snow_atf_atf_test_read': {
            if (!args.sys_id)
                throw new ServiceNowError('sys_id is required', 'INVALID_REQUEST');
            return await client.getRecord('sys_atf_test', args.sys_id);
        }
        case 'snow_atf_atf_test_exec': {
            requireAtf();
            if (!args.sys_id)
                throw new ServiceNowError('sys_id is required', 'INVALID_REQUEST');
            const testId = sysIdArg(args.sys_id);
            const budget = budgetArg(args.budget_seconds);
            // The CI/CD API runs suites only (`atf-cicd.ts`), so a test runs through the one suite that holds it.
            const test = await client.getRecord('sys_atf_test', testId, 'sys_id,name');
            if (!test?.sys_id)
                throw new ServiceNowError(`Test not found: ${testId}`, 'NOT_FOUND');
            const named = typeof test.name === 'string' && test.name ? `"${test.name}" (${testId})` : testId;
            const suites = await suitesHolding(client, testId);
            if (suites.length === 0) {
                throw new ServiceNowError(`Test ${named} is in no test suite, and the CI/CD API documents no call that runs one test (${CICD_PAGE}): `
                    + 'put the test in a suite, or run snow_atf_atf_suite_exec. Nothing was run and nothing was created.', 'INVALID_REQUEST');
            }
            if (suites.length > 1) {
                const listed = (await suiteNames(client, suites)).map((s) => `${s.name ? `"${s.name}"` : '(no name)'} (${s.sys_id})`);
                throw new ServiceNowError(`Test ${named} is in ${suites.length} test suites: ${listed.join(', ')}. Each run is a whole suite, so pick `
                    + 'one and run it with snow_atf_atf_suite_exec. Nothing was run.', 'INVALID_REQUEST');
            }
            const run = await runSuite(client, suites[0], budget);
            return {
                ...run,
                test: { sys_id: testId, name: typeof test.name === 'string' ? test.name : undefined },
                ran_through_suite: run.suite,
                summary: `Test ${named} is in one test suite, ${run.suite.name ? `"${run.suite.name}"` : run.suite.sys_id}, and the `
                    + 'platform documents no single-test run, so the whole suite was run through the CI/CD API: its other tests ran '
                    + `too. ${run.summary}`,
            };
        }
        case 'snow_atf_atf_test_add': {
            requireAtf();
            requireWrite();
            return await addTest(client, args);
        }
        case 'snow_atf_atf_step_add': {
            requireAtf();
            requireWrite();
            return await addStep(client, args);
        }
        case 'snow_atf_atf_suite_result_read': {
            if (!args.result_sys_id)
                throw new ServiceNowError('result_sys_id is required', 'INVALID_REQUEST');
            return await client.getRecord('sys_atf_test_suite_result', args.result_sys_id);
        }
        case 'snow_atf_atf_test_results_index': {
            let query = '';
            if (args.suite_result_sys_id)
                query = `test_suite_result=${args.suite_result_sys_id}`;
            const resp = await client.queryRecords({ table: 'sys_atf_result', query: query || undefined, limit: args.limit || 50, fields: 'sys_id,test,status,message,test_suite_result,sys_updated_on' });
            return { count: resp.count, results: resp.records };
        }
        case 'snow_atf_atf_failure_insight_read': {
            if (!args.result_sys_id)
                throw new ServiceNowError('result_sys_id is required', 'INVALID_REQUEST');
            // ATF Failure Insight: query sys_atf_failure_insight table
            const resp = await client.queryRecords({ table: 'sys_atf_failure_insight', query: `test_suite_result=${args.result_sys_id}` });
            return {
                result_sys_id: args.result_sys_id,
                failure_insight: resp.records,
                summary: `Found ${resp.count} metadata change(s) between last passing and failing run`,
                note: 'Failure Insight (latest release) surfaces role changes, field value changes, and configuration diffs that caused test failures',
            };
        }
        default:
            return null;
    }
}
