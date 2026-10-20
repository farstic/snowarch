// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
import { ServiceNowError } from './errors.js';
import { describeCutsOnError } from '../servicenow/stored-values.js';
/**
 * The text the CallTool handler returns for a tool that threw.
 *
 * Kept apart from `server.ts` so the exact string — which the session rules parse for `(Code: X)` —
 * has a unit test. A tool that failed after it had written a value the platform stored cut gets one
 * server-built sentence after the error line (ARC-09-C93); it never repeats the error's own text and
 * carries no `(Code: …)` marker of its own.
 */
export function toolErrorText(error) {
    const cuts = describeCutsOnError(error);
    const note = cuts ? `\n${cuts}` : '';
    if (error instanceof ServiceNowError)
        return `Error: ${error.message} (Code: ${error.code})${note}`;
    return `Error executing tool: ${error instanceof Error ? error.message : 'Unknown error'}${note}`;
}
