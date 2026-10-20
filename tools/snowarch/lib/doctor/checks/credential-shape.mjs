// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-08-S02 — what a credential LOOKS like, defined once for the two things that hunt for one.
//
// `tests/never-commit.test.mjs` sweeps the tracked tree at commit time; the doctor's E-09 sweeps
// the same tree on the user's machine, where the file that leaked may never have reached a commit
// this repository sees. Two hunts, one description of the quarry — because a doctor that used a
// looser pattern than CI would clear a checkout CI would reject, and a stricter one would fail a
// checkout that is fine.
//
// The regexes deliberately keep their original spelling. `JSONISH` cannot match its own source
// (after the opening quote comes `(`, not a key), which is what lets the file that defines the
// sweep survive the sweep — the mistake made thirteen times before it was written down.

/** A KEY that names a credential, at any depth of a settings file. */
export const CREDENTIAL_KEY = /PASSWORD|SECRET|TOKEN|_KEY$/i;

/**
 * Files worth reading for a credential-shaped LITERAL.
 *
 * ARC-09-C10 added the `.env` family, and the gap it closed is the embarrassing kind: `ENVISH`
 * below has always existed to match `SERVICENOW_BASIC_PASSWORD=…`, and until this change the only
 * files it could ever see were `.sh` scripts. A committed `.env` with a real value is THE classic
 * credential leak, E-09 exists to catch exactly that, and the one file type named after the thing
 * being scanned for was the one type excluded. Found while asking whether `packages/snowarch/.env
 * .example` — which SHIPS in the npm tarball — was covered by the scan. It was not.
 *
 * `.env`, and `.env.<anything>` (`.env.example`, `.env.local`, `.env.production`). Not `.envrc`:
 * direnv's file is a shell script and is a different question.
 */
export const CREDENTIAL_EXT = /(\.(json|md|ts|mjs|sh|yml|yaml|ps1|cmd)$|(^|\/)\.env(\.[A-Za-z0-9_-]+)?$)/;

/** `"password": "…"` with a value long enough to be real. */
export const JSONISH = /"(password|passwd|secret|token|[a-z_]*_key)"\s*:\s*"([^"]{8,})"/gi;

/** `SERVICENOW_BASIC_PASSWORD=…` in a shell or env file. */
export const ENVISH = /^[A-Z0-9_]*(PASSWORD|SECRET|TOKEN)[A-Z0-9_]*=(.{8,})$/;

// What counts as documentation rather than a secret. Four rules, each with a reason, kept in one
// place so the whole allowance is auditable instead of scattered through the regexes. The scan is
// heuristic by design (`01` §7): D-04's store location is the structural defence, this is the net
// under it, and a net with no holes at all would flag every example in the documentation.
const PLACEHOLDER_PREFIXES = ['your', 'my_', '<', '${', '***', 'changeme', 'example', 'placeholder',
  'dummy', 'test_', 'xxx', 'redacted', 'insert', 'replace'];
// Named fixtures with recorded provenance. hunter2hunter2 is the dummy password used in ARC-01-S07's
// own acceptance criterion and is on ADR-0007's recorded fixture list.
const KNOWN_FIXTURES = new Set(['hunter2hunter2']);
// A value that IS the generic word for the thing ("password": "password") is documentation.
// Matched exactly rather than as a prefix, so a real value merely STARTING with one of these
// ("passwordL33t...") is still flagged.
const GENERIC_WORDS = new Set(['password', 'passwd', 'secret', 'token', 'apikey', 'api_key',
  'changeme', 'letmein', 'credentials', 'username']);
const ALL_CAPS_TOKEN = /^[A-Z][A-Z0-9_]*$/;            // ACME_SVC_PASSWORD, CPU_CRITICAL
const LOWER_SNAKE_OR_KEBAB = /^[a-z][a-z0-9]*([_-][a-z0-9]+)+$/; // svc_password, your-oidc-client-secret

/** True when the matched value is documentation rather than a credential. */
export const isPlaceholder = (v) => {
  const s = String(v).trim();
  if (KNOWN_FIXTURES.has(s)) return true;
  if (GENERIC_WORDS.has(s.toLowerCase())) return true;
  if (ALL_CAPS_TOKEN.test(s)) return true;
  // Real credentials are essentially never snake_case or kebab-case words; documentation examples
  // almost always are. A credential weak enough to look like this is a finding in its own right.
  if (LOWER_SNAKE_OR_KEBAB.test(s)) return true;
  return PLACEHOLDER_PREFIXES.some((p) => s.toLowerCase().startsWith(p));
};

/**
 * The credential-shaped lines in one file's text, as 1-based line numbers.
 *
 * The VALUE never leaves this function. A hunter that printed what it found would put the
 * credential in the report, in the terminal scrollback and in whatever the user pastes into an
 * issue — so the answer is a line number and nothing else.
 */
export function credentialLines(text) {
  const hits = [];
  text.split('\n').forEach((line, i) => {
    if (line.trimStart().startsWith('#') || line.trimStart().startsWith('//')) return;
    for (const m of line.matchAll(JSONISH)) if (!isPlaceholder(m[2])) hits.push(i + 1);
    const e = line.match(ENVISH);
    if (e && !isPlaceholder(e[2])) hits.push(i + 1);
  });
  return hits;
}

/** Every key path in `value` whose last segment names a credential. Depth-first, dotted. */
export function credentialKeys(value, prefix = '') {
  if (value === null || typeof value !== 'object') return [];
  const out = [];
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (CREDENTIAL_KEY.test(key)) out.push(path);
    out.push(...credentialKeys(child, path));
  }
  return out;
}
