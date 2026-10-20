// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * L07 — four declarations of the registration key, and they must agree.
 *
 * `engine.config.json` is the value of record (D-01). The other three exist because they are
 * read by different consumers at different times, and a second independently edited copy is
 * exactly what makes disagreement detectable — ARC-05-S01's criterion 6 is the demonstration:
 * a wrong `serverKey` in `required-tools.json` is *self-consistent*, so only a cross-check
 * finds it.
 */
export const id = 'L07';
export const title = 'the registration key agrees across its declarations';

export function run(ctx) {
  const findings = [];
  const expected = ctx.serverKey;

  if (ctx.requiredTools.serverKey !== expected) {
    findings.push({
      file: 'packages/contract/required-tools.json',
      message: `serverKey ${ctx.requiredTools.serverKey} ≠ engine.config.json ${expected}`,
    });
  }

  const suggested = ctx.contract.server?.suggestedName;
  if (suggested !== expected) {
    findings.push({
      file: 'packages/snowarch/dist/contract.json',
      message: `server.suggestedName ${suggested} ≠ engine.config.json ${expected}`,
    });
  }

  if (!ctx.mcpJson) {
    ctx.skipNotes.push('L07: .mcp.json not present — that leg is not checked (ARC-06-S01)');
  } else {
    const keys = Object.keys(ctx.mcpJson.mcpServers ?? {});
    if (keys.length !== 1 || keys[0] !== expected) {
      findings.push({
        file: '.mcp.json',
        message: `mcpServers keys ${JSON.stringify(keys)} ≠ [${JSON.stringify(expected)}]`,
      });
    }
  }

  return findings;
}
