// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * How a store entry becomes something `probeAll` can use — in one place, for three callers.
 *
 * `instance add`, `instance test`/`import --from-legacy` and now the doctor (ARC-08-S04) all probe
 * the same way, and the two rules that matter are easy to lose in a copy: ONE request per probe
 * (`maxRetries: 0` — a 401 retried is an account closer to a lockout on an instance whose policy
 * nobody here knows), and the ROPC seam, where the token is acquired inside the client's first
 * request rather than by a second login attempt of our own.
 *
 * It lives beside the probes rather than in `cli/instance.ts`, where it was, because the doctor
 * must not import the CLI to ask a question about credentials — and because a client factory is
 * not a command.
 */
import { ServiceNowClient } from './client.js';
/** A probe client for one entry. `maxRetries: 0` is the rule, restated at the construction site. */
export const probeClientFor = (entry) => new ServiceNowClient({
    instanceUrl: entry.url,
    authMethod: entry.auth.method === 'basic' ? 'basic' : 'oauth',
    // ONE request per probe, ever — S03's rule, restated here because this is where a future edit
    // would be tempted to "just add a retry".
    maxRetries: 0,
    requestTimeoutMs: 15_000,
    ...(entry.auth.method === 'basic'
        ? { basic: { username: entry.auth.username, password: entry.auth.password } }
        : { oauth: { username: entry.auth.username, password: entry.auth.password,
                clientId: entry.auth.clientId, clientSecret: entry.auth.clientSecret } }),
});
/**
 * What `probeAll` needs to know about one entry's credentials — including the ROPC seam.
 *
 * `tokenProbe` returns `ok` WITHOUT contacting anything, and that is the deliberate truth of this
 * client: `ServiceNowClient` acquires the ROPC token inside its first request, so a separate token
 * call would be a SECOND login attempt on an account this whole flow is careful to spend only
 * three of. A failed grant still lands as `auth failed` through the `sys_user` query; what is lost
 * is the four-way ROPC error table's extra specificity, which needs a real token endpoint to
 * distinguish and belongs with the live sitting.
 */
export const probeOptionsFor = (auth, env) => ({
    username: auth.username,
    authMethod: auth.method,
    env,
    ...(auth.method === 'oauth_ropc' ? { tokenProbe: async () => ({ ok: true }) } : {}),
});
