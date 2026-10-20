// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * L11 — the pin still describes the committed contract.
 *
 * A stale sha means the engine's expectations were checked against a contract that no longer
 * exists. The remedy in the message names `pin.mjs` AND its review output, because re-pinning
 * blindly is the failure this whole ARC exists to prevent: the tool prints REGATE and MISSING
 * lines precisely so a human decides.
 */
import { createHash } from 'node:crypto';

export const id = 'L11';
export const title = 'the pinned sha still describes the committed contract';

export function run(ctx) {
  const actual = createHash('sha256').update(ctx.contractText).digest('hex');
  if (actual === ctx.requiredTools.contractSha256) return [];
  return [{
    file: 'packages/contract/required-tools.json',
    message: `contract sha mismatch: pinned ${ctx.requiredTools.contractSha256.slice(0, 8)}… `
      + `committed ${actual.slice(0, 8)}… — run node packages/contract/pin.mjs and review the `
      + 'REGATE/MISSING lines',
  }];
}
