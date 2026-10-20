// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-08-S02 — the three sentences a check can end with, written once.
//
// A check returns data, never text a reader sees directly: the runner redacts it, the text report
// pads it into a column and the JSON report keys it. These helpers exist so that twenty-three
// checks cannot each invent a slightly different shape for "this is fine" — and so `data` is
// always present, which S09 renders without re-deriving anything.

/** @returns {{status: 'ok', detail: string, data: object}} */
export const ok = (detail, data = {}) => ({ status: 'ok', detail, data });

/** A condition the operator should see but which does not fail the run. */
export const warn = (detail, extra = {}) => ({ status: 'warn', detail, data: {}, ...extra });

/** A condition that fails the run. `remedy` is what to do; `command` is what to type. */
export const fail = (detail, extra = {}) => ({ status: 'fail', detail, data: {}, ...extra });

/** Not applicable on this platform or in this mode — never a synonym for `ok`. */
export const skip = (detail, data = {}) => ({ status: 'skip', detail, data });

/**
 * A result carried over from another module's checker (B00's, or the docs status').
 *
 * Those return `{status, detail, remedy}` with their own id. The id is dropped — the registry owns
 * it here — and everything else is kept verbatim, because the point of wrapping rather than
 * re-implementing is that the sentence the bootstrap prints and the sentence the doctor prints are
 * the same sentence.
 */
export function fromStep(result, data = {}) {
  const { id: _id, remedy, ...rest } = result;
  return {
    ...rest,
    ...(remedy ? { remedy } : {}),
    data: { ...data, ...(result.data ?? {}) },
  };
}
