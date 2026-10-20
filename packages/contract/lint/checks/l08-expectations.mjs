// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * L08 — the engine's pin and the server's contract disagree about a tool.
 *
 * The engine-side mirror of the server suite's test 2. Both are needed and neither is redundant:
 * the server test fails in the package that changed the tool, at the moment it changes; this fails
 * in a clone with no `node_modules`, in the lint everyone runs, without installing the workspace.
 *
 * All four fields are compared, not just `gate` and `mutates`. `sessionMutates` decides whether a
 * tool reaches the `ask` list, and `alsoRequires` is the second gate six tools enforce after the
 * first — a pin that lost either would still look right in a diff of names.
 */
export const id = 'L08';
export const title = 'the pin and the contract agree about every tool it depends on';

const FIELDS = ['gate', 'mutates', 'sessionMutates', 'alsoRequires'];
const show = (v) => (v === undefined ? '—' : String(v));

export function run(ctx) {
  const findings = [];
  const byName = new Map(ctx.contract.tools.map((t) => [t.name, t]));
  const file = 'packages/contract/required-tools.json';

  for (const pinned of ctx.requiredTools.tools) {
    const live = byName.get(pinned.name);
    if (!live) {
      findings.push({
        file,
        line: 1,
        message: `${pinned.name}: pinned but the contract has no such tool — it was renamed or `
          + 'removed; run node packages/contract/pin.mjs and read the MISSING lines',
      });
      continue;
    }
    const differing = FIELDS.filter((f) => show(pinned[f]) !== show(live[f]));
    if (differing.length > 0) {
      const expected = differing.map((f) => `${f}=${show(pinned[f])}`).join(' ');
      const actual = differing.map((f) => `${f}=${show(live[f])}`).join(' ');
      findings.push({
        file,
        line: 1,
        message: `${pinned.name}: expected ${expected}, contract declares ${actual}`,
      });
    }
  }
  return findings;
}
