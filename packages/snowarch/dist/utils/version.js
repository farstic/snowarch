// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
let cached;
/**
 * Reads the package version once from package.json so reported versions (MCP server
 * handshake, /health) stay in sync with the package instead of a hardcoded string.
 * Resolves dist/utils/version.js -> ../../package.json (and src/utils in dev).
 */
export function getPackageVersion() {
    if (cached !== undefined)
        return cached;
    let version = '0.0.0';
    try {
        const here = dirname(fileURLToPath(import.meta.url));
        const pkg = JSON.parse(readFileSync(join(here, '..', '..', 'package.json'), 'utf8'));
        if (typeof pkg.version === 'string')
            version = pkg.version;
    }
    catch {
        /* keep fallback */
    }
    cached = version;
    return version;
}
