// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-06-S03 — what a step's inputs are, and how they become one hash.
//
// A step declares `inputs(ctx) → string[]`, and every entry is TAGGED: `file:<path relative to the
// root>` or `text:<value>`. The tag is not ceremony. Untagged, the runner has to guess whether
// `design-only` is a path or a value, and the guess it would make — "treat anything that is not on
// disk as a missing file" — hashes a literal as `<absent>` and makes two different modes produce
// the same hash. An untagged entry is therefore an error at hash time, so a step that gets this
// wrong cannot be written and then quietly cached forever.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const FILE = (p) => `file:${p}`;
export const TEXT = (v) => `text:${v}`;

/** A file that is not there. Hashed as this sentence, so "absent" and "empty" are different. */
export const ABSENT = '<absent>';

/**
 * `sha256:<hex>` over the tagged inputs, in the order the step declared them.
 *
 * Each entry contributes its tag, its key and its content, NUL-separated, so no rearrangement of
 * two adjacent values can produce the same digest as another arrangement.
 */
export function hashInputs(root, entries) {
  const h = createHash('sha256');
  for (const entry of entries) {
    if (typeof entry !== 'string') throw new TypeError(`input entry is not a string: ${entry}`);
    const colon = entry.indexOf(':');
    const tag = colon === -1 ? '' : entry.slice(0, colon);
    const rest = entry.slice(colon + 1);
    if (tag === 'file') {
      const p = join(root, rest);
      h.update(`file\0${rest}\0`);
      h.update(existsSync(p) ? readFileSync(p) : Buffer.from(ABSENT));
      h.update('\0');
    } else if (tag === 'text') {
      h.update(`text\0${rest}\0`);
    } else {
      throw new TypeError(`input entry "${entry}" has no file:/text: tag — `
        + 'an untagged entry cannot be hashed without guessing what it is');
    }
  }
  return `sha256:${h.digest('hex')}`;
}
