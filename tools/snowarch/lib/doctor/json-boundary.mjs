// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-08-C1 — what the `--json` form may carry, and what it may not.
//
// `--json` IS THE FORM THAT TRAVELS. The text report, the banner and the doctor cache are local to
// one machine and keep the user's own words; the JSON is what an issue template asks a stranger to
// paste into a public tracker, and a validation record's lint would refuse the same content
// (ARC-10-S07). So this masks at the boundary rather than at each site that writes a string.
//
// MEASURED, on a live fixture at ARC-10-S10: the label appeared in SEVEN fields across four shapes
// — `modeLine`, `modeLineDetailed`, `server.instances[].label`, two check `detail` strings and two
// `data.fix*.label` payloads. That is the argument for masking BY VALUE rather than by field: the
// eighth field arrives without anyone remembering the ruling that created this file.
//
// THE STANDARD THIS BOUNDARY IS HELD TO is ARC-10-S07's own six redaction patterns — the ones a
// validation record is refused for. Labels and hosts were the two the ruling named; the home path
// is the third, and it was found by the test asserting the general property rather than by anyone
// re-reading this file (ARC-08-C1, second pass). If a seventh field shape arrives, the S07 scan in the test is
// what will say so.
//
// The host was NOT in that JSON. It is masked anyway, with the same shape the cache guard uses
// (ARC-09-C9's `INSTANCE_HOST`, imported rather than rewritten): the guard exists because
// `redact()` leaves an instance address alone, and a report that only happens not to carry one is
// not the same as a report that cannot.
import { realpathSync } from 'node:fs';

import { INSTANCE_HOST } from '../doctor-cache.mjs';

export const LABEL_MASK = '<label>';
export const HOST_MASK = '<host>';
export const HOME_MASK = '~';

/**
 * A home directory, in every shape the platforms write one — `/Users/<name>`, `/home/<name>`,
 * `C:\Users\<name>` and the forward-slash form Node hands back on Windows.
 *
 * ARC-08-C1, second pass. The label and the host were masked here from the start; the checkout PATH was not, and
 * it carries the user's account name on every platform. Measured on a real (non-fixture) report:
 * three fields — `checks[].detail`, `checks[].data.root`, `checks[].data.toplevel` — each reading
 * `/Users/<me>/work/snowarch`.
 *
 * Only the home prefix goes. What follows it is the part a maintainer reading a pasted report
 * actually uses — how deep the checkout is, whether the path has a space in it, which drive it is
 * on. That is the part a maintainer reading a pasted report uses, and none of it names
 * anybody. `~` rather than a bracketed token because the result is still a path and reads
 * as one — `~/work/repo`.
 */
const HOME_PATH = /(?:[A-Za-z]:)?[\\/](?:Users|home)[\\/][^\\/\s"'`,;:]*/g;

/**
 * The home the ENTRY POINT was given, masked BY VALUE — the same argument as the label.
 *
 * The four shapes above are the common ones, not the only ones: a home can be `/opt/people/ana`, a
 * mounted volume, or whatever an administrator chose, and none of those match a pattern. The
 * machine's own answer covers the case no pattern can.
 *
 * IT ARRIVES AS AN ARGUMENT, and that is a rule rather than a preference: nothing under `lib/` reads
 * the home directory itself — not `homedir()`, not `process.env.HOME`, not `USERPROFILE`.
 * `tools/snowarch/tests/mode-register.test.mjs` fails the build on any of them. `bin/snowarch.mjs`
 * calls `homedir()` once and threads the answer through, which is also what lets a test point a
 * whole run at a fixture without touching the environment. The first version of this file read the
 * environment directly and that guard caught it, correctly.
 *
 * (This paragraph is allowed to SPELL what the rule forbids only because of ARC-06-C1: the guard
 * used to scan raw text and fired on the prose explaining it. Naming them here is the point — a
 * reader who does not know which two variables are meant cannot obey the rule.)
 *
 * The guard on the VALUE is not decoration either. A home of `/`, a bare drive root or an empty
 * string would match inside every absolute path in the report and turn it to nonsense; below four
 * characters there is nothing worth masking and plenty to break, so such a value is ignored and the
 * shapes above still apply.
 */
export function homeValues(home, { realpath = realpathSync } = {}) {
  if (typeof home !== 'string') return [];
  const v = home.trim().replace(/[\\/]+$/, '');
  if (v.length < 4 || /^[A-Za-z]:$/.test(v)) return [];

  // ARC-08-C20 — BOTH SPELLINGS, and the longer one first.
  //
  // A path can reach the report resolved while the home arrives unresolved, and on macOS that is
  // the normal case rather than an edge: `os.tmpdir()` says `/var/folders/…` and the realpath of
  // anything inside it is `/private/var/folders/…`. Replacing the unresolved prefix INSIDE the
  // resolved path left `/private` in front of the mask, and the committed fixture carried
  // `toplevel: '/private~'` — a masker that only works where it was written, which is the same
  // class as the harness symlink `realpathOrSelf` exists for in `doctor/index.mjs`.
  //
  // Longest first because the order is the bug: mask `/var/folders/x` before
  // `/private/var/folders/x` and the second can never match.
  //
  // `realpath` is a parameter so the closed path can be driven without a symlink on disk, and it
  // is allowed to throw — a home that does not exist is still a string worth masking.
  let resolved = null;
  try { resolved = realpath(v).replace(/[\\/]+$/, ''); } catch { /* not on disk; the literal stands */ }

  // ARC-08-C20 — AND BOTH SEPARATORS, for the same reason as both realpaths.
  //
  // On Windows `git rev-parse --show-toplevel` answers with FORWARD slashes while the home arrives
  // with backslashes, so the by-value mask missed and only the generic `HOME_PATH` pattern fired —
  // masking `C:/Users/<name>` and leaving `~/AppData/Local/Temp/snowarch-doctor-lffMzB` in the
  // report. The username was covered; the rest of the path was not, and the value differed per run.
  // Three Windows cells failed on it. A masker that only works where it was written, a third time,
  // so this is the third spelling it now knows.
  // ONE DIRECTION ONLY. A Windows home holds backslashes and git prints forward ones, so the
  // forward spelling is added. The reverse never happens — a POSIX path has no backslashes to
  // convert, and generating `\var\folders\x` from `/var/folders/x` would put a string in the
  // mask list that nothing can produce and something might collide with.
  const spellings = [v, resolved]
    .filter((x) => typeof x === 'string')
    .flatMap((x) => (x.includes('\\') ? [x, x.replace(/\\/g, '/')] : [x]));

  return [...new Set(spellings.filter((x) => x.length >= 4))]
    .sort((a, b) => b.length - a.length);
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');


/** `\b` around a label, escaped — a label is a user's word, not a pattern. */
const wordRe = (s) => new RegExp(`\\b${s.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\b`, 'g');

/**
 * Every instance label the report knows about.
 *
 * Read from the report rather than from the store: the boundary masks what it is about to EMIT,
 * and a label that reached the object by some path nobody listed is exactly the case this is for.
 */
export function labelsIn(report) {
  const out = new Set();
  for (const i of report?.server?.instances ?? []) {
    if (typeof i?.label === 'string' && i.label.length > 0) out.add(i.label);
  }
  return [...out];
}

/**
 * The report as it leaves the process.
 *
 * WORD-BOUNDED, and the cost is stated rather than special-cased: a user whose label is `dev` also
 * masks the environment token, so `(dev)` reads `(<label>)`. That is the right trade — `dev` is
 * still the user's word for their instance, and a rule with an exception list is a rule whose
 * exceptions are wrong for somebody. The collision is asserted in the test, so it is documented
 * behaviour rather than a discovery.
 */
export function maskForJson(report, { labels = labelsIn(report), home = '' } = {}) {
  const res = [...labels].sort((a, b) => b.length - a.length).map((l) => [wordRe(l), LABEL_MASK]);
  // This run's own home FIRST — it is the most specific, and it may match no pattern at all — then
  // the generic shapes, which also cover a report quoting a path that is somebody else's home.
  const homes = homeValues(home).map((h) => new RegExp(escapeRe(h), 'g'));
  const maskString = (s) => {
    let out = s.replace(INSTANCE_HOST, HOST_MASK);
    for (const re of homes) out = out.replace(re, HOME_MASK);
    out = out.replace(HOME_PATH, HOME_MASK);
    for (const [re, to] of res) out = out.replace(re, to);
    return out;
  };
  const walk = (v) => {
    if (typeof v === 'string') return maskString(v);
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') {
      return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    }
    return v;
  };
  return walk(report);
}
