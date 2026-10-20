// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-08-S01 — the redaction pass the RUNNER applies to every string a check produces.
//
// The rule is not "checks should be careful". It is that a check has no path to the output that
// skips this: the runner redacts `detail`, `remedy`, `command` and every string leaf of `data`
// before anything is rendered, so a check written in six months by someone who has not read this
// file cannot leak a value it did not know was sensitive.
//
// ONE REDACTOR. The bootstrap's `lib/redact.mjs` already answers "does this text contain something
// that must not be printed" — secret-shaped keys, Authorization headers, usernames, registered
// values. This module IMPORTS it and adds what a doctor report needs on top: home directories
// become `~`, proxy URLs lose their credentials, and the whole thing walks an object. Two
// redactors would be two opinions about what a secret is, and the one users see would be whichever
// was written second.
import { sep } from 'node:path';

import { redact as redactText, register } from '../redact.mjs';

export { register };

/**
 * `someone@corp.example.com` → `s***@corp.example.com`; `admin` → `a***`.
 *
 * The same rule as `packages/snowarch/src/store/paths.ts` — an address keeps its DOMAIN because an
 * operator needs to know which directory the account is in, and a bare handle keeps its first
 * letter because "which of my three accounts is this" is answerable from it and nothing else is.
 * `tests/doctor/redact.test.mjs` runs one fixture table through both implementations, so the pair
 * cannot drift.
 */
export function maskUsername(value) {
  if (typeof value !== 'string' || value.length === 0) return value;
  const at = value.indexOf('@');
  if (at > 0) return `${value[0]}***${value.slice(at)}`;
  return `${value[0]}***`;
}

/**
 * An absolute path under the home directory becomes `~/…`.
 *
 * A doctor report is the single most-pasted artefact this product produces — into an issue, a
 * screen share, a support thread — and an absolute path carries the account name whether or not
 * anyone thought of it as a secret.
 */
export function maskPath(value, home) {
  // The home directory is PASSED IN, never read here: nothing under `lib/` reaches into a user's
  // home (`tools/snowarch/tests/mode-register.test.mjs` enforces it repo-wide), and the entry
  // point that already knows where the process is running supplies it. Without one, the rule
  // simply does not apply — a path is printed as it is rather than half-masked against a guess.
  if (typeof value !== 'string' || !home) return value;
  const norm = home.endsWith(sep) ? home.slice(0, -1) : home;
  if (value === norm) return '~';
  // Both separators: a Windows path can reach a POSIX runner through a fixture, and the reverse.
  const escaped = norm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return value.replace(new RegExp(`${escaped}([\\\\/])`, 'g'), '~$1');
}

/** `http://user:pass@proxy:8080` → `http://***@proxy:8080`. The host is the useful half. */
export function maskProxy(value) {
  if (typeof value !== 'string') return value;
  return value.replace(/\b([a-z][a-z0-9+.-]*:\/\/)[^/\s:@]+:[^/\s@]+@/gi, '$1***@');
}

/** One string, through every rule, in the order that keeps each from eating the next. */
export function redactString(value, { home = '' } = {}) {
  if (typeof value !== 'string') return value;
  // Paths first: `~` shortening must happen before the username rules, or the account name inside
  // an absolute path is masked letter-by-letter and the path becomes unreadable — which is the
  // failure that makes people stop pasting reports at all.
  return redactText(maskProxy(maskPath(value, home)));
}

/**
 * Every string leaf of a value, redacted. Arrays and plain objects are walked; nothing else is.
 *
 * A KEY that names a secret redacts its whole value even when the value itself looks innocent —
 * `{ password: 'summer' }` is a password, and no text rule can know that. The key is the evidence.
 */
export function redactDeep(value, options = {}) {
  if (typeof value === 'string') return redactString(value, options);
  if (Array.isArray(value)) return value.map((v) => redactDeep(v, options));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, leaf] of Object.entries(value)) {
      out[key] = /(PASSWORD|SECRET|TOKEN|_KEY)$/i.test(key) && typeof leaf === 'string'
        ? `set (len ${leaf.length})`
        : redactDeep(leaf, options);
    }
    return out;
  }
  return value;
}

/** One check result, redacted. The runner calls this; a check never calls it at all. */
export function redactResult(result, options = {}) {
  const out = { ...result };
  for (const field of ['detail', 'remedy', 'command']) {
    if (typeof out[field] === 'string') out[field] = redactString(out[field], options);
  }
  if (out.data !== undefined) out.data = redactDeep(out.data, options);
  return out;
}
