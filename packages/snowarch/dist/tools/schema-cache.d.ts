/**
 * Schema Cache — TTL-based in-memory cache for discovered table schemas.
 * Used by the dynamic schema discovery tool to avoid re-querying on every call.
 *
 * Keyed by INSTANCE and table (ARC-09-C98). It was keyed by table alone, so a server holding two
 * instances answered the second with the first one's columns for half an hour; a custom table, or
 * a column added on one of them, is exactly what differs between instances.
 */
export interface ColumnSchema {
    element: string;
    internal_type: string;
    label: string;
    /** The dictionary's limit, or null when it states none (blank, 0, not a number): unknown, never 255. */
    max_length: number | null;
    mandatory: boolean;
    reference?: string;
    read_only: boolean;
    default_value?: string;
}
export interface CachedSchema {
    instance: string;
    table: string;
    columns: ColumnSchema[];
    cachedAt: number;
    ttlMs: number;
}
declare class SchemaCache {
    private cache;
    /** Get cached schema if still valid. `instance` is the label of the instance it was read from. */
    get(instance: string, table: string): CachedSchema | undefined;
    /** Store schema for a table of an instance. */
    set(instance: string, table: string, columns: ColumnSchema[], ttlMs?: number): void;
    /** Remove expired entries. */
    evictExpired(): void;
    /** Get all dynamically generated tool definitions across all cached tables. */
    /** The tables cached for an instance. */
    getCachedTables(instance: string): string[];
    /** Clear all cached schemas. */
    clear(): void;
}
export declare const schemaCache: SchemaCache;
export {};
