/**
 * The doctor's probes: ARC-07-S03's implementation, adapted to ARC-04-S12's declaration.
 *
 * Two signatures existed for one job — the doctor declared `runAll(instanceLabel)` before the
 * probes were written, and the probes landed as `probeAll(client, options)`. Adapting them in ONE
 * place is the whole point of this file: a check that built its own client would be a second
 * answer to "how do we authenticate a probe", and the first thing such an answer loses is
 * `maxRetries: 0` — the rule that stops a 401 becoming three.
 *
 * WHAT THIS NEVER DOES IS WRITE. The wizard records `lastProbe` in the store; the doctor reads and
 * reports. A doctor that wrote its findings would change the file it is diagnosing, and a user
 * comparing two runs could not tell which changes were theirs.
 */
import { probeClientFor } from '../servicenow/probe-client.js';
import { probeAll } from '../servicenow/probes.js';
import type { ProbeClient, ProbeAll } from '../servicenow/probes.js';
import type { StoreInstance } from '../store/schema.js';
import { storeEntry } from './store-entry.js';
import type { CheckStatus, Probes } from './types.js';
/** `auth ok · write ok · scripting role missing (…)` — one line, statuses only. */
export declare function describeProbes(result: ProbeAll): string;
/** The worst status wins, and only `ok` is ok. A probe that could not run is a `warn`, not a pass. */
export declare function statusOf(result: ProbeAll): CheckStatus;
export interface ProbeBindingDeps {
    probe?: typeof probeAll;
    makeClient?: (entry: Parameters<typeof probeClientFor>[0]) => ProbeClient;
    env?: NodeJS.ProcessEnv;
    /** ARC-07-C38 — beside the `env` this already took, for the remedy below. */
    platform?: NodeJS.Platform;
    /** The store, injected: a test supplies an entry without writing credentials to a disk. */
    readEntry?: (label: string) => StoreInstance | undefined;
}
/**
 * The real probes, bound to the store.
 *
 * `stubProbes` stays the answer for "no instance configured" — that is a real state and `skip` is
 * its honest report — so this returns the same shape and the caller chooses between them by
 * whether an entry exists.
 */
export { storeEntry };
export declare function makeProbes(deps?: ProbeBindingDeps): Probes;
