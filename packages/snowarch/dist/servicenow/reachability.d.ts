/**
 * ARC-07-S02 — is the instance reachable, and if not, WHICH of DNS, TLS or a proxy is in the way.
 *
 * R-3: on a corporate laptop "unreachable" is not a diagnosis, it is the start of an afternoon.
 * The three failures that produce it look identical from the outside and need completely
 * different actions — a name that does not resolve, a gateway presenting its own certificate, a
 * proxy that is not there — so the probe names the one that happened and prints the remedy for
 * it, with the host and the (masked) proxy substituted in.
 *
 * Two things this file deliberately does NOT do:
 *
 *   IT OPENS NO HTTP CALL SITE OF ITS OWN. Everything goes through ARC-04-S11's `snFetch`, so the
 *   proxy agent and `NODE_EXTRA_CA_CERTS` apply — a probe that bypassed them would report a
 *   reachability the real client does not have, which is worse than no probe. (This sentence used
 *   to name the global function it avoids, which made this file a hit in the very sweep that
 *   enforces the rule: `tests/servicenow/proxy.test.ts` greps `src/` for the call, and a comment
 *   is text like any other. Eleventh time in this repository.)
 *
 *   IT ADDS NO SECOND ERROR CLASSIFIER. `classifyNetworkError` decides the code, and the REMEDY
 *   text comes from `ERROR_CODES` — the one table `docs/TROUBLESHOOTING.md` and the doctor render
 *   too. Two remedy texts for one condition is how a user gets told two different things.
 */
import { type ErrorCodeName } from '../errors/codes.js';
import { fillRemedy, issuerOf } from './net-errors.js';
import { snFetch } from './http.js';
export interface ReachabilityOk {
    ok: true;
    status: number;
    latencyMs: number;
}
export interface ReachabilityFail {
    ok: false;
    code: ErrorCodeName;
    /** The underlying code, when there was one — `ENOTFOUND`, `UND_ERR_CONNECT_TIMEOUT`, … */
    cause: string | null;
    /** The registry remedy with `<host>`, `<proxy>` and `<issuer>` filled in. */
    remedy: string;
    latencyMs: number;
}
export type Reachability = ReachabilityOk | ReachabilityFail;
/** HTTP 407 is a RESPONSE, so the network classifier never sees it. The probe maps it. */
export declare const PROXY_AUTH_STATUS = 407;
/** Re-exported so the wizard's own callers have one import for the remedy rendering. */
export { fillRemedy, issuerOf };
/**
 * One `HEAD` against the origin.
 *
 * ANY status other than 407 is a success, including 302 and 401: the question is "did the
 * request reach the instance", and a login redirect is the clearest possible yes. Treating 401
 * as a failure here would report an unreachable instance to a user whose password is simply not
 * the subject yet.
 */
export declare function probeReachability(url: string, { timeoutMs, env, fetchImpl, now, }?: Partial<{
    timeoutMs: number;
    env: NodeJS.ProcessEnv;
    fetchImpl: typeof snFetch;
    now: () => number;
}>): Promise<Reachability>;
/**
 * The network state, in one line, printed whether the probe succeeds or not.
 *
 * A support reader is looking at a transcript, not at the machine. "It worked" and "it worked
 * through a proxy with a corporate CA" are different facts, and only one of them explains why the
 * same command fails for their colleague. Userinfo is masked here and in every remedy — the whole
 * line is written for a screen share.
 */
export declare function describeNetworkEnv(env?: NodeJS.ProcessEnv): string;
/** The two lines a failed probe prints, in the story's exact shape. */
export declare function formatFailure(result: ReachabilityFail): string[];
export interface MenuOption {
    key: string;
    text: string;
}
/**
 * What the wizard offers after a failed probe. THREE options, and none of them is "continue
 * anyway".
 *
 * P-23: the wizard this replaces offered exactly that, and a user who took it saved an instance
 * that had never answered — the failure then reappeared later, in a tool call, with no memory of
 * this moment. Nothing is saved from here except by going back and succeeding.
 */
export declare function reachabilityMenu(): MenuOption[];
