// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * Schema Cache — TTL-based in-memory cache for discovered table schemas.
 * Used by the dynamic schema discovery tool to avoid re-querying on every call.
 *
 * Keyed by INSTANCE and table (ARC-09-C98). It was keyed by table alone, so a server holding two
 * instances answered the second with the first one's columns for half an hour; a custom table, or
 * a column added on one of them, is exactly what differs between instances.
 */
const DEFAULT_TTL_MS = 30 * 60 * 1000; // 30 minutes
/** A NUL cannot occur in a label or in a table name, so two pairs never share a key. */
const keyOf = (instance, table) => `${instance}\u0000${table}`;
class SchemaCache {
    cache = new Map();
    /** Get cached schema if still valid. `instance` is the label of the instance it was read from. */
    get(instance, table) {
        const key = keyOf(instance, table);
        const entry = this.cache.get(key);
        if (!entry)
            return undefined;
        if (Date.now() - entry.cachedAt > entry.ttlMs) {
            this.cache.delete(key);
            return undefined;
        }
        return entry;
    }
    /** Store schema for a table of an instance. */
    set(instance, table, columns, ttlMs = DEFAULT_TTL_MS) {
        this.cache.set(keyOf(instance, table), {
            instance,
            table,
            columns,
            cachedAt: Date.now(),
            ttlMs,
        });
    }
    /** Remove expired entries. */
    evictExpired() {
        const now = Date.now();
        for (const [key, entry] of this.cache) {
            if (now - entry.cachedAt > entry.ttlMs) {
                this.cache.delete(key);
            }
        }
    }
    /** Get all dynamically generated tool definitions across all cached tables. */
    // getGeneratedTools() was removed by ARC-04-S08 with the runtime-generated tools.
    // This is a COLUMN cache now: it remembers what a table looks like, and nothing
    // it returns can change the shape of tools/list.
    /** The tables cached for an instance. */
    getCachedTables(instance) {
        this.evictExpired();
        return Array.from(this.cache.values()).filter((e) => e.instance === instance).map((e) => e.table);
    }
    /** Clear all cached schemas. */
    clear() {
        this.cache.clear();
    }
}
// buildDynamicTools was removed by ARC-04-S08 with the runtime-generated tools.
export const schemaCache = new SchemaCache();
