// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// B05 tool list — is this checkout internally consistent?
//
// Three questions, all about the same worry: a partial pull, an interrupted merge, or a maintainer
// who regenerated one file and not the other. ARC-05's CI proves this on every commit; B05 proves
// it on the machine that is about to run the server, where a mismatch means the tool list Claude
// Code sees is not the one the governance texts were written against.
//
// It runs whenever Node is present, in BOTH modes: design-only grounds its citations in a corpus
// and its rules in the contract, so an inconsistent contract is wrong there too.
import { ContractPinMismatch, loadContract } from '../../../../packages/contract/lib/contract.mjs';
import { FILE } from './inputs.mjs';
import { INPUTS } from '../inputs.mjs';

export const id = 'B05';
export const title = 'tool list';
export const needsNode = true;
export const runsWhen = (ctx) => ctx.node.present;
export const skipReason = 'Node.js 20+ not found';
// ARC-09-S05: the declaration lives in `lib/inputs.mjs`. Ten steps answering "what are my
// inputs" in ten files is ten places to get the resume rule wrong, and no way to show a user the
// set — the table is one answer, and `docs/ARCHITECTURE.md` renders from it.
export const inputs = INPUTS.B05.resolve;

export const INCONSISTENT =
  'This checkout is inconsistent (partial pull or a maintainer forgot to regenerate). '
  + 'Run: git status; git checkout -- packages/snowarch/dist packages/contract; '
  + 'if it persists, report it — do not continue.';

/** The three checks, as a list of sentences. Empty means the checkout agrees with itself. */
export function checkContract({ root, config, load = loadContract, pin }) {
  let contract;
  try {
    // The loader verifies the sha itself and throws with both values — one definition of "the
    // pinned sha", rather than a second hash computed here that could disagree about encoding.
    contract = load({ root, verifyPin: true });
  } catch (e) {
    if (e instanceof ContractPinMismatch || e?.name === 'ContractPinMismatch') {
      // `pinned`, not `expected` — the loader's own field names. Read from the error rather than
      // recomputed, so the two halves of the sentence cannot disagree about which is which.
      return [`contract mismatch — dist/contract.json sha256 ${String(e.actual).slice(0, 12)} `
        + `≠ pinned ${String(e.pinned).slice(0, 12)}. ${INCONSISTENT}`];
    }
    return [`the contract could not be read: ${e.message}. ${INCONSISTENT}`];
  }

  const problems = [];
  const names = new Set(contract.tools.map((t) => t.name));
  const missing = (pin.tools ?? []).map((t) => t.name).filter((n) => !names.has(n));
  if (missing.length > 0) {
    problems.push(`the engine pins ${missing.length} tool(s) the server does not have `
      + `(${missing.slice(0, 3).join(', ')}${missing.length > 3 ? ', …' : ''}). ${INCONSISTENT}`);
  }

  const suggested = contract.server?.suggestedName;
  if (suggested !== config.mcp.serverKey) {
    problems.push(`the server suggests the registration key "${suggested}" but engine.config.json `
      + `says "${config.mcp.serverKey}". ${INCONSISTENT}`);
  }
  return problems;
}

export const run = async (ctx) => {
  const pin = ctx.pin ?? JSON.parse(
    (await import('node:fs')).readFileSync(
      (await import('node:path')).join(ctx.root, 'packages/contract/required-tools.json'), 'utf8'));

  const problems = checkContract({ root: ctx.root, config: ctx.config, pin,
    ...(ctx.loadContract ? { load: ctx.loadContract } : {}) });

  if (problems.length > 0) {
    return { status: 'fail', detail: problems[0], remedy: null };
  }
  return { status: 'ok',
    detail: `sha ${pin.contractSha256.slice(0, 12)}, ${pin.tools.length} pinned tools`,
    data: { contractSha: pin.contractSha256.slice(0, 12), pinnedTools: pin.tools.length } };
};
