// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-08-S07 — every check the old engine's `doctor.sh` made, and where it went.
//
// `00` §3.9 calls that script the most precise existing specification of a correct install, and it
// is: 39 numbered checks written against a real machine over two years. Rewriting the doctor
// without accounting for each one would have lost intent that nobody would notice missing until a
// user's install broke in a way the old script would have caught.
//
// So this is DATA, and three things read it: the appendix table in `docs/ARCHITECTURE.md` (rendered
// by `scripts/gen-doctor-docs.mjs`), the "new checks with no old counterpart" list (computed as the
// registry minus this table, never typed), and `tests/doctor/mapping.test.mjs`, which asserts every
// `D` id occurs exactly once, that every new id named here exists in the registry, and that the old
// script really contains the ids this table claims to account for.
//
// A row is `retired` only with the ARC or story that made it unnecessary. "We decided not to" is
// not a reason anybody can audit a year later.

/**
 * @typedef {object} MappingRow
 * @property {string} old      `D00`…`D37`, exactly once each
 * @property {string} intent   what the old script checked, read against the script itself while
 *                            it was still in the tree (ARC-10-S03 retired it; the original is at
 *                            `git show import/engine-v2.8.0-worktree:scripts/legacy/doctor.sh`)
 * @property {string[]} ids    the new check ids, or `[]` when the intent is retired
 * @property {string} label    what the `New` column prints (ids, or `retired`)
 * @property {string} note     why, or what changed
 */

/** The 38 rows. D16 is one row noting a–d; D31 is one row noting its three parts. */
export const MAPPING = Object.freeze([
  { old: 'D00', intent: 'required host tooling missing → exit 3', ids: [],
    label: 'runner exit 3 (S01)', note: 'same semantics; the bash aggregator is retired' },
  { old: 'D01', intent: '`claude` CLI present', ids: ['E-00'], note: 'plus the floor and the login' },
  { old: 'D02', intent: 'node ≥ 20', ids: ['E-02', 'SV-00'], note: 'floor from `engine.config.json`' },
  { old: 'D03', intent: 'npm', ids: ['E-03'], note: 'WARN in design-only, FAIL in live' },
  { old: 'D04', intent: 'git', ids: ['E-01'], note: 'floor from `engine.config.json` (ADR-0008)' },
  { old: 'D05', intent: 'python3', ids: ['E-04'], note: 'capability pack "docx"' },
  { old: 'D06', intent: 'draw.io / LibreOffice', ids: ['E-04'],
    note: 'capability packs "draw.io" and "PDF QA"; Mermaid added' },
  { old: 'D07', intent: 'engine repo root', ids: ['E-05'], note: 'exit 3 when not AT the root' },
  { old: 'D08', intent: 'roster counts, parsed from `CLAUDE.md` prose', ids: ['E-17'],
    note: 'counted from the directory listing; the expected counts come from the roster block\n'
      + 'of `engine.config.json`' },
  { old: 'D09', intent: 'every skill directory has a `SKILL.md`', ids: ['E-17'], note: 'merged' },
  { old: 'D10', intent: '`verify-structure.sh` audit', ids: [], label: 'retired',
    note: 'the structure gate was deleted in ARC-02-S01; the skills/agents lint runs in CI '
      + '(ARC-02-S02), and E-18 keeps the description and frontmatter half' },
  { old: 'D11', intent: '`core.hooksPath=.githooks`', ids: [], label: 'retired',
    note: 'the pre-commit chain was deleted with ARC-02-S01; CI replaces it (P-37, ARC-09)' },
  { old: 'D12', intent: 'submodule populated', ids: ['E-12'], note: 'FAIL, never SKIP' },
  { old: 'D13', intent: 'pinned release branch', ids: ['E-14'], note: 'family from `engine.config.json`' },
  { old: 'D14', intent: 'checkout == pinned commit', ids: ['E-13'], note: 'pin == gitlink == HEAD' },
  { old: 'D15', intent: 'citation gate', ids: ['E-16'], note: 'an absent corpus is a FAIL' },
  { old: 'D16', intent: '`settings.json` present / valid / placeholder / hook targets resolve (a–d)',
    ids: ['E-08', 'E-07'],
    note: 'committed-file comparison; the placeholder half is E-07; the personal hook tooling it '
      + 'also checked for is out of scope (D-03 item 9)' },
  { old: 'D17', intent: '`~/.claude.json` registration for this project', ids: ['E-23'],
    label: 'retired as a positive check; E-23',
    note: 'ARC-06-S01 made the registration the committed `.mcp.json` (E-07), so there is nothing '
      + 'in `~/.claude.json` to confirm; it is inspected only for stale entries, and never written' },
  { old: 'D18', intent: '`disabledMcpjsonServers` / trust accepted', ids: ['E-10', 'E-27'],
    note: 'the toggles are ours (E-10); the status Claude Code reports is read by E-27 '
      + '(`claude mcp get`); the trust dialog itself is not checkable (`03` §D)' },
  { old: 'D19', intent: 'server entrypoint resolves', ids: ['SV-01'],
    note: 're-targeted to `packages/snowarch/dist/server.js`' },
  { old: 'D20', intent: 'server `node_modules`', ids: ['SV-01'], note: 'fixable → F1 runs B04' },
  { old: 'D21', intent: '`dist/` older than `src/`', ids: [], label: 'retired',
    note: '`dist/` is committed and the contract gate rebuilds and diffs it on every cell '
      + '(ARC-04-S13)' },
  { old: 'D22', intent: 'tools manifest readable', ids: ['SV-01', 'SV-05'],
    note: '`dist/contract.json` plus a real handshake' },
  { old: 'D23', intent: 'instance URL absent', ids: ['SV-02', 'SV-03'],
    note: 'unconfigured is a supported mode, not a fault' },
  { old: 'D24', intent: 'URL is a bare https origin', ids: ['SV-03'], note: '' },
  { old: 'D25', intent: 'flag absent', ids: ['SV-03'], note: '`FLAGS_INCOMPLETE`; fixable → F4' },
  { old: 'D26', intent: 'flag not a string', ids: ['SV-02'], note: '`STORE_SCHEMA_INVALID`' },
  { old: 'D27', intent: 'SCRIPTING without WRITE', ids: ['SV-03'],
    note: '`FLAG_DEPENDENCY_VIOLATION`; never fixable — which one was meant is not in the store' },
  { old: 'D28', intent: '`MCP_TOOL_PACKAGE`', ids: ['SV-03'], note: '`toolPackage == full`' },
  { old: 'D29', intent: '`MAX_RECORDS` unset', ids: ['SV-03'], note: '`maxRecords`; the default is pinned' },
  { old: 'D30', intent: 'wizard store overrides env', ids: ['E-24'],
    note: 'the override itself was removed in ARC-04-S02; what remains is the legacy store detector' },
  { old: 'D31',
    intent: '`~/.claude.json` mode; other projects with credentials; tracked-file leak scan',
    ids: ['E-23', 'E-09'], note: 'the first two are E-23, the leak scan is E-09' },
  { old: 'D32', intent: 'live instance probes', ids: ['SV-04'],
    note: 'the server module, over ARC-07-S03\'s probes' },
  { old: 'D33', intent: 'per-preset role probes', ids: ['SV-04'], note: '' },
  { old: 'D34', intent: 'update-set readiness (§2.2)', ids: ['SV-04'],
    note: 'the write probe; capture is the server\'s own tool (ARC-04-S07)' },
  { old: 'D35', intent: 'descending-sort self-test', ids: [], label: 'retired',
    note: '`ORDERBYDESC` was fixed with a regression test in ARC-04-S09 — a self-test in the '
      + 'doctor was standing in for one in the suite' },
  { old: 'D36', intent: '`CLAUDE.md` gates on `mcp__<key>__`', ids: ['E-20'],
    note: 're-targeted to the generated rule file, the protocol page and both registrations' },
  { old: 'D37', intent: 'tool-name currency against the rename map', ids: ['E-19'],
    note: '`retired-names.json`' },
]);

/** `retired` when nothing carries the intent forward; otherwise the ids, joined. */
export const labelFor = (row) => row.label ?? row.ids.join(' / ');

/** Every new id this table accounts for, deduplicated, in registry order when the caller sorts. */
export function mappedIds(rows = MAPPING) {
  return [...new Set(rows.flatMap((r) => r.ids))];
}

/**
 * The checks nobody asked for before — computed, never typed.
 *
 * The story lists twelve; the list is derived from the registry so that a check added later shows
 * up here without anybody remembering to add it, and a check that becomes mapped leaves.
 */
export function unmappedIds(registryIds, rows = MAPPING) {
  const mapped = new Set(mappedIds(rows));
  return registryIds.filter((id) => !mapped.has(id));
}

/**
 * True when the row SAYS retired — which is not the same as having no new id.
 *
 * D00 has no id and is not retired: its intent (missing host tooling ends the run) is the runner's
 * exit 3. D17 has an id and IS partly retired: the positive registration check is gone, and what
 * survives is the stale-entry detector. The label is the claim; this reads the claim rather than
 * inferring one from the shape.
 */
export const isRetired = (row) => /retired/.test(labelFor(row));
