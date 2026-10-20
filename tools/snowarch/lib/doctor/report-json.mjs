// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-08-S01 — schema v1, and the validator the tests hold it to.
//
// EVERY KEY IS PRESENT FROM DAY ONE, `null` where a later story fills it. A consumer written
// against this shape — the `/snowarch` skill, a CI job, the banner — must not have to ask which
// version of the doctor produced its input, and a key that appears in v1.2 is a key every reader
// written before it has to guard. So `mode`, `modeLine`, `engine`, `server` and `stale` exist now
// and are `null` until S03/S04/S05 own them.
//
// The validator is hand-written on purpose: `tools/snowarch/` has no dependencies, and a schema
// library would be the first. It is small because the shape is small, and it fails with the PATH
// of the offending key rather than a list of every rule that did not match.
import { version as engineVersion, contractSha } from '../config.mjs';

export const SCHEMA_VERSION = 1;

/** The keys of schema v1, and what each is. The typedef a reader looks for first. */
export const SCHEMA_KEYS = Object.freeze([
  'schema', 'product', 'version', 'ranAt', 'durationMs', 'options',
  'mode', 'modeLine', 'modeLineDetailed',
  // ARC-08-C19 — `instances` is TOP-LEVEL and carries its own source, rather than being folded
  // into `server`. `server` means "the server answered": a quick run never spawns it, and putting
  // a store read under that key would report a file read as a handshake. One key, one meaning,
  // and a consumer that needs to know which it has is told.
  'engine', 'server', 'instances', 'prereqs', 'checks', 'fixes', 'stale', 'summary',
]);

const CHECK_KEYS = Object.freeze([
  'id', 'section', 'title', 'status', 'severity', 'detail', 'remedy', 'command', 'code',
  'fixable', 'quick', 'durationMs',
]);

/**
 * The keys a check entry MAY carry beyond the required ones — the complete allowance (ARC-08-C35).
 *
 * `data` is the check's own payload, the part a consumer actually reads, and `checkToJson` spreads
 * it conditionally, so it is optional rather than required. Measured on a real 41-check report: it
 * is the only key outside `CHECK_KEYS`, and it is present on all 41.
 *
 * Adding a name here is a decision that the field TRAVELS — into the `--json` an issue template asks
 * a stranger to paste, and into the doctor cache. `textDetail` is the counter-example that made this
 * list necessary (ARC-08-C34): a terminal-only string, carrying a folder path, one edit away from
 * the report with nothing to stop it.
 */
const CHECK_OPTIONAL_KEYS = Object.freeze(['data']);

/**
 * One result, in report shape.
 *
 * The check's OWN declaration supplies `section`, `title`, `severity`, `quick` and `fixable`: a
 * result that carried them would let a check describe itself differently in the report than in the
 * registry, and the registry is what the filtering used.
 */
export function checkToJson(result, check) {
  return {
    id: result.id,
    section: check?.section ?? null,
    title: check?.title ?? null,
    status: result.status,
    severity: check?.severity ?? null,
    detail: result.detail ?? null,
    remedy: result.remedy ?? null,
    command: result.command ?? null,
    code: result.code ?? null,
    // The RESULT's answer wins when it has one. The registry flag says a check CAN be fixable;
    // whether THIS finding is depends on the finding — an absent `.local/` is E-11's subject and
    // no `--fix` repairs it, and an adopted server result carries the server's own verdict.
    fixable: result.fixable ?? check?.fixable ?? false,
    quick: check?.quick ?? false,
    durationMs: result.durationMs ?? 0,
    ...(result.data === undefined ? {} : { data: result.data }),
  };
}

/**
 * The report. `root` is only read for the version and the pinned contract sha — everything else is
 * passed in, so a test can build a report without a checkout.
 */
export function buildReport({
  results = [], checks = [], summary, options = {}, ranAt, durationMs = 0, prereqs = null,
  root, engine = null, server = null, instances = null, stale = null, mode = null, modeLine = null,
  modeLineDetailed = null, fixes = [],
} = {}) {
  const byId = new Map(checks.map((c) => [c.id, c]));
  return {
    schema: SCHEMA_VERSION,
    product: 'snowarch',
    version: root ? engineVersion(root) : null,
    ranAt: ranAt ?? new Date().toISOString(),
    durationMs,
    options: {
      quick: options.quick === true,
      noNetwork: options.noNetwork === true,
      fix: options.fix === true,
      section: options.section ?? null,
    },
    mode,
    modeLine,
    modeLineDetailed,
    // S03 fills `engine`; the contract sha is here from day one because the pin is the one fact
    // this story already owns and a consumer diffing two reports wants it first.
    engine: engine ?? (root ? { version: engineVersion(root), tag: null, contractSha: contractSha(root),
      docs: null, roster: null, capabilities: null } : null),
    server,
    // `{ source: 'store' | 'server', entries: [...] }`, or null when neither ran. The source is
    // not decoration: the store knows a label, an environment and a preset, and the server knows
    // whether any of it works.
    instances,
    prereqs,
    checks: results.map((r) => checkToJson(r, byId.get(r.id))),
    fixes,
    stale,
    summary: summary ?? { ok: 0, warn: 0, fail: 0, skip: 0, fixable: 0 },
  };
}

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * Validate a report against schema v1. Returns the problems, each with its path.
 *
 * `null` is allowed wherever a later story fills the value, and NOT allowed anywhere else: a
 * report whose `summary` was null would validate under a looser rule and break every consumer.
 */
export function validateReport(report) {
  const problems = [];
  const fail = (path, message) => problems.push(`${path}: ${message}`);

  if (!isObject(report)) return ['<root>: not an object'];
  for (const key of SCHEMA_KEYS) {
    if (!(key in report)) fail(key, 'missing — every key of schema v1 is present, `null` if unfilled');
  }
  if (report.schema !== SCHEMA_VERSION) fail('schema', `must be ${SCHEMA_VERSION}`);
  if (report.product !== 'snowarch') fail('product', 'must be "snowarch"');
  if (report.version !== null && typeof report.version !== 'string') fail('version', 'string or null');
  if (typeof report.ranAt !== 'string' || Number.isNaN(Date.parse(report.ranAt))) {
    fail('ranAt', 'ISO-8601 timestamp');
  }
  if (typeof report.durationMs !== 'number') fail('durationMs', 'number');

  if (!isObject(report.options)) fail('options', 'object');
  else {
    for (const flag of ['quick', 'noNetwork', 'fix']) {
      if (typeof report.options[flag] !== 'boolean') fail(`options.${flag}`, 'boolean');
    }
    if (report.options.section !== null && typeof report.options.section !== 'string') {
      fail('options.section', 'string or null');
    }
  }

  if (!Array.isArray(report.checks)) fail('checks', 'array');
  else {
    report.checks.forEach((c, i) => {
      if (!isObject(c)) { fail(`checks[${i}]`, 'object'); return; }
      for (const key of CHECK_KEYS) {
        if (!(key in c)) fail(`checks[${i}].${key}`, 'missing');
      }
      // ...AND THE REVERSE, which this list did not ask until ARC-08-C35. Required-only made
      // `CHECK_KEYS` one-directional: a field added to `checkToJson`'s literal travelled with
      // nothing objecting, which is how C34's own control put a terminal-only string — and the
      // folder path inside it — into the report a stranger is asked to paste. The top level has
      // had this property since S01; the entries had not.
      for (const key of Object.keys(c)) {
        if (!CHECK_KEYS.includes(key) && !CHECK_OPTIONAL_KEYS.includes(key)) {
          fail(`checks[${i}].${key}`,
            'unexpected — a key here TRAVELS; add it to CHECK_KEYS or CHECK_OPTIONAL_KEYS if that is meant');
        }
      }
      if (!['ok', 'warn', 'fail', 'skip'].includes(c.status)) fail(`checks[${i}].status`, 'ok|warn|fail|skip');
      if (typeof c.id !== 'string') fail(`checks[${i}].id`, 'string');
      if (typeof c.fixable !== 'boolean') fail(`checks[${i}].fixable`, 'boolean');
      if (typeof c.durationMs !== 'number') fail(`checks[${i}].durationMs`, 'number');
    });
  }

  if (!Array.isArray(report.fixes)) fail('fixes', 'array');
  if (!isObject(report.summary)) fail('summary', 'object');
  else {
    for (const key of ['ok', 'warn', 'fail', 'skip', 'fixable']) {
      if (typeof report.summary[key] !== 'number') fail(`summary.${key}`, 'number');
    }
  }

  // The keys a later story fills: object or null, never a string that happened to be handy.
  for (const key of ['engine', 'server', 'instances', 'stale', 'prereqs']) {
    if (report[key] !== null && !isObject(report[key])) fail(key, 'object or null');
  }
  for (const key of ['mode', 'modeLine', 'modeLineDetailed']) {
    if (report[key] !== null && typeof report[key] !== 'string') fail(key, 'string or null');
  }
  return problems;
}
