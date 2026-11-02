// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-09-C254 — where the finder's printed copy stands in a reply. `/snowarch finding` prints a masked copy of a note for the user to
// send as it is (ARC-09-C252), and a finding records a path as the user saw it: the most natural finding to report is a dead
// citation. C231 does not check findings for that reason, and the Stop hook (hooks/stop-citations.mjs) does not check the copy.
//
// The copy is found by its own structure, not by reading the session's transcript: the hook has the reply, a transcript may not
// exist (a session that keeps none), and the structure is the finder's own output (finding.mjs `renderFinding`), which
// tests/hook/stop-citations.test.mjs runs through the real function in each of its four headers. A change to the finder's header or
// to the line that opens its review list breaks that test and not a user's turn.
//
// stdlib only: it imports nothing, because the Stop hook runs at the end of every turn.

/** The finder's first line, in the four spellings `renderFinding` gives it: the store read or not, the credentials read or not. */
const HEADER = /^(?:instance names masked by value: \d+ \(store read\)|instance store NOT read — check every instance name) · (?:credentials read|credentials NOT read — check usernames and passwords before sending)$/;

/** The line that opens the list of what the reader must check before sending. */
const REVIEW = 'Read before sending:';

/**
 * The indexes of the lines of `lines` that belong to a finder's printed copy: from its header to the last "- " item under the
 * "Read before sending:" line that follows it. A header with no such line after it is not a copy (the next header would end its
 * search), and a review list with no header is not one either.
 */
export function copyLines(lines) {
  const inside = new Set();
  for (let i = 0; i < lines.length; i += 1) {
    if (!HEADER.test(lines[i].trim())) continue;
    let review = -1;
    for (let j = i + 1; j < lines.length; j += 1) {
      const line = lines[j].trim();
      if (line === REVIEW) { review = j; break; }
      if (HEADER.test(line)) break;
    }
    if (review < 0) continue;
    let end = review;
    while (end + 1 < lines.length && /^\s*- /.test(lines[end + 1])) end += 1;
    for (let k = i; k <= end; k += 1) inside.add(k);
    i = end;
  }
  return inside;
}
