// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-06-S07 — one authentication attempt, and no more.
//
// The non-interactive path has nobody to ask for a corrected password, so a retry loop there is
// just the same wrong credential sent again — noise in the instance's audit log and, on some
// configurations, a lockout. Exactly one request, and the caller reports what came back.
//
// `node:https`/`node:http` rather than the server's client: this runs at B06, and although B04 has
// installed the runtime tree by then, the probe must work in the same stdlib-only way the rest of
// the bootstrap does — and it must be callable before ARC-07's richer probes exist.
import { request as httpsRequest } from 'node:https';
import { request as httpRequest } from 'node:http';
import { ERROR_CODES } from '../../../packages/snowarch/dist/errors/codes.js';
import { TIMED_OUT, proxyFor } from './probe-net.mjs';

/**
 * The code for an HTTP status, from the server's own error registry.
 *
 * Looked up by STATUS rather than spelled: the registry is where an error code's meaning, remedy
 * and command live, so a probe that invented its own spelling would be a second vocabulary for the
 * same event — and the doctor, the rule file and the runtime mapping all read the registry.
 */
export const codeForStatus = (status) =>
  ERROR_CODES.find((e) => e.httpStatus === status)?.code ?? null;

export const PROBE_PATH = '/api/now/table/sys_user?sysparm_limit=1';

/**
 * @returns {{ ok: boolean, status: number|null, code: string|null, detail: string|null }}
 *
 * The password is a parameter and is never returned, logged or attached to the result. The caller
 * has already registered it with the redactor by the time this is reached.
 */
export function probeAuth({ url, username, password, timeoutMs = 10_000, env = process.env }) {
  const target = new URL(PROBE_PATH, url.endsWith('/') ? url : `${url}/`);
  const secure = target.protocol === 'https:';
  const request = secure ? httpsRequest : httpRequest;
  const proxy = proxyFor(target.hostname, env);

  return new Promise((resolve) => {
    const done = (r) => resolve(r);
    const req = request({
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port || (secure ? 443 : 80),
      path: `${target.pathname}${target.search}`,
      method: 'GET',
      timeout: timeoutMs,
      headers: {
        // Basic, built here and never written anywhere else. The header is the only place the
        // password exists outside the store, and it lives for the length of one request.
        authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`,
        accept: 'application/json',
      },
    }, (res) => {
      res.resume();
      const status = res.statusCode ?? 0;
      if (status === 200) return done({ ok: true, status, code: null, detail: null });
      const code = codeForStatus(status);
      if (code) {
        return done({ ok: false, status, code,
          detail: status === 403
            ? 'the credential authenticated but has no rights on sys_user'
            : null });
      }
      return done({ ok: false, status, code: null,
        detail: `the instance answered HTTP ${status}` });
    });
    // A transport failure carries whatever code the platform gave it; there is no invented one,
    // because a code this module made up would look like a registry code and is not.
    req.on('error', (e) => done({ ok: false, status: null, code: e?.code ?? null,
      detail: proxy ? `through proxy ${proxy}` : 'the request did not complete' }));
    req.on('timeout', () => { req.destroy(); done({ ok: false, status: null, code: TIMED_OUT,
      detail: `no answer within ${timeoutMs / 1000} s` }); });
    req.end();
  });
}
