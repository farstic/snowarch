import { classifyNetworkError, fillRemedy, issuerOf, maskProxyUrl } from './net-errors.js';
import { snFetch } from './http.js';
/** HTTP 407 is a RESPONSE, so the network classifier never sees it. The probe maps it. */
export const PROXY_AUTH_STATUS = 407;
/** Re-exported so the wizard's own callers have one import for the remedy rendering. */
export { fillRemedy, issuerOf };
const proxyOf = (env) => env.HTTPS_PROXY ?? env.https_proxy ?? env.HTTP_PROXY ?? env.http_proxy;
/**
 * One `HEAD` against the origin.
 *
 * ANY status other than 407 is a success, including 302 and 401: the question is "did the
 * request reach the instance", and a login redirect is the clearest possible yes. Treating 401
 * as a failure here would report an unreachable instance to a user whose password is simply not
 * the subject yet.
 */
export async function probeReachability(url, { timeoutMs = 10_000, env = process.env, fetchImpl = snFetch, now = () => Date.now(), } = {}) {
    const host = new URL(url).host;
    const started = now();
    const elapsed = () => Math.max(0, now() - started);
    try {
        // OUR deadline, as a signal: `snFetch` takes undici's `RequestInit` and has no timeout of its
        // own, and a probe with no deadline is a wizard that hangs on a network that drops packets
        // rather than refusing them. The abort is classified as a timeout (see `net-errors.ts`).
        const response = await fetchImpl(`${new URL(url).origin}/`, { method: 'HEAD', signal: AbortSignal.timeout(timeoutMs) });
        if (response.status === PROXY_AUTH_STATUS) {
            return {
                ok: false,
                code: 'PROXY_AUTH_REQUIRED',
                cause: String(PROXY_AUTH_STATUS),
                remedy: fillRemedy('PROXY_AUTH_REQUIRED', { host, proxy: proxyOf(env) }),
                latencyMs: elapsed(),
            };
        }
        return { ok: true, status: response.status, latencyMs: elapsed() };
    }
    catch (err) {
        // A 407 can arrive as a THROW instead of a response, depending on how the proxy agent
        // surfaces it — the story's open point. Both paths end at the same code.
        if (isProxyAuth(err)) {
            return {
                ok: false,
                code: 'PROXY_AUTH_REQUIRED',
                cause: String(PROXY_AUTH_STATUS),
                remedy: fillRemedy('PROXY_AUTH_REQUIRED', { host, proxy: proxyOf(env) }),
                latencyMs: elapsed(),
            };
        }
        // The classifier renders the registry itself now (ARC-07-S03's collapse), so the remedy is
        // taken as it comes: filling it a second time here would be the second opinion this story
        // removed.
        const diagnosis = classifyNetworkError(err, env, { host });
        return {
            ok: false,
            code: diagnosis.code,
            cause: diagnosis.cause ?? null,
            remedy: diagnosis.remedy,
            latencyMs: elapsed(),
        };
    }
}
/** A thrown 407, in the shapes a proxy agent produces. */
function isProxyAuth(err) {
    const seen = new Set();
    let node = err;
    while (node && typeof node === 'object' && !seen.has(node)) {
        seen.add(node);
        const e = node;
        if (e.statusCode === PROXY_AUTH_STATUS || e.status === PROXY_AUTH_STATUS)
            return true;
        if (e.code === 'ERR_PROXY_AUTH_REQUIRED')
            return true;
        if (typeof e.message === 'string' && /\b407\b/.test(e.message))
            return true;
        node = node.cause;
    }
    return false;
}
/**
 * The network state, in one line, printed whether the probe succeeds or not.
 *
 * A support reader is looking at a transcript, not at the machine. "It worked" and "it worked
 * through a proxy with a corporate CA" are different facts, and only one of them explains why the
 * same command fails for their colleague. Userinfo is masked here and in every remedy — the whole
 * line is written for a screen share.
 */
export function describeNetworkEnv(env = process.env) {
    const proxy = proxyOf(env);
    const noProxy = env.NO_PROXY ?? env.no_proxy;
    const ca = env.NODE_EXTRA_CA_CERTS;
    return `network: HTTPS_PROXY=${proxy ? `set (${maskProxyUrl(proxy)})` : 'unset'}`
        + ` · NO_PROXY=${noProxy && noProxy !== '' ? noProxy : 'unset'}`
        + ` · NODE_EXTRA_CA_CERTS=${ca && ca !== '' ? ca : 'unset'}`;
}
/** The two lines a failed probe prints, in the story's exact shape. */
export function formatFailure(result) {
    return [
        `reachability: FAIL ${result.code} — ${result.cause ?? 'no response'}`,
        `  remedy: ${result.remedy}`,
    ];
}
/**
 * What the wizard offers after a failed probe. THREE options, and none of them is "continue
 * anyway".
 *
 * P-23: the wizard this replaces offered exactly that, and a user who took it saved an instance
 * that had never answered — the failure then reappeared later, in a tool call, with no memory of
 * this moment. Nothing is saved from here except by going back and succeeding.
 */
export function reachabilityMenu() {
    return [
        { key: 'reenter', text: 're-enter the URL' },
        { key: 'retry', text: 'retry' },
        { key: 'abort', text: 'abort (nothing is saved)' },
    ];
}
