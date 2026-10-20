// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
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
export const DEFAULT_MAX_RESULT_CHARS = 100_000;
/**
 * The `_meta` field name the MCP client uses to state its own ceiling.
 *
 * Named FIELD rather than KEY deliberately: as `META_CAP_KEY` the line read as
 * `<something>_KEY = '<slash-separated string>'` and gitleaks' `generic-api-key` rule flagged
 * it as a credential. It is a field name in a request, not a key — and a fingerprint entry in
 * `.gitleaksignore` would have been pinned to the commit sha and needed re-adding after every
 * rebase, so the name is the fix rather than the suppression.
 */
export const META_CAP_FIELD = 'anthropic/maxResultSizeChars';
/**
 * The ceiling for one call: the client's `_meta` if it named a positive number, else the
 * environment, else the default.
 *
 * A non-positive or non-numeric `_meta` value falls through rather than being honoured. A cap
 * of 0 or -1 would mean "return nothing", which no client can have meant, and a NaN from a
 * string like "100k" would silently make every comparison false and disable capping entirely —
 * the one outcome this module exists to prevent.
 */
export function resolveCap(meta, env = process.env) {
    const fromMeta = meta?.[META_CAP_FIELD];
    if (typeof fromMeta === 'number' && Number.isFinite(fromMeta) && fromMeta > 0) {
        return Math.floor(fromMeta);
    }
    const raw = env.SNOW_MAX_RESULT_CHARS;
    if (raw !== undefined && raw !== '') {
        const parsed = Number(raw);
        if (Number.isFinite(parsed) && parsed > 0)
            return Math.floor(parsed);
        // A malformed value is worth saying out loud: silently using the default would look
        // identical to the variable working, and the operator would never learn it did nothing.
        console.error(`[WARN] SNOW_MAX_RESULT_CHARS="${raw}" is not a positive number. `
            + `Using ${DEFAULT_MAX_RESULT_CHARS}.`);
    }
    return DEFAULT_MAX_RESULT_CHARS;
}
/** An object carrying an array under `records` — the shape every query tool returns. */
function recordsOf(result) {
    if (!result || typeof result !== 'object' || Array.isArray(result))
        return null;
    const records = result.records;
    return Array.isArray(records) ? records : null;
}
const serialise = (v) => (typeof v === 'string' ? v : JSON.stringify(v, null, 2));
function cutText(text, cap) {
    const marker = `… [truncated at ${cap} chars]`;
    if (cap <= marker.length)
        return marker.slice(0, cap);
    return text.slice(0, cap - marker.length) + marker;
}
/**
 * Fit a tool result under `cap`.
 *
 * A result already under the cap is returned untouched, with NO `truncated` key added — a
 * caller checking `if (result.truncated)` must not have to distinguish false from absent, and
 * a small result that grew a new field would change the shape of every ordinary response to
 * describe something that did not happen.
 */
export function capResult(result, cap) {
    const full = serialise(result);
    if (full.length <= cap)
        return { text: full, truncated: false, strategy: null };
    const records = recordsOf(result);
    if (records) {
        const total = records.length;
        // Drop from the END and re-serialise, because the envelope below is itself part of the
        // budget: computing a record count from the oversized text and slicing to it produces
        // something over the cap once `truncated`, `returned`, `total_fetched` and `hint` are
        // added. Binary search rather than a linear walk — a 50k-record result would otherwise
        // serialise 50k times.
        const envelope = (kept) => serialise({
            ...result,
            records: kept,
            truncated: true,
            returned: kept.length,
            total_fetched: total,
            hint: 'Narrow the query or lower `limit`; the dropped records were taken from the end.',
        });
        let lo = 0;
        let hi = total - 1; // the full set is already known not to fit
        let best = envelope([]);
        while (lo <= hi) {
            const mid = Math.floor((lo + hi) / 2);
            const candidate = envelope(records.slice(0, mid));
            if (candidate.length <= cap) {
                best = candidate;
                lo = mid + 1;
            }
            else
                hi = mid - 1;
        }
        // Even zero records plus the envelope can exceed a very small cap. Falling through to the
        // text cut keeps the one promise this function makes — never over the cap — rather than
        // returning a "valid JSON" result that breaks it.
        if (best.length <= cap) {
            return { text: best, truncated: true, strategy: 'records' };
        }
    }
    return { text: cutText(full, cap), truncated: true, strategy: 'chars' };
}
