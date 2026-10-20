// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
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
/** The six codes this classifier can produce. Registered in `src/errors/codes.ts`. */
import { ERROR_CODES, remedyFor } from '../errors/codes.js';
import { bootstrapSpelling, cliSpelling } from '../cli/tty.js';
const DNS = new Set(['ENOTFOUND', 'EAI_AGAIN']);
const TLS_UNTRUSTED = new Set([
    'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
    'SELF_SIGNED_CERT_IN_CHAIN',
    'DEPTH_ZERO_SELF_SIGNED_CERT',
    'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
    'CERT_HAS_EXPIRED',
    'ERR_TLS_CERT_ALTNAME_INVALID',
]);
const TIMEOUT = new Set([
    'ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT',
]);
/**
 * A proxy URL with its userinfo removed.
 *
 * `http://user:pass@proxy:8080` is a perfectly ordinary value of `HTTPS_PROXY`, and every
 * message here names the proxy so the user can see which one was tried. Printing it whole would
 * put a password in an error string, a log line and — through the classifier's remedy — in the
 * audit trail's neighbourhood. The host and port are what identifies the proxy; the credentials
 * identify the user.
 */
export function maskProxyUrl(raw) {
    if (!raw)
        return '(unset)';
    try {
        const u = new URL(raw);
        if (u.username || u.password) {
            u.username = '***';
            u.password = '';
        }
        // `URL` renders `***@` for the userinfo and keeps host, port and protocol intact.
        return u.toString().replace(/\/$/, '');
    }
    catch {
        // Not a URL at all — which is itself worth surfacing, but not by echoing whatever it was:
        // an unparseable value can be anything, including a pasted credential.
        return '(unparseable)';
    }
}
/** Walk `cause` to the deepest system code. undici nests the real reason two levels down. */
/** A request that was aborted — by our own deadline, or by a caller's signal. */
function isAbort(err) {
    const seen = new Set();
    let node = err;
    while (node && typeof node === 'object' && !seen.has(node)) {
        seen.add(node);
        const name = node.name;
        if (name === 'TimeoutError' || name === 'AbortError')
            return true;
        node = node.cause;
    }
    return false;
}
function deepestCode(err) {
    let current = err;
    let found = null;
    for (let depth = 0; current && depth < 8; depth += 1) {
        const code = current.code;
        if (typeof code === 'string')
            found = code;
        current = current.cause;
    }
    return found;
}
/**
 * The registry's MEANING, instantiated the same way its remedy is.
 *
 * `STORE_IN_CLOUD_SYNC_FOLDER` is the first code whose meaning carries values — the provider and
 * the folder — and a second filler for the other half of the same entry would be two places to
 * change a placeholder's name. One substitution, both halves.
 */
export function fillMeaning(code, values = {}) {
    const entry = ERROR_CODES.find((e) => e.code === code);
    return substitute(entry?.meaning ?? '', values);
}
const substitute = (text, { provider, root, global: globalStore }) => text.replaceAll('<provider>', provider ?? 'a cloud provider')
    .replaceAll('<root>', root ?? 'the synced folder')
    .replaceAll('<global>', globalStore ?? 'the global store');
export function fillRemedy(code, values = {}) {
    const { host, proxy, proxyVar, issuer } = values;
    // ARC-07-C32 — this reads the table directly rather than through `remedyFor`, so it fills the
    // launcher placeholders itself. `<cli>` joins `<host>`, `<proxy>` and `<issuer>` as a token the CODE
    // substitutes, rather than `<label>` and `<preset>`, which survive for the reader to fill in.
    // ARC-07-C32 — this file RESOLVES the shell and hands `remedyFor` the two strings, because the
    // registry may not import anything (see its header: `probe-auth` loads it before B04 has run).
    const entry = remedyFor(code, {
        cli: cliSpelling(values.platform, values.env),
        bootstrap: bootstrapSpelling(values.platform, values.env),
    });
    let text = substitute(entry?.remedy ?? '', values);
    // A PARENTHETICAL whose subject is absent goes with it. `(a proxy is configured — …)` reads as
    // a fact when one is, and as noise when none is; `(issuer: )` invites a reader to look for
    // something that was never there. Dropping the whole clause is the only rendering of "we do not
    // know this" that a sentence survives.
    text = proxy
        ? text.replaceAll('<proxyVar>', proxyVar ?? 'HTTPS_PROXY')
            .replaceAll('<proxy>', maskProxyUrl(proxy))
        : dropParenthetical(text, '<proxy>')
            .replaceAll('<proxyVar>', proxyVar ?? 'HTTPS_PROXY')
            .replaceAll('<proxy>', 'the configured proxy');
    text = issuer ? text.replaceAll('<issuer>', issuer) : dropParenthetical(text, '<issuer>');
    return text.replaceAll('<host>', host ?? 'the instance');
}
/** Remove the `(…)` clause containing `token`, and the space before it. */
function dropParenthetical(text, token) {
    const at = text.indexOf(token);
    if (at === -1)
        return text;
    const open = text.lastIndexOf('(', at);
    const close = text.indexOf(')', at);
    if (open === -1 || close === -1)
        return text;
    return `${text.slice(0, open).replace(/\s+$/, '')}${text.slice(close + 1)}`;
}
/** The certificate issuer, when the error carried one. Best effort: a hint, not a claim. */
export function issuerOf(err) {
    const seen = new Set();
    let node = err;
    while (node && typeof node === 'object' && !seen.has(node)) {
        seen.add(node);
        const cert = node.cert;
        if (cert?.issuer?.CN)
            return cert.issuer.CN;
        node = node.cause;
    }
    return undefined;
}
export function classifyNetworkError(err, env = process.env, { host } = {}) {
    const cause = deepestCode(err);
    const proxy = env.HTTPS_PROXY ?? env.https_proxy ?? env.HTTP_PROXY ?? env.http_proxy;
    const proxyVar = (env.HTTPS_PROXY ?? env.https_proxy) ? 'HTTPS_PROXY' : 'HTTP_PROXY';
    const remedyFor = (code, issuer) => fillRemedy(code, { host, proxy, proxyVar, issuer });
    if (cause && DNS.has(cause)) {
        return { code: 'DNS_FAILURE', cause, remedy: remedyFor('DNS_FAILURE') };
    }
    if (cause && TLS_UNTRUSTED.has(cause)) {
        // The registry text is the one that says never `NODE_TLS_REJECT_UNAUTHORIZED=0` — the first
        // thing people reach for, and the one that means trusting the interceptor and everything else.
        return {
            code: 'TLS_CA_UNTRUSTED',
            cause,
            remedy: remedyFor('TLS_CA_UNTRUSTED', issuerOf(err)),
        };
    }
    if (cause === 'ECONNREFUSED') {
        // A refused connection when a proxy is set is almost always the PROXY refusing, not the
        // instance: the client never opens a socket to the instance at all. Reporting
        // CONNECTION_REFUSED there would send the user to check a host that was never contacted.
        return proxy
            ? { code: 'PROXY_UNREACHABLE', cause, remedy: remedyFor('PROXY_UNREACHABLE') }
            : { code: 'CONNECTION_REFUSED', cause, remedy: remedyFor('CONNECTION_REFUSED') };
    }
    // An ABORTED request is a timeout too, and it carries no `code` at all: `AbortSignal.timeout`
    // rejects with a `TimeoutError` DOMException, so `deepestCode` finds nothing and the request
    // would have been classified `NETWORK_ERROR` — "run the doctor" — for the one failure whose
    // remedy is the most specific of the six. Added by ARC-07-S02, whose probe sets its own
    // deadline; every other caller that passes a signal gets it as well.
    const aborted = isAbort(err);
    if (aborted || (cause && TIMEOUT.has(cause))) {
        return proxy
            ? { code: 'PROXY_UNREACHABLE', cause, remedy: remedyFor('PROXY_UNREACHABLE') }
            : { code: 'CONNECTION_TIMEOUT', cause, remedy: remedyFor('CONNECTION_TIMEOUT') };
    }
    // The unclassified case keeps the raw code in the text, because "the request failed" with no
    // system code is a sentence nobody can act on — and the registry entry cannot know it.
    return {
        code: 'NETWORK_ERROR',
        cause,
        remedy: cause ? `${remedyFor('NETWORK_ERROR')} (the system code was ${cause})`
            : remedyFor('NETWORK_ERROR'),
    };
}
