/**
 * The text the CallTool handler returns for a tool that threw.
 *
 * Kept apart from `server.ts` so the exact string — which the session rules parse for `(Code: X)` —
 * has a unit test. A tool that failed after it had written a value the platform stored cut gets one
 * server-built sentence after the error line (ARC-09-C93); it never repeats the error's own text and
 * carries no `(Code: …)` marker of its own.
 */
export declare function toolErrorText(error: unknown): string;
