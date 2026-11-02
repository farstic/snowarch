// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-09-C261 — the lookup E-28 makes before it asks the remote anything, so that a resolver that does not answer is told from a remote
// that does not. On a macOS runner the resolver hung on a name that never resolves until E-28's whole 15 s budget had gone, and the
// doctor said the remote had not answered: a warning with a reason, but the wrong party.
//
// It runs in a short-lived child, `spawnSync(process.execPath, [<dns-lookup-child.mjs>, <host>], { timeout })`, and for two reasons not in this
// process. An in-process `dns.lookup` that hangs cannot be cancelled and would keep the CLI alive after the doctor had printed (the CLI
// ends with `process.exitCode`, never `process.exit()`); a child is killed at its budget, so nothing outlives the check. And c-ares
// (`dns.Resolver`) does not have getaddrinfo's semantics: it does not read the hosts file, search domains or a macOS scoped resolver the
// way git does, so it could call a resolver silent that git finds working. The host is the child's argument, never part of any code.
//
// Only a child that did not answer in its budget changes what E-28 says. An answer, with a host or with "no such host", and any other
// failure, leave git to say what it says.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { TIMED_OUT } from './probe-net.mjs';

/**
 * How long the lookup may take. A resolver that answers takes milliseconds, and glibc's own per-attempt timeout is 5 s. E-28 then asks
 * git for up to REMOTE_BUDGET_MS more, and tools/snowarch/tests/dns-probe.test.mjs holds the two inside the runner's budget.
 */
export const DNS_BUDGET = 5_000;

/** The child's whole program, a file of its own: the host is its first argument, and never a part of any code. */
const CHILD = fileURLToPath(new URL('./dns-lookup-child.mjs', import.meta.url));

/**
 * Whether `host` resolves, within `timeoutMs`: `{ ok: true }`, `{ ok: false, timedOut: true }` when the child was killed for not answering,
 * or `{ ok: false, code }` with the resolver's own code (`ERROR` when it gave none). `spawn` and `child` are the tests' seams.
 */
export function lookupHost(host, { timeoutMs = DNS_BUDGET, spawn = spawnSync, child = CHILD } = {}) {
  const r = spawn(process.execPath, [child, host],
    { encoding: 'utf8', timeout: timeoutMs, stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true });
  if (r.error?.code === TIMED_OUT || (r.signal && r.status === null)) return { ok: false, timedOut: true };
  if (r.status === 0) return { ok: true };
  return { ok: false, code: String(r.stdout ?? '').trim() || r.error?.code || 'ERROR' };
}
