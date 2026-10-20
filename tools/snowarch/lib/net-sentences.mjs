// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// The network diagnosis vocabulary, in one module, because two subsystems reach the same internet.
//
// ARC-03-S05 wrote these sentences for git's stderr; ARC-06-S04's preflight reaches github.com over
// `node:https` and hits the same four walls — DNS, an unreachable proxy, a TLS-intercepting gateway,
// a full disk. An operator behind a corporate proxy should not learn two different vocabularies for
// one problem depending on which half of the tool noticed it first, so the sentences live here and
// both callers import them.
//
// What legitimately differs is the KNOB. When git fails, the fix is git's CA setting; when Node
// fails, it is Node's. So the TLS sentence is parameterised by which tool is speaking and names the
// other one second — both knobs, in the order that helps. Everything else is byte-identical.
export const TOOL = Object.freeze({ git: 'git', node: 'node' });

/**
 * A proxy URL is printed back at the operator — that is the whole point of the message — and their
 * `HTTPS_PROXY` may carry `user:password@`. The password is removed before the sentence exists,
 * not on the way to the terminal, so no later caller can print the unmasked form.
 */
export function maskProxy(url) {
  if (!url) return null;
  return String(url).replace(/\/\/[^/@]*@/, '//***@');
}

/** `host:port` from a proxy URL, for the message. Falls back to the masked URL if it will not parse. */
export function proxyAddress(url) {
  try {
    const u = new URL(/^[a-z]+:\/\//i.test(url) ? url : `http://${url}`);
    return u.port ? `${u.hostname}:${u.port}` : u.hostname;
  } catch { return maskProxy(url); }
}

/** The host a URL points at, for the DNS message. `file://` fixtures have none. */
export function upstreamHost(upstream) {
  try { return new URL(upstream).hostname || null; } catch { return null; }
}

export const proxyUnreachable = (proxy) =>
  `cannot reach proxy ${proxyAddress(proxy)} (HTTPS_PROXY) — fix the proxy address, `
  + 'or unset HTTPS_PROXY / add github.com to NO_PROXY, and re-run';

export const dnsFailure = (host) =>
  `cannot reach ${host} (DNS) — check your network and re-run`;

/**
 * What B00 says when it did NOT probe, and why (ARC-09-C29).
 *
 * Sentences rather than constants in `probe-net.mjs`, because all three implementations need them
 * and this module is the one the launcher generator already loads from its `--root`: putting them
 * anywhere else made that generator import a second module that a fixture tree does not have.
 */
export const localUpstream = 'corpus upstream is local — no probe';
export const unprobeableUpstream = (scheme) =>
  `corpus upstream is ${scheme} — not probed (this check speaks HTTPS)`;

export const noRoute = (host) =>
  `no route to ${host} — are you offline, or is a firewall blocking 443?`;

/**
 * The CA sentence. `tool` is who just failed, and its knob comes first; the other is named too,
 * because a corporate bundle is always needed by both and finding that out twice is a bad day.
 */
export function tlsIntercepted({ tool = TOOL.git } = {}) {
  return tool === TOOL.node
    ? 'TLS interception detected — export NODE_EXTRA_CA_CERTS=<your corporate CA bundle .pem> '
      + 'and re-run; git needs the same bundle via git config --global http.sslCAInfo '
      + '(docs/TROUBLESHOOTING.md)'
    : 'TLS interception detected — set GIT_SSL_CAINFO (or git config http.sslCAInfo) to your '
      + 'corporate CA bundle and re-run; the MCP server needs the same bundle via '
      + 'NODE_EXTRA_CA_CERTS (docs/TROUBLESHOOTING.md)';
}

export const noDiskSpace =
  'insufficient disk space: need ~400 MB free (~700 MB for --mode full)';

/**
 * ARC-07-C31 — this one takes a `cli` STRING and guards it locally, which is the exception in this
 * engine rather than the pattern.
 *
 * Every other sentence module takes a spellings object and calls the shared `needSpell` from
 * `tools/snowarch/lib/text.mjs`. THIS MODULE MUST NOT IMPORT THAT ONE: `tests/launcher-parity.test.mjs`
 * copies this file alone into a temp tree — with only `remedies.json` and `text.json` beside it —
 * and runs `scripts/gen-launcher-text.mjs` against it, which imports this module by path. An import
 * of a file that is not copied would be a missing module on exactly that path, and the launcher
 * generator is what prints these sentences in a shell that has no Node.
 */
export const unfetchablePin = (pin, cli) => {
  if (typeof cli !== 'string' || cli === '') {
    throw new TypeError('unfetchablePin needs the launcher spelling as its second argument — '
      + 'this module has no default, because it cannot import one');
  }
  return `pin ${String(pin ?? '').slice(0, 7)} not fetchable from upstream (force-push or history `
    + `rewrite?) — maintainer: run ${cli} docs sync --upstream`;
};
