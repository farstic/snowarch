// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
import { cliSpelling } from '../cli/tty.js';
/**
 * The registry contract, shared with ARC-08's unified doctor.
 *
 * Two doctors exist by design: this one owns the checks only the server package can perform —
 * the store's schema and modes, the flag rules, a real stdio handshake against itself — and
 * ARC-08's owns the engine's. The alternative was ARC-08 re-implementing the flag rules in a
 * second language, which is P-16: two implementations of one rule diverge, and the one users
 * see is the one that is wrong.
 *
 * Ids are `SV-xx` from the first commit. `01` §8 called them `S-xx`, which collides with the
 * spike ids `S-01`…`S-26` in `03`, and ARC-08-S01 had a planned rename step to fix that later.
 * Shipping the final ids now makes that step a no-op, and they live in ONE exported constant so
 * a future re-home is a single line.
 */
export const CHECK_IDS = [
    'SV-00', 'SV-01', 'SV-02', 'SV-03', 'SV-04', 'SV-05', 'SV-06', 'SV-07', 'SV-08', 'SV-09',
];
/**
 * Returns `skip`, always — the shape the doctor binds when no instance is configured.
 *
 * ARC-07-S03 supplies the real implementation (`probeAll`, exported as `@farstic/snowarch/probes`);
 * ARC-08-S04 is where the doctor chooses to bind it, because that is the story that owns what the
 * doctor RENDERS. This stub stays as the unconfigured answer rather than being deleted: "there is
 * no instance to probe" is a real state, and `skip` is its honest report.
 */
/**
 * ARC-07-C38 — A FACTORY, because a `const` cannot read a ctx.
 *
 * It was an object whose remedy called `cliSpelling()`, which is the shape that made the stub render
 * one shell while the ctx said another. The doctor builds it with the shell it was given.
 */
export const stubProbesFor = ({ platform, env }) => ({
    async runAll() {
        return {
            status: 'skip',
            detail: 'no instance configured, so there is nothing to probe',
            // ARC-07-C38 — from the shell the doctor was TOLD about. A stub that rendered a different shell
            // from the thing it stands in for would let a case pass against a sentence the product never
            // prints, which is the whole reason the stub exists rather than being deleted.
            remedy: `add one with ${cliSpelling(platform, env)} instance add, `
                + `then run ${cliSpelling(platform, env)} instance test`,
        };
    },
});
