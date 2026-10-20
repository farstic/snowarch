// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * Which instance is this call addressed to?
 *
 * Before ARC-04-S03 the answer was "whatever `process.env` says", which is process-global:
 * one server could not hold a PDI and a customer's production instance at once, and
 * `snow_core_instance_switch` moved the client without moving the permission flags (P-03,
 * the process-global half of P-24).
 *
 * `AsyncLocalStorage` carries the instance for the duration of one request. The alternative
 * — threading an instance argument through every dispatcher — would touch **166 `require*()`
 * call sites**, and every one of them is a place to get it wrong. This way the gates keep
 * their zero-argument signatures and read the ambient instance instead of the environment.
 *
 * Stable since Node 16; the floor is Node 20.
 */
import { NO_INSTANCE_MESSAGE } from '../no-instance.js';
import { AsyncLocalStorage } from 'node:async_hooks';
import { ServiceNowError } from '../utils/errors.js';
import { cliSpelling } from '../cli/tty.js';
export const FLAG_NAMES = [
    'WRITE_ENABLED', 'CMDB_WRITE_ENABLED', 'SCRIPTING_ENABLED',
    'ATF_ENABLED', 'NOW_ASSIST_ENABLED', 'FLUENT_ENABLED',
];
const als = new AsyncLocalStorage();
export function runWithInstance(rt, fn) {
    return als.run(rt, fn);
}
/**
 * The ambient instance. Throwing rather than returning a permissive default is the point:
 * a gate that cannot tell which instance it is protecting must not decide it is allowed.
 */
export function currentInstance() {
    const rt = als.getStore();
    if (!rt) {
        throw new ServiceNowError(NO_INSTANCE_MESSAGE(cliSpelling()), 'NO_INSTANCE_CONFIGURED');
    }
    return rt;
}
/**
 * Enter an instance for the rest of this synchronous run and its async continuations.
 *
 * TEST GLUE ONLY, and production never calls it: the server uses `runWithInstance`, which
 * scopes the instance to exactly one request and cannot leak into the next. `enterWith` has
 * no such boundary, which is what makes it usable from a `beforeEach` and unsuitable for a
 * request handler.
 */
export function enterInstance(rt) {
    als.enterWith(rt);
}
/**
 * Run OUTSIDE any instance. Test glue: `tests/setup.ts` enters a runtime before every test,
 * so without this there is no way left to observe the no-instance state — and that state is
 * a real production property worth asserting (a gate that cannot tell which instance it is
 * protecting must refuse, not allow).
 */
export function outsideInstance(fn) {
    return als.exit(fn);
}
/** For tests and for callers that must not throw — the server's capability read, notably. */
export function currentInstanceOrNull() {
    return als.getStore() ?? null;
}
