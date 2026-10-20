// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * The one place this package makes an HTTP request.
 *
 * Node's global `fetch` ignores `HTTPS_PROXY`, `HTTP_PROXY` and `NO_PROXY` entirely (R-15).
 * That is not a bug — WHATWG fetch says nothing about proxy variables — but it means a laptop
 * on a corporate network gets `fetch failed` from a client that never tried the proxy, while
 * `curl` to the same URL works, which reads as "the tool is broken".
 *
 * `undici` is the same implementation Node bundles, published separately so a dispatcher can be
 * attached. `EnvHttpProxyAgent` reads the proxy variables **when it is constructed**, which is
 * why `env-sanitise.ts` runs first at both entry points and why the agent is built lazily here
 * rather than at module load: a test that sets `HTTPS_PROXY` and then imports this module would
 * otherwise be configuring an agent that already exists.
 *
 * `grep -rn "\bfetch(" src` is expected to show only this file. That is criterion 7, and the
 * reason for it is that a second call site is a second place where proxy support silently does
 * not apply — and it would fail only on the machines least able to debug it.
 */
import { Agent, EnvHttpProxyAgent, fetch as undiciFetch, getGlobalDispatcher } from 'undici';
let dispatcher;
let connectOptions;
export function dispatcherKind(env = process.env, connect) {
    if (proxyConfigured(env))
        return 'proxy';
    return connect ? 'connect' : 'global';
}
/**
 * Built on first use, then reused: one connection pool for the process.
 *
 * Constructing an agent per request would defeat keep-alive and open a new socket every time —
 * on a proxied network, a new CONNECT tunnel every time.
 */
function getDispatcher() {
    if (!dispatcher) {
        /*
         * ARC-07-C44 — THE PROXY AGENT IS BUILT ONLY WHEN THERE IS A PROXY.
         *
         * `EnvHttpProxyAgent` is flagged experimental by undici, so CONSTRUCTING it prints
         * `[UNDICI-EHPA] Warning: EnvHttpProxyAgent is experimental` plus a `--trace-warnings` line to
         * stderr — once per process, on the first request. Measured in the owner's 2.0.7 upgrade run,
         * where E-26 reported no proxy configured: the warning was printed anyway, because the agent was
         * built unconditionally. A machine with no proxy was being warned about a proxy feature it was
         * not using.
         *
         * The fix is the condition, NOT a suppressed warning. `process.noDeprecation`, a
         * `--no-warnings` flag or a `warning` listener would hide every other warning Node has to give
         * us, including ones about the code we are about to ship. On a machine that IS proxied the agent
         * is built and the warning prints — that one is true, and it names the feature actually in use.
         *
         * `connect` keeps its own arm: it is the test seam for a custom `lookup`, and a test that sets
         * it with no proxy still needs a dispatcher that honours it. `Agent` is undici's ordinary pooling
         * dispatcher and is not experimental, so that arm prints nothing either.
         */
        const kind = dispatcherKind(process.env, connectOptions);
        if (kind === 'proxy') {
            dispatcher = new EnvHttpProxyAgent(connectOptions ? { connect: connectOptions } : undefined);
        }
        else if (kind === 'connect') {
            dispatcher = new Agent({ connect: connectOptions });
        }
        else {
            // No proxy and no seam: undici's global dispatcher, which is what `fetch` would use anyway.
            dispatcher = getGlobalDispatcher();
        }
    }
    return dispatcher;
}
/**
 * Drop the cached agent so the next request rebuilds it from the current environment.
 *
 * For tests only. Production code changes no proxy variable after start-up, and a caller that
 * did would be changing where requests go mid-session — which is the kind of thing
 * `snow_core_instance_switch` exists to make visible rather than something to support quietly.
 *
 * `connect` is the same escape hatch, for the same audience: undici passes these straight to
 * `net.connect`, so a test can supply its own `lookup` and make a name fail to resolve WITHOUT
 * asking the machine's resolver. That matters because the alternative — pointing a test at a
 * name that "cannot resolve" — is a test that depends on the network it is trying not to use, and
 * it failed exactly that way on a macOS runner where something answered for a `.invalid` host.
 *
 * Passing nothing clears both, so the seam cannot leak from one test into the next: the existing
 * `afterEach` calls this with no arguments and gets the production agent back for free.
 */
export function resetHttpDispatcher(connect) {
    dispatcher = undefined;
    connectOptions = connect;
}
/** True when a proxy variable is set to a non-empty value — for diagnostics, not for routing. */
export function proxyConfigured(env = process.env) {
    return Boolean(env.HTTPS_PROXY || env.https_proxy || env.HTTP_PROXY || env.http_proxy);
}
/** `fetch`, through the proxy agent. Same signature as the global. */
export function snFetch(url, init = {}) {
    return undiciFetch(url, { ...init, dispatcher: getDispatcher() });
}
