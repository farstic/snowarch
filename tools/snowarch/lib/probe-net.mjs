// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-06-S04 — can this machine reach github.com, and if not, WHICH wall did it hit?
//
// "The clone failed" is not a diagnosis. Behind a corporate proxy the same symptom has four causes
// with four different fixes, and the whole value of doing this in the preflight is telling the
// operator which one before they have watched a clone time out.
//
// Stdlib only, and the proxy path is hand-rolled for that reason: with `HTTPS_PROXY` set, open a
// plain socket to the proxy, send `CONNECT github.com:443`, and run TLS over the tunnel it returns.
// That is what an agent library would do, and this way the bootstrap still has no dependencies.
import { NOTFOUND } from 'node:dns';
import { constants } from 'node:os';
import { connect as netConnect } from 'node:net';
import { connect as tlsConnect } from 'node:tls';
import { request as httpsRequest } from 'node:https';
import * as SENTENCE from './net-sentences.mjs';

export const DEFAULT_TARGET = 'https://github.com/';
export const DEFAULT_TIMEOUT_MS = 10_000;

/** The two "did not probe" sentences live with the others, in `net-sentences.mjs`. */
export const LOCAL_UPSTREAM = SENTENCE.localUpstream;
export const UNPROBEABLE_UPSTREAM = SENTENCE.unprobeableUpstream;

/**
 * WHAT THIS RUN WILL ACTUALLY CONTACT, from the configuration (ARC-09-C29).
 *
 * B00 used to probe `https://github.com/<repo>.git` — the PRODUCT repository — as a stand-in for
 * "is github.com up". Nothing in a bootstrap run contacts that remote: the docs step (B02) fetches
 * `docs.upstream`, the deps step (B04) talks to the npm registry in live mode, and `upgrade` uses
 * the checkout's own `origin`. So the check asked about a host the run does not use and stayed
 * silent about the one it does — a user on an internal corpus mirror passed B00 and failed at B02,
 * which is the failure a preflight exists to move forward.
 *
 * It probes the corpus remote now. In the default configuration that IS github.com, so nothing
 * changes for anyone; the floor is a consequence of what is configured rather than a constant.
 *
 * A LOCAL upstream — `file://`, or a bare path — needs no network, and saying so out loud is the
 * point: a check that quietly stops checking is worse than one that never existed.
 */
export function corpusProbe(upstream) {
  const value = String(upstream ?? '').trim();
  if (value === '') return { local: true, reason: 'no corpus upstream configured — no probe' };
  let url;
  // A bare path is not a URL, and `file:` is a URL with no host. Both mean the same thing here:
  // nothing leaves the machine.
  try { url = new URL(value); } catch { return { local: true, reason: LOCAL_UPSTREAM }; }
  if (url.protocol === 'file:') return { local: true, reason: LOCAL_UPSTREAM };
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    // `ssh://`, `git://`: REMOTE, and this probe cannot speak to it. Skipping is still the
    // outcome, and the reason must not be "local" — that would be the same kind of untrue
    // statement about what the check did that C29 exists to remove, one scheme further along.
    return { local: false, probe: false, scheme: url.protocol.replace(':', ''),
      reason: UNPROBEABLE_UPSTREAM(url.protocol.replace(':', '')) };
  }
  return { local: false, probe: true, host: url.hostname, target: `${url.protocol}//${url.host}/` };
}

/**
 * DNS · TLS · refused: the three error families, taken from Node's own tables rather than typed.
 *
 * `node:dns` exports its resolver codes as constants and `os.constants.errno` is the errno table,
 * so the names come from the authority that produces them. That is worth doing for its own sake —
 * a typo in a quoted code silently disables a whole branch — and it is also what the
 * no-literal-names guard requires: three of these are spelled identically to names the MCP contract
 * owns, and a quoted copy here is indistinguishable from a contract name typed into engine tooling.
 *
 * `errno` maps NAME → number, so the numbers are looked up by property access and turned back into
 * names through the reverse map.
 */
const ERRNO_NAME = new Map(Object.entries(constants.errno).map(([name, n]) => [n, name]));
const errnoNames = (...numbers) => new Set(numbers.map((n) => ERRNO_NAME.get(n)).filter(Boolean));

// `node:dns` publishes NOTFOUND and not the retryable one: `EAI_AGAIN` comes from libuv's
// getaddrinfo path and appears in neither the dns constants nor `os.constants.errno`. It is
// therefore written out, which is also fine by the name guard — unlike the other three, nothing in
// the contract is spelled that way.
const DNS_CODES = new Set([NOTFOUND, 'EAI_AGAIN']);
const REFUSED_CODES = errnoNames(constants.errno.ECONNREFUSED, constants.errno.ETIMEDOUT,
  constants.errno.EHOSTUNREACH, constants.errno.ENETUNREACH, constants.errno.ECONNRESET,
  constants.errno.EPIPE);
export const TIMED_OUT = ERRNO_NAME.get(constants.errno.ETIMEDOUT);
const isTlsCode = (code) => typeof code === 'string'
  && (code.startsWith('CERT_') || code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE'
    || code === 'SELF_SIGNED_CERT_IN_CHAIN' || code === 'DEPTH_ZERO_SELF_SIGNED_CERT'
    || code === 'ERR_TLS_CERT_ALTNAME_INVALID');

/**
 * Does `NO_PROXY` exempt this host?
 *
 * `*` exempts everything, a leading dot is a suffix match, and a bare hostname matches itself and
 * its subdomains — the de-facto rules every tool implements slightly differently. Getting this
 * wrong sends a request through a proxy the operator deliberately excluded.
 */
export function bypassesProxy(host, noProxy) {
  const list = String(noProxy ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (list.includes('*')) return true;
  const h = String(host).toLowerCase();
  return list.some((entry) => {
    const e = entry.replace(/^\./, '');
    return h === e || h.endsWith(`.${e}`);
  });
}

/** The proxy in force for `host`, or null. `env` is a parameter so tests never touch the real one. */
export function proxyFor(host, env = process.env) {
  const configured = env.HTTPS_PROXY || env.https_proxy || null;
  if (!configured) return null;
  if (bypassesProxy(host, env.NO_PROXY || env.no_proxy)) return null;
  return configured;
}

/**
 * An error → the sentence, and the sentence comes from the shared module.
 *
 * With a proxy configured, a refusal is about the PROXY and not about github.com: telling someone
 * to check whether they are offline when their proxy address has a typo sends them to the wrong
 * problem. That precedence is ARC-03-S05's rule, applied to a different transport.
 */
export function classifyNetFailure(err, { host, proxy = null } = {}) {
  const code = err?.code ?? null;
  if (isTlsCode(code)) return SENTENCE.tlsIntercepted({ tool: SENTENCE.TOOL.node });
  if (DNS_CODES.has(code)) {
    return proxy ? SENTENCE.proxyUnreachable(proxy) : SENTENCE.dnsFailure(host);
  }
  if (REFUSED_CODES.has(code)) {
    return proxy ? SENTENCE.proxyUnreachable(proxy) : SENTENCE.noRoute(host);
  }
  if (code === 'ETIMEDOUT_PROBE') {
    return proxy ? SENTENCE.proxyUnreachable(proxy) : SENTENCE.noRoute(host);
  }
  return proxy ? SENTENCE.proxyUnreachable(proxy) : SENTENCE.noRoute(host);
}

/**
 * ARC-09-C40 — could a second probe plausibly survive this?
 *
 * The same question `transientReason` asks of git's stderr, asked of what THIS probe returns: an
 * errno or DNS code, or an HTTP status. It is deliberately NOT `transientReason`: that classifier
 * reads libcurl's words as git surfaces them, and applying it here would mean rendering structured
 * codes back into prose so a text matcher could read them — throwing away better evidence than the
 * one we would be reconstructing.
 *
 * What IS shared is the rule, stated once in `transientReason` and applied here unchanged: 408,
 * 429 and any 5xx are the upstream asking to be asked again, and any other 4xx is a statement
 * about the request that repeating does not change. The code families come from this module's own
 * sets, never a second copy of them.
 *
 * Returns the LABEL the retry line prints, or `null` for "do not retry" — the same shape as
 * `transientReason`, and for the same reason: a pause that will not say what it is waiting out is
 * a pause nobody can debug from a CI log.
 */
export function probeRetryReason({ code = null, status = null } = {}) {
  // An HTTP answer means the network worked; only the server's verdict is in question.
  if (status !== null) return (status === 408 || status === 429 || status >= 500) ? `HTTP ${status}` : null;
  if (code === null) return null;            // unclassified: do not spend the schedule on a guess
  // PERMANENT WINS, consulted first, as it is in `transientReason`. A name that does not resolve
  // and an intercepted TLS chain are both settled answers: three more attempts cost 12 s and
  // return the same sentence.
  if (isTlsCode(code) || code === NOTFOUND) return null;
  if (code === 'EAI_AGAIN') return 'temporary DNS failure';
  if (code === 'ETIMEDOUT_PROBE') return 'probe timed out';
  if (REFUSED_CODES.has(code)) return code;
  return null;
}

/** Open a CONNECT tunnel through the proxy, then hand back a socket TLS can run over. */
function tunnel({ proxyUrl, host, port, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const u = new URL(/^[a-z]+:\/\//i.test(proxyUrl) ? proxyUrl : `http://${proxyUrl}`);
    const socket = netConnect({
      host: u.hostname, port: Number(u.port || (u.protocol === 'https:' ? 443 : 80)),
    });
    // Every exit from this promise goes through `settle`. A proxy that accepts the connection and
    // then closes it cleanly emits `close`, not `error` — so without this the probe simply hung,
    // which is the one outcome a preflight must never have: a bootstrap that never returns is
    // worse than one that fails, because there is nothing to report and nothing to fix.
    let settled = false;
    const settle = (fn, value) => { if (settled) return; settled = true; socket.setTimeout(0); fn(value); };
    const fail = (code) => {
      const e = new Error(`proxy connection failed (${code})`); e.code = code;
      socket.destroy();
      settle(reject, e);
    };
    socket.setTimeout(timeoutMs, () => fail(TIMED_OUT));
    socket.on('error', (e) => { socket.destroy(); settle(reject, e); });
    socket.on('close', () => fail('ECONNRESET'));
    socket.on('connect', () => {
      // No credentials are ever put on this line. A proxy that needs authentication is a case this
      // preflight reports rather than solves — sending a header assembled from the operator's
      // environment would mean this module handling a password, and it never does.
      socket.write(`CONNECT ${host}:${port} HTTP/1.1\r\nHost: ${host}:${port}\r\n\r\n`);
    });
    socket.once('data', (chunk) => {
      const status = /^HTTP\/1\.[01] (\d{3})/.exec(chunk.toString('latin1'));
      if (status && status[1].startsWith('2')) { settle(resolve, socket); return; }
      fail(status ? `EPROXY_${status[1]}` : 'EPROXY_GARBLED');
    });
  });
}

/**
 * `HEAD <target>`, through a proxy when one applies.
 *
 * `request` is injectable so the unit tests never open a socket, and `target` so the integration
 * tests can point at a local fixture server. Any 2xx/3xx is a pass: this asks "can I get there",
 * not "what does the page say", and a redirect is a successful round trip through every wall.
 */
export async function probeNetwork({ target = DEFAULT_TARGET, env = process.env,
  timeoutMs = DEFAULT_TIMEOUT_MS, request = httpsRequest, tlsFactory = tlsConnect } = {}) {
  const url = new URL(target);
  const host = url.hostname;
  const port = Number(url.port || 443);
  const proxy = proxyFor(host, env);

  // A ceiling over the WHOLE probe, not only over each socket. The story's budget is a number of
  // seconds the operator waits, and three sequential 10-second waits inside one step is not that
  // number however careful each individual timeout is.
  //
  // ARC-09-C76: a REF'D timer, cleared in `finally`. Unref'd, the one thing guaranteed to settle the
  // race was invisible to the event loop, so a request pending without a handle of its own left a
  // probe that never settled and a process that ended under it. Cleared, it still does not hold a
  // process whose probe has already answered.
  let ceiling;
  try {
    const deadline = new Promise((_, rej) => {
      ceiling = setTimeout(() => {
        const e = new Error('probe timed out'); e.code = 'ETIMEDOUT_PROBE'; rej(e);
      }, timeoutMs);
    });
    const socket = proxy
      ? await Promise.race([tunnel({ proxyUrl: proxy, host, port, timeoutMs }), deadline])
      : null;
    const status = await Promise.race([deadline, new Promise((resolve, reject) => {
      const options = { method: 'HEAD', host, port, path: url.pathname || '/', timeout: timeoutMs };
      if (socket) {
        options.createConnection = () => tlsFactory({ socket, servername: host });
      }
      const req = request(options, (res) => { res.resume(); resolve(res.statusCode); });
      req.on('error', reject);
      req.on('timeout', () => {
        const e = new Error('probe timed out'); e.code = 'ETIMEDOUT_PROBE';
        req.destroy(e);
      });
      req.end();
    })]);
    if (status >= 200 && status < 400) return { ok: true, status, proxy: SENTENCE.maskProxy(proxy) };
    return { ok: false, status, proxy: SENTENCE.maskProxy(proxy),
      detail: `${host} answered HTTP ${status}` };
  } catch (e) {
    return { ok: false, status: null, proxy: SENTENCE.maskProxy(proxy),
      code: e?.code ?? null, detail: classifyNetFailure(e, { host, proxy }) };
  } finally {
    clearTimeout(ceiling);
  }
}
