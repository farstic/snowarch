/**
 * A hard ceiling on what one tool result may put into a client's context.
 *
 * P-27: a `snow_core_records_query` against a large table returned every record the instance
 * gave back, serialised in full. A single call could carry hundreds of thousands of characters
 * into the conversation, and the caller had no way to know it had happened — the result looked
 * exactly like a small one, only longer. Everything here exists to make the opposite true: the
 * output is never over the cap, and when it was cut the result SAYS so, in a field the caller
 * can branch on rather than a sentence it has to read.
 *
 * The two cutting strategies are not interchangeable. A records-shaped result is a LIST, and
 * dropping whole records from the end leaves valid JSON the caller can still parse and use.
 * Everything else is cut as text, which does not, and that is the point of preferring the
 * first: a string cut through a JSON document produces something no caller can do anything
 * with except notice the marker.
 */
/** Used when neither the request `_meta` nor `SNOW_MAX_RESULT_CHARS` says otherwise. */
export declare const DEFAULT_MAX_RESULT_CHARS = 100000;
/**
 * The `_meta` field name the MCP client uses to state its own ceiling.
 *
 * Named FIELD rather than KEY deliberately: as `META_CAP_KEY` the line read as
 * `<something>_KEY = '<slash-separated string>'` and gitleaks' `generic-api-key` rule flagged
 * it as a credential. It is a field name in a request, not a key — and a fingerprint entry in
 * `.gitleaksignore` would have been pinned to the commit sha and needed re-adding after every
 * rebase, so the name is the fix rather than the suppression.
 */
export declare const META_CAP_FIELD = "anthropic/maxResultSizeChars";
export interface CappedResult {
    /** The text to return. Never longer than the cap. */
    text: string;
    /** Whether anything was removed — the caller's own signal, not a guess from the length. */
    truncated: boolean;
    /** 'records' if whole records were dropped, 'chars' for the text cut, null if untouched. */
    strategy: 'records' | 'chars' | null;
}
/**
 * The ceiling for one call: the client's `_meta` if it named a positive number, else the
 * environment, else the default.
 *
 * A non-positive or non-numeric `_meta` value falls through rather than being honoured. A cap
 * of 0 or -1 would mean "return nothing", which no client can have meant, and a NaN from a
 * string like "100k" would silently make every comparison false and disable capping entirely —
 * the one outcome this module exists to prevent.
 */
export declare function resolveCap(meta?: unknown, env?: NodeJS.ProcessEnv): number;
/**
 * Fit a tool result under `cap`.
 *
 * A result already under the cap is returned untouched, with NO `truncated` key added — a
 * caller checking `if (result.truncated)` must not have to distinguish false from absent, and
 * a small result that grew a new field would change the shape of every ordinary response to
 * describe something that did not happen.
 */
export declare function capResult(result: unknown, cap: number): CappedResult;
