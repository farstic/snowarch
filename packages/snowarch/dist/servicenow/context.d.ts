import type { ServiceNowClient } from './client.js';
export declare const FLAG_NAMES: readonly ["WRITE_ENABLED", "CMDB_WRITE_ENABLED", "SCRIPTING_ENABLED", "ATF_ENABLED", "NOW_ASSIST_ENABLED", "FLUENT_ENABLED"];
export type FlagName = (typeof FLAG_NAMES)[number];
export type Flags = Record<FlagName, 'true' | 'false'>;
export interface InstanceRuntime {
    label: string;
    url: string;
    environment: string;
    preset: string;
    /** As the store declares them. */
    flags: Flags;
    /** After preset expansion and the dependency rule — this is what the gates read. */
    effectiveFlags: Flags;
    toolPackage: 'full';
    maxRecords: number;
    prodWriteAck: boolean;
    client: ServiceNowClient;
    warnings: string[];
}
export declare function runWithInstance<T>(rt: InstanceRuntime, fn: () => T): T;
/**
 * The ambient instance. Throwing rather than returning a permissive default is the point:
 * a gate that cannot tell which instance it is protecting must not decide it is allowed.
 */
export declare function currentInstance(): InstanceRuntime;
/**
 * Enter an instance for the rest of this synchronous run and its async continuations.
 *
 * TEST GLUE ONLY, and production never calls it: the server uses `runWithInstance`, which
 * scopes the instance to exactly one request and cannot leak into the next. `enterWith` has
 * no such boundary, which is what makes it usable from a `beforeEach` and unsuitable for a
 * request handler.
 */
export declare function enterInstance(rt: InstanceRuntime): void;
/**
 * Run OUTSIDE any instance. Test glue: `tests/setup.ts` enters a runtime before every test,
 * so without this there is no way left to observe the no-instance state — and that state is
 * a real production property worth asserting (a gate that cannot tell which instance it is
 * protecting must refuse, not allow).
 */
export declare function outsideInstance<T>(fn: () => T): T;
/** For tests and for callers that must not throw — the server's capability read, notably. */
export declare function currentInstanceOrNull(): InstanceRuntime | null;
