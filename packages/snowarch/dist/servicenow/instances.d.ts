import { ServiceNowClient } from './client.js';
import { type StoreError, type StoreSource } from '../store/index.js';
import { type Flags, type InstanceRuntime } from './context.js';
export type InstanceEntry = InstanceRuntime;
/** An instance the store declared but the server refused to load, and why. */
export interface NotLoaded {
    label: string;
    code: string;
    message: string;
}
export interface LoadReport {
    /** Where the configuration came from. `env-instances` means the SERVICENOW_ and SN_INSTANCE_
     *  variables, which is a different thing from SNOW_STORE (that is `source: 'env'`). */
    source: StoreSource | 'env-instances';
    /** Masked — this string goes to a log. */
    path: string | null;
    loaded: string[];
    notLoaded: Array<{
        label: string;
        code: string;
        message: string;
    }>;
    configErrors: StoreError[];
    /** Non-fatal: the store loaded, but something about it is worth saying out loud. */
    warnings: string[];
    notes: string[];
}
declare class InstanceManager {
    private instances;
    private currentName;
    private report;
    constructor();
    /** Idempotent: clears and reloads. Returns the report rather than logging it, so the
     *  caller decides what reaches stdout — this process shares stdout with JSON-RPC. */
    load(): LoadReport;
    getReport(): LoadReport;
    private envInstanceLabels;
    private registerFromEnv;
    private register;
    /**
     * Build the runtime and apply the three rules, in this order:
     *   1. expand the preset (or take `custom`'s flags as given),
     *   2. force a dependent flag false when WRITE is absent,
     *   3. refuse to load a prod instance raised above read-only without an acknowledgement.
     *
     * Order matters: the prod check reads EFFECTIVE flags, so a contradiction resolved in
     * step 2 must not still count as "raised" in step 3. A `custom` prod instance declaring
     * SCRIPTING without WRITE is not raised — and refusing it would be refusing a store that
     * is, in effect, read-only.
     */
    private registerClient;
    /** Return client for named instance (or current instance if no name given). */
    getClient(name?: string): ServiceNowClient;
    /** Reload from disk — after the wizard or the doctor writes the store. */
    reload(): LoadReport;
    switch(name: string): void;
    /** How many instances actually loaded — the server advertises its tool set on this. */
    loadedCount(): number;
    getCurrentName(): string;
    getCurrentUrl(): string;
    getEntry(name?: string): InstanceEntry | undefined;
    listNames(): string[];
    /**
     * What a caller may see about the configured instances.
     *
     * Credentials are never in this shape — not the password, not the client secret, not the
     * username. The entries hold a constructed client, and it would be one spread away to
     * leak the config that built it; naming each field explicitly is what stops that, and
     * `tests/servicenow/prod-ack.test.ts` asserts the JSON contains none of them.
     *
     * Instances the server refused to load appear too, with their reason. Omitting them
     * would make a store's `prod` entry simply vanish, and "it is not there" is a worse
     * answer than "it is there and here is why it is not usable".
     */
    listAll(): Array<{
        name: string;
        url: string;
        active: boolean;
        environment: string;
        preset: string;
        status: 'loaded' | 'not_loaded';
        reason?: string;
        flags?: Flags;
        warnings?: string[];
    }>;
    /** The runtime for the ambient call — what `runWithInstance` is given. */
    current(): InstanceRuntime;
}
export declare const instanceManager: InstanceManager;
export {};
