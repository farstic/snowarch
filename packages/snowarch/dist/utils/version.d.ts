/**
 * Reads the package version once from package.json so reported versions (MCP server
 * handshake, /health) stay in sync with the package instead of a hardcoded string.
 * Resolves dist/utils/version.js -> ../../package.json (and src/utils in dev).
 */
export declare function getPackageVersion(): string;
