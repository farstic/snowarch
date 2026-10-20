/**
 * Structured stderr logger.
 *
 * - SNOW_LOG_LEVEL, then LOG_LEVEL (error | warn | info | debug, default: info) gates which
 *   messages are emitted. SNOW_LOG_LEVEL is what `.mcp.json` passes (01 §5); LOG_LEVEL stays as a
 *   fallback so an existing environment keeps working.
 * - REDACT_SENSITIVE_DATA deep-scrubs sensitive keys (passwords, tokens, secrets, …) and
 *   credential-shaped STRING VALUES from logged data before output. It is on by default
 *   (`!== 'false'`), and was opt-in (`=== 'true'`) until ARC-04-S10: a default that has to be
 *   switched on protects nobody who did not already know to switch it on, and the people most
 *   likely to paste a log into a ticket are the ones who never set it.
 *   `REDACT_SENSITIVE_DATA=false` opts out for local debugging. That is dangerous by design —
 *   it prints credentials — and is documented as such.
 * All output goes to stderr so stdout stays a clean JSON-RPC stream for the MCP stdio transport.
 */
type LogLevel = 'error' | 'warn' | 'info' | 'debug';
export declare function withLogLevel<T>(level: LogLevel, fn: () => Promise<T>): Promise<T>;
export declare const logger: {
    debug(message: string, data?: unknown): void;
    info(message: string, data?: unknown): void;
    warn(message: string, data?: unknown): void;
    error(message: string, error?: unknown): void;
};
export {};
