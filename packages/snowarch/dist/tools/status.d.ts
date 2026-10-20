import type { ErrorCodeName } from '../errors/codes.js';
/** The five tools a session has when nothing is configured. `instance_switch` is NOT among
 *  them: there is nothing to switch to, and offering it would invite an error instead of a
 *  remedy. */
export declare const CORE_TOOLS_UNCONFIGURED: readonly ["snow_core_instances_index", "snow_core_instances_reload", "snow_core_current_instance_read", "snow_core_capabilities_read", "snow_core_status_read"];
export { NO_INSTANCE_MESSAGE } from '../no-instance.js';
/**
 * Why an instance tool is refusing, in the words of the ACTUAL reason.
 *
 * ARC-09-S06. "No instance is configured" is true whenever nothing loaded, and for a store whose
 * schema this build does not read it is the least useful true thing that can be said: the user has
 * instances, they are in the file, and the remedy is one command that the generic sentence does not
 * name. A schema `configError` therefore speaks for itself — its own code, its own message — and
 * everything else keeps the sentence it always had.
 */
export declare const SCHEMA_CONFIG_ERRORS: readonly ["STORE_SCHEMA_OUTDATED", "STORE_SCHEMA_NEWER"];
export declare function unconfiguredRefusal(configErrors: readonly {
    code: string;
    message: string;
}[]): {
    code: ErrorCodeName;
    message: string;
};
export declare function setAdvertisedCount(n: number): void;
export declare function getAdvertisedCount(): number;
export declare function setToolListChangedNotifier(fn: (() => void) | null): void;
/** The precedence as a reader needs to see it: the override, then the two file locations. */
export declare function storeCandidates(): Array<{
    source: string;
    path: string | null;
    exists: boolean;
}>;
export declare function serverStatus(): Record<string, unknown>;
export declare function currentCapabilities(): Record<string, unknown>;
/**
 * Re-read the store. The path is RE-RESOLVED, not remembered: the common case is a user who
 * ran `./snowarch instance add` in another terminal, so the store often did not exist when
 * the server started.
 *
 * `list_changed` is sent only when the advertised SET changed size (5 ↔ full). Sending it on
 * every reload would make a client re-fetch the catalogue for nothing.
 */
export declare function reloadInstances(): Record<string, unknown>;
export declare function setFullCatalogueSize(n: number): void;
export declare function fullCatalogueSize(): number;
