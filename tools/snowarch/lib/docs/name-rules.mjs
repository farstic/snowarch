// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-09-C263 — the name rules, as a leaf: no import, so a hook can read them without loading the sync recipe, the doctor or the
// contract that identifiers.mjs reaches. identifiers.mjs imports and re-exports what it always exported; what moved here is the
// definition, not the behaviour. `pageNames` is the one tokeniser of a corpus page: `corpusIndex` (identifiers.mjs) and the names
// index (names-index-build.mjs) both call it.

/** The one phrase that marks a platform name the corpus does not document. Checked on the line. */
export const MARKER = 'not documented in the bundled corpus — verify on the instance';

/**
 * The phrase that declares an example's own proposal under a platform name — a table proposed in a
 * module's baseline scope, which the platform would name `sn_<module>_…`. It declares only the name
 * it is attached to — the one written immediately before it, with at most a closing backtick, spaces
 * and an opening parenthesis between (`` `sn_x_y` (proposed — not baseline) ``) — and that one
 * declaration covers the name's other sites in the file. Another name on the line gets nothing.
 */
export const PROPOSED = 'proposed — not baseline';
export const DECLARED = new RegExp(`([A-Za-z0-9]+(?:_[A-Za-z0-9]+)+)\`?\\s*\\(?\\s*${PROPOSED}`, 'gi');

/** First segments that make an absent name a claim about the platform. Each must begin a corpus name. */
export const PLATFORM_PREFIXES = Object.freeze([
  'change', 'chg', 'cmdb', 'cmn', 'csm', 'customer', 'em', 'hr', 'incident', 'kb', 'mid', 'service',
  'sla', 'sn', 'snow', 'sys',
  // The abbreviated namespaces. Each begins corpus tables (`sc_req_item`, `sa_pattern`, `ecc_agent`,
  // `ast_contract`, `sysrule_assignment`), so a name that starts with one reads as a platform object.
  'sc', 'sa', 'ecc', 'ast', 'alm', 'pa', 'wf', 'fm', 'ais', 'awa', 'asmt', 'm2m', 'imp', 'sp', 'oauth',
  'sysapproval', 'sysevent', 'sysauto', 'syslog', 'sysrule',
]);

/**
 * A left part with fewer distinct dotted names in the corpus is a table written with a field
 * (`sn_hr_core_case.state`), not a namespace. Measured 2026-10-04: the tables the roster writes that
 * way reach 2 (`sn_hr_core_case`); `sn_si.` has 7; and four insurance scopes sit in the gap below the
 * line and are not looked up whole — `sn_ins_underwrite` (4), `sn_ins_uw_b2b`, `sn_ins_indiv_uw` and
 * `sn_ins_group_uw` (3 each).
 */
export const NAMESPACE_MIN = 5;

export const TOKEN = /[A-Za-z0-9]+(?:_[A-Za-z0-9]+)+/g;
export const DOTTED = /[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)+/g;
export const CUSTOM = /^(x|u)_/;
// The roster's placeholder prefix, one or more angle-bracket segments: `x_<vendor>_<app>_`.
export const PLACEHOLDER = /x_(?:<[^<>\s]+>_)+$/;
// Leading and trailing underscores are markdown emphasis (`_sn_hr_core_`), not part of the name.
export const bare = (t) => t.toLowerCase().replace(/^_+|_+$/g, '');
export const dotted = (t) => t.toLowerCase().split('.').map((p) => p.replace(/^_+|_+$/g, '')).filter(Boolean).join('.');
export const candidate = (left) => left === 'com' || left === 'glide' || /^sn_[a-z0-9_]+$/.test(left);

/**
 * One corpus page's names: every underscore token (`bare`: lower case, edge underscores off), the plain words asked about
 * (`wantWords`), and every dotted run as `dotted` writes it. The corpus writes `\_`; it is removed first, or `sys\_user`
 * would never match `sys_user`. Whether a dotted run is a qualified name is the caller's question (`candidate`).
 */
export function pageNames(raw, wantWords = null) {
  const text = raw.replace(/\\_/g, '_');
  const tokens = new Set();
  const plain = new Set();
  const dottedNames = new Set();
  for (const m of text.matchAll(/[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)*/g)) {
    const parts = m[0].split('.');
    for (const p of parts) {
      const t = bare(p);
      if (t.includes('_')) tokens.add(t);
      else if (wantWords && wantWords.has(t)) plain.add(t);
    }
    if (parts.length > 1) {
      const d = dotted(m[0]);
      if (d.includes('.')) dottedNames.add(d);
    }
  }
  return { tokens, plain, dotted: dottedNames };
}

/**
 * Is this dotted name looked up WHOLE? `com.`, `glide.` and a namespace the corpus uses for NAMESPACE_MIN or more dotted names
 * are; anything else is a table written with a field (`sn_hr_core_case.state`) and is looked up by its parts.
 * `namespaces` maps a left part to the number of distinct dotted names under it.
 */
export const qualifiesWhole = (whole, namespaces) => {
  const left = whole.split('.')[0];
  return left === 'com' || left === 'glide' || (namespaces.get(left) ?? 0) >= NAMESPACE_MIN;
};

/**
 * The phrases by which a text calls a name absent from the corpus. Strict list: NOT a bare "verify on the instance", which defers to
 * the instance and claims nothing of the corpus.
 */
const ABSENCE = 'not documented|not in the (?:bundled )?corpus|undocumented|citation unavailable in australia branch';
export const ABSENCE_ANYWHERE = new RegExp(ABSENCE, 'i');
const AFTER_NAME = new RegExp(`^[\\s*_\\-–—:;,()]*(?:(?:is|are)\\s+)?(?:${ABSENCE})`, 'i');

/** A span that is only a name: letters, digits, underscores, dots, hyphens and the corpus's `\_` escape. */
const PURE_NAME = /^[A-Za-z0-9_.\\-]+$/;

/** The backticked spans and `[table]` brackets of a line that are only a name, as `{ raw, start, end }` (start and end include the marks). */
export function nameSpans(line) {
  const spans = [];
  for (const m of line.matchAll(/`([^`\n]+)`/g)) spans.push({ raw: m[1], start: m.index, end: m.index + m[0].length });
  for (const m of line.matchAll(/\[([A-Za-z0-9_.\\]+)\](?!\()/g)) spans.push({ raw: m[1], start: m.index, end: m.index + m[0].length });
  return spans.filter((sp) => PURE_NAME.test(sp.raw));
}

/**
 * Is the name at `span` called absent? STRICT ATTRIBUTION: the phrase follows the name's closing mark with only separators between
 * (whitespace, dashes, a colon, semicolon, comma, parentheses, an optional is/are), or the line is a table row the name heads and a later
 * cell carries the phrase. A phrase later in the sentence, or about another name, marks nothing: measured on the roster, line-level
 * attribution is wrong nine times in ten (66 names on absence lines, 60 of them printed by the corpus), strict attribution names 5 and
 * the corpus prints none of them.
 */
export function markedAbsent(line, span) {
  if (AFTER_NAME.test(line.slice(span.end))) return true;
  const t = line.trim();
  if (!t.startsWith('|')) return false;
  const cells = t.split('|').map((c) => c.trim()).filter((c, k, all) => !(c === '' && (k === 0 || k === all.length - 1)));
  if (cells.length < 2) return false;
  const head = /^`([^`]+)`$/.exec(cells[0]);
  return Boolean(head) && head[1].replace(/\\_/g, '_').toLowerCase() === line.slice(span.start + 1, span.end - 1).replace(/\\_/g, '_').toLowerCase()
    && cells.slice(1).some((c) => ABSENCE_ANYWHERE.test(c));
}
