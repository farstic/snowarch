// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-06-S04 — one remedy per failing check per platform, held as DATA.
//
// `remedies.json` rather than a JavaScript table because the Node-free launchers (ARC-06-S10/S11)
// have to print the same sentences with no Node to read them: bash and PowerShell can each parse a
// small JSON file, and their parity test reads this one. ARC-08's doctor reuses the same table, so
// a remedy improved here improves everywhere it is quoted.
//
// A remedy is never a paragraph. It is the one command or the one sentence that ends the problem —
// anything longer is a document, and a document in an error message is a document nobody reads.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const TABLE = JSON.parse(readFileSync(join(here, 'remedies.json'), 'utf8'));

/** Check ids, derived from the file — never a second list that could disagree with it. */
export const CHECK_IDS = Object.freeze(Object.keys(TABLE).filter((k) => !k.startsWith('$')));

/**
 * The sentence for `checkId` on `platform`, with `{placeholders}` filled from `values`.
 *
 * An unfilled placeholder is an error rather than a brace printed at a user: `free up {needed} on
 * {mount}` is not a remedy, it is a bug with punctuation. The test asserts no cell ships a
 * placeholder that nothing supplies.
 */
export function remedyFor(checkId, { platform = process.platform, values = {} } = {}) {
  const row = TABLE[checkId];
  if (!row) throw new Error(`no remedy for check "${checkId}" — add one to remedies.json`);
  const sentence = row[platform] ?? row.default;
  const filled = sentence.replace(/\{(\w+)\}/g, (m, key) => (key in values ? String(values[key]) : m));
  const left = /\{(\w+)\}/.exec(filled);
  if (left) throw new Error(`remedy for "${checkId}" still has {${left[1]}} — nothing supplied it`);
  return filled;
}
