// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-11-C1 — E-31, the licence: what the banner says, as a check, so `status` and the doctor say it too.
//
// A WARNING, NEVER A FAILURE, AND IN THE QUICK SET. Nobody had a licence before 2.0.12, so a failure
// here would fail bootstrap's closing check, the status panel and CI for every user — the opposite of
// the owner's first requirement. Enforcement does not change the severity: the refusals are the CLI's
// and the server's, and the doctor is one of the commands a person runs to see why.
//
// OFFLINE. It reads `.local/licence.json` and the cached list; the list is fetched only by a command a
// person started, or by a live server start.
//
// THE DATA NAMES THE STATE AND THE ID, never the licensee or the org: a report's `--json` and the
// banner's cache travel further than the licence file does.
import { REFUSED, REMEDY, bannerLine, daysLeftPhrase, licenceStatus, renewalSentence } from '../../licence/state.mjs';
import { PRODUCT_KEYS } from '../../licence/keys.mjs';
import { defineCheck } from '../registry.mjs';
import { cliOf } from '../spell.mjs';
import { fail, ok, warn } from './result.mjs';

/**
 * ARC-11-C6 (ruling R1) — what a step or a check that cannot run without a licence says instead of running. B06 and
 * B08 skip with it, and the server checks that call a tool will report it (step 5). They are E-31's words, so
 * every one points at the check that names the state and its remedy, and none keeps a copy.
 */
export const NO_LICENCE_IN_FORCE = 'no licence in force (see E-31)';

/**
 * ARC-11-C6 — the newest release with no licence enforcement; 2.0.13 is the first that enforces. INTERNAL ONLY, and
 * never printed: by the owner's ruling from the rc.3 sitting (2026-10-13), "the user must not learn how to have a
 * working Architect without a licence". `upgrade` decides by it, and the upgrade e2e builds its world from its tag.
 */
export const LAST_UNENFORCED_RELEASE = 'v2.0.12';

export function licenceChecks() {
  return [
    defineCheck({
      id: 'E-31',
      section: 'repo',
      title: 'the licence for this checkout',
      // ARC-11-C6 step 5 — a FAIL for a refused state, because nothing runs without a licence in force. The doctor
      // names this as the one cause, and the server check that would fail behind it skips with its reason.
      severity: 'fail',
      quick: true,
      network: false,
      spawns: false,
      fixable: false,
      run: async (ctx) => {
        // `licenceKeys` is a test seam: a suite injects the keys it generated. Nothing in the product sets it.
        const s = licenceStatus(ctx.root, { keys: ctx.licenceKeys ?? PRODUCT_KEYS, now: new Date(ctx.now()) });
        // `perpetual` because the status panel renders its Licence line from this data with the banner's
        // function, and a perpetual licence has no `validUntil` to print.
        const data = { state: s.state, id: s.id, scope: s.scope, validUntil: s.validUntil, perpetual: s.perpetual,
          enforced: s.enforced, listVersion: s.list?.version ?? null };
        const line = bannerLine(s);
        if (s.state === 'ok') return ok(line, data);
        const why = s.state === 'expiring' ? daysLeftPhrase(s.daysLeft) : (s.state === 'missing' ? null : s.reason);
        const cli = cliOf(ctx);
        // `expiring` is in force, so it is a warning; the refused states are what enforcement refuses (gate.ts).
        // A refused state's remedy is the refusal's, and nothing after it (the owner's ruling, 2026-10-13). A licence in
        // force that is expiring is renewed, not reinstalled (ARC-09-C159).
        const refused = REFUSED.includes(s.state);
        return (refused ? fail : warn)(why ? `${line} — ${why}` : line, {
          data,
          remedy: s.state === 'expiring' ? renewalSentence(s) : REMEDY(cli),
          command: `${cli} licence check`,
        });
      },
    }),
  ];
}
