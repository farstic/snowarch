// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-08-S01 — the check registry: what a check IS, and where the list of them lives.
//
// The doctor is a runner over a registry, not a script of steps. That distinction is the whole
// design: a step is a thing the bootstrap DOES, in order, and failing one stops the install; a
// check is a question about the checkout that must be answered even when the previous answer was
// bad. So every check runs, every check is timed, and one that throws becomes a `fail` with the
// message rather than an aborted run — an operator reading a half-finished report cannot tell
// which half is missing.
//
// This story ships the registry EMPTY. S02–S04 add the checks; the harness below is what lets a
// test register one, which is how the framework is proved before any real check exists.

/**
 * @typedef {'prereqs'|'repo'|'docs'|'roster'|'contract'|'legacy'|'host'|'server'} Section
 * @typedef {'fail'|'warn'|'info'} Severity
 * @typedef {'ok'|'warn'|'fail'|'skip'} Status
 *
 * @typedef {object} CheckResult
 * @property {string} id
 * @property {Status} status
 * @property {string} detail          one line, redacted BY THE RUNNER — never by the check
 * @property {string} [remedy]        what to do; from the contract when `code` is set
 * @property {string} [command]       a runnable command, when one exists
 * @property {string} [code]          an error code from the contract registry
 * @property {object} [data]          structured extras for `--json`; string leaves are redacted
 * @property {number} [durationMs]    filled by the runner
 *
 * @typedef {object} Check
 * @property {string} id              `E-nn` (engine) or `SV-nn` (server). Never reused.
 * @property {Section} section
 * @property {string} title
 * @property {Severity} severity      the status a FAILING condition produces
 * @property {boolean} quick          in the `--quick` subset
 * @property {boolean} network        contacts the network; skipped by `--no-network`
 * @property {boolean} spawns         spawns a child other than `git` — never in `--quick`
 * @property {boolean} fixable        `--fix` (ARC-08-S06) can repair it
 * @property {(ctx: object) => Promise<CheckResult>} run
 */

/** Registry order IS report order. Sections are printed in this order, checks within them in registration order. */
export const SECTIONS = Object.freeze(
  ['prereqs', 'repo', 'docs', 'roster', 'contract', 'legacy', 'host', 'server'],
);

export const SEVERITIES = Object.freeze(['fail', 'warn', 'info']);
export const STATUSES = Object.freeze(['ok', 'warn', 'fail', 'skip']);

/** `SV-` is the server's prefix; everything else is the engine's. One place decides. */
export const SERVER_PREFIX = 'SV-';
export const ENGINE_PREFIX = 'E-';
export const isServerCheck = (id) => String(id).startsWith(SERVER_PREFIX);

const ID = /^(E|SV)-\d{2,}$/;

/**
 * Validate one check and return it frozen.
 *
 * Every field is required — including the three booleans that decide filtering. A check that
 * omitted `network` would be RUN by `--no-network`, which is the one promise that mode makes; a
 * default of `false` would make that omission invisible. Declaring them is cheap and the failure
 * mode of not declaring them is a doctor that touched the network on a machine that has none.
 */
export function defineCheck(check) {
  const problems = [];
  if (!ID.test(check?.id ?? '')) problems.push(`id must be E-nn or SV-nn, got ${JSON.stringify(check?.id)}`);
  if (!SECTIONS.includes(check?.section)) problems.push(`section must be one of ${SECTIONS.join(', ')}`);
  if (typeof check?.title !== 'string' || check.title.length === 0) problems.push('title is required');
  if (!SEVERITIES.includes(check?.severity)) problems.push(`severity must be one of ${SEVERITIES.join(', ')}`);
  for (const flag of ['quick', 'network', 'spawns', 'fixable']) {
    if (typeof check?.[flag] !== 'boolean') problems.push(`${flag} must be declared as a boolean`);
  }
  // ARC-09-C32 fix-up. OPTIONAL, unlike the four above, and that asymmetry is deliberate: those
  // four are declarations every check must make, this one is an exception a check may claim.
  //
  // `offline: true` means "I have an answer that costs no network, and I will give it when
  // `ctx.flags.noNetwork` is set". It does NOT exempt the check from `--quick`: that is a cost contract
  // about spawning, and a check may be offline and still expensive. A check that claims it and
  // then reaches the network under `--no-network` is a defect the flag cannot catch, so E-28's
  // test counts its subprocess calls.
  if (check?.offline !== undefined && typeof check.offline !== 'boolean') {
    problems.push('offline, when declared, must be a boolean');
  }
  if (check?.offline === true && check?.network !== true) {
    problems.push('offline is only meaningful on a network check — a non-network check always runs');
  }
  if (typeof check?.run !== 'function') problems.push('run must be a function');
  // A server id in the engine's registry, or the reverse, is a re-home nobody meant: the section
  // and the prefix are two statements of the same fact and they must agree.
  if (check?.id && isServerCheck(check.id) !== (check.section === 'server')) {
    problems.push(`${check.id} is in section "${check.section}" — SV- ids belong to "server" and only they do`);
  }
  if (problems.length > 0) throw new Error(`defineCheck(${check?.id ?? '?'}): ${problems.join('; ')}`);
  return Object.freeze({ ...check });
}

/**
 * A registry instance.
 *
 * Not a module-level singleton: the tests register checks, and a singleton would carry one test's
 * registrations into the next. The command builds one and fills it; a test builds its own.
 */
export function createRegistry(checks = []) {
  const byId = new Map();
  const add = (check) => {
    const defined = defineCheck(check);
    if (byId.has(defined.id)) throw new Error(`duplicate check id ${defined.id} — ids are never reused`);
    byId.set(defined.id, defined);
    return defined;
  };
  for (const check of checks) add(check);
  return {
    add,
    get size() { return byId.size; },
    has: (id) => byId.has(id),
    /** In SECTION order, then registration order — the order the report prints. */
    all() {
      const out = [];
      for (const section of SECTIONS) {
        for (const check of byId.values()) if (check.section === section) out.push(check);
      }
      return out;
    },
    sections() {
      return SECTIONS.filter((s) => [...byId.values()].some((c) => c.section === s));
    },
  };
}
