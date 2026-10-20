// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// B03 mode — write down the answer the plan screen already collected.
//
// No prompt of its own, deliberately: principle 10 says the installation asks once, and a step that
// re-asked "are you sure about live?" would be the second question. What it does is make the
// decision DURABLE — into the state the doctor reads and into `.local/config.json` the launchers
// read — and, by being an input to B06, B07 and B08, make a changed mode re-run exactly the steps
// that depend on it.
import { TEXT } from './inputs.mjs';
import { INPUTS } from '../inputs.mjs';

export const id = 'B03';
export const title = 'mode';
export const needsNode = false;
export const runsWhen = () => true;
// ARC-09-S05: the declaration lives in `lib/inputs.mjs`. Ten steps answering "what are my
// inputs" in ten files is ten places to get the resume rule wrong, and no way to show a user the
// set — the table is one answer, and `docs/ARCHITECTURE.md` renders from it.
export const inputs = INPUTS.B03.resolve;

export const run = async (ctx) => {
  // ARC-06-C7 — B03 RECORDS NOTHING. It used to write both `state.mode` and the config here, at
  // step 3, which made the switch true on disk before the steps that make it true had run: a live
  // switch that failed at B06 left `mode: live` recorded with the toggles still set to design, so
  // `./snowarch mode` said live while `settings.local.json` disabled the server and the doctor
  // reported `E-10 FAIL … mode is live but servicenow is disabled`. There is no rollback in this
  // runner and adding one would be a second mechanism to keep honest; the mode is simply written by
  // the step that makes it true (B07, the toggles), so an interrupted switch leaves the PREVIOUS
  // mode recorded and E-10 green.
  //
  // Nothing downstream loses an input: every `runsWhen` reads `ctx.mode`, the mode being REQUESTED,
  // never `ctx.state.mode`, and B07 already writes exactly this config with the same fields.
  return { status: 'ok', detail: ctx.mode, data: { mode: ctx.mode } };
};
