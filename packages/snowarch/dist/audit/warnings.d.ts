import type { AuditWarning } from './writer.js';
/** Group by code and table, in first-seen order. */
export declare function summariseWarnings(warnings: unknown): AuditWarning[];
/**
 * The warnings on a tool's result: its own top-level `warnings` key and nothing nested.
 * `attachWarnings` puts them there, either on the record or on the `{ warnings, result }` wrapper,
 * and a record's own column called `warnings` sits one level down, under `result`, where this does
 * not look.
 */
export declare function warningsOfResult(result: unknown): unknown[];
