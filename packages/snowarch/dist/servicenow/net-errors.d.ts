/**
 * Turn a network failure into a name, a cause and something to do about it.
 *
 * R-3 exists because the failure a corporate laptop actually produces is `TypeError: fetch
 * failed` with the real reason two `cause` levels down, and that message is indistinguishable
 * between "your instance host name is wrong", "your company intercepts TLS and we do not trust
 * the certificate" and "your proxy is not listening". Those have three different remedies and
 * only one of them is the user's typo, so a first live session that fails with `fetch failed`
 * sends people to the wrong place — usually to their credentials, which are fine.
 */
export type NetworkErrorCode = 'DNS_FAILURE' | 'TLS_CA_UNTRUSTED' | 'PROXY_UNREACHABLE' | 'CONNECTION_REFUSED' | 'CONNECTION_TIMEOUT' | 'NETWORK_ERROR';
export interface NetworkDiagnosis {
    code: NetworkErrorCode;
    /** The underlying system code, e.g. `ENOTFOUND` — kept so a report can be traced back. */
    cause: string | null;
    remedy: string;
}
/**
 * A proxy URL with its userinfo removed.
 *
 * `http://user:pass@proxy:8080` is a perfectly ordinary value of `HTTPS_PROXY`, and every
 * message here names the proxy so the user can see which one was tried. Printing it whole would
 * put a password in an error string, a log line and — through the classifier's remedy — in the
 * audit trail's neighbourhood. The host and port are what identifies the proxy; the credentials
 * identify the user.
 */
export declare function maskProxyUrl(raw: string | undefined): string;
/**
 * Classify a thrown fetch error.
 *
 * `env` is a parameter so the tests can classify against a chosen proxy setting without
 * mutating the process — and so the remedy names the variable the SERVER read, not whatever
 * the environment happens to hold when the message is finally rendered.
 */
/**
 * The registry template, instantiated — the ONE place a network remedy is written.
 *
 * Until ARC-07-S03 this file carried its own remedy strings and `ERROR_CODES` carried others, so
 * one condition had two texts: the server said one thing and the wizard another, and the contract
 * published the second. A remedy repeated in two places is one to correct and one that will not
 * be. `<issuer>` is dropped with its parenthesis when the certificate did not say — "(issuer: )"
 * invites a reader to look for something that is not there — and `<host>` falls back to "the
 * instance" for a caller that has no URL to hand.
 */
export interface RemedyValues {
    host?: string | undefined;
    proxy?: string | undefined;
    proxyVar?: string | undefined;
    issuer?: string | undefined;
    /** ARC-07-C32 — the shell the launcher placeholders are filled for; the process when absent. */
    platform?: NodeJS.Platform | undefined;
    env?: NodeJS.ProcessEnv | undefined;
    /** ARC-07-S07's three, for `STORE_IN_CLOUD_SYNC_FOLDER`. */
    provider?: string | undefined;
    root?: string | undefined;
    global?: string | undefined;
}
/**
 * The registry's MEANING, instantiated the same way its remedy is.
 *
 * `STORE_IN_CLOUD_SYNC_FOLDER` is the first code whose meaning carries values — the provider and
 * the folder — and a second filler for the other half of the same entry would be two places to
 * change a placeholder's name. One substitution, both halves.
 */
export declare function fillMeaning(code: string, values?: RemedyValues): string;
export declare function fillRemedy(code: string, values?: RemedyValues): string;
/** The certificate issuer, when the error carried one. Best effort: a hint, not a claim. */
export declare function issuerOf(err: unknown): string | undefined;
export declare function classifyNetworkError(err: unknown, env?: NodeJS.ProcessEnv, { host }?: {
    host?: string;
}): NetworkDiagnosis;
