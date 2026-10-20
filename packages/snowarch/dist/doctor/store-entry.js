// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * One entry AS THE FILE HOLDS IT — before preset expansion, before flag completion.
 *
 * The loaded runtime is not the same object: `completeFlags` fills every absent flag from the
 * preset, so by the time a check sees `instanceManager`'s entry, all six are there and
 * "which flags did the user actually state?" has no answer. SV-03's FLAGS_INCOMPLETE is a fact
 * about the FILE, and the probe binding needs the credentials the runtime deliberately does not
 * carry, so both read here.
 */
import { loadStore, resolveStorePath } from '../store/index.js';
export function storeEntry(label) {
    const resolved = resolveStorePath();
    const path = resolved?.path;
    if (!path)
        return undefined;
    const result = loadStore(path);
    if ('error' in result)
        return undefined;
    return result.store.instances?.[label];
}
