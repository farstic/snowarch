// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-11-C1 — the licence as this checkout holds it, and the one line that says so.
 *
 * TWO FILES. `.local/licence.json` is the installed licence, copied in by hand. `.local/revocations.json`
 * is the last revocation list a fetch brought back, with when it was checked — written only by
 * something a person started (`licence check --refresh`, `upgrade`, `upgrade --check`) or by a live
 * server start, never by the SessionStart hook, which reads it and nothing else.
 *
 * ENFORCED ON EVERY BUILD (ARC-11-C6, from 2.0.13). No variable, and no absence of one, turns it off:
 * `missing`, `invalid`, `expired` and `revoked` refuse every CLI command except the five a person needs
 * to repair the state, and every MCP tool (ruling R1). `expiring` is never refused. The architect rejected
 * an opt-out on 2026-10-12: beside C7's "a modified build still starts and works", a switch would be a
 * documented recipe for running without a licence.
 *
 * THE LINE (`bannerLine`) is the one wording the banner, the doctor, the status panel and the server's
 * notice print. It lives in `line.mjs`, a leaf the pure status panel can import, and is re-exported
 * here for every caller that already reads the state.
 */
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { checkLicence, readList } from './core.mjs';
import { PRODUCT_KEYS } from './keys.mjs';
import { licencePath, revocationsPath } from '../local-paths.mjs';

export { bannerLine, daysLeftPhrase, renewalSentence } from './line.mjs';

/**
 * ARC-11-C6 step 4b — the states enforcement refuses, the commands that run without a licence and the decision are
 * the PACKAGE'S, imported from its build: one gate for both doors, this CLI and `dist/cli/index.js` (ruling R3).
 * `packages/snowarch/src/licence/gate.ts` is the source, and `licence-gate-shared.test.mjs` holds that these are
 * its own objects and that nothing else defines them. The build imports nothing, so the engine still loads before
 * any install has run.
 */
import { allowedCommand, CLI_ALLOWED, CLI_ALLOWED_FORMS, REFUSED, refusesCommand }
  from '../../../../packages/snowarch/dist/licence/gate.js';

export { allowedCommand, CLI_ALLOWED, CLI_ALLOWED_FORMS, REFUSED, refusesCommand };

/**
 * A list checked longer ago than this is STALE: `licence show` and `licence check` say so. A live server
 * start refreshes the list every time; a design-only checkout, where no server starts, fetches it only
 * when somebody asks.
 */
export const LIST_REFRESH_MS = 24 * 60 * 60 * 1000;

/**
 * What to do about a refusal — the same sentence as the server's `LICENCE_NOT_VALID` remedy, with the
 * launcher filled in (the parity test compares them).
 */
export const REMEDY = (cli) => `Run ${cli} licence check to see why, then install a valid licence as `
  + '.local/licence.json. A running Claude Code session keeps what it read at start, so restart it afterwards';

/** The installed licence's text, or `null` when there is none. */
export function readLicenceText(root) {
  const path = licencePath(root);
  try { return existsSync(path) ? readFileSync(path, 'utf8') : null; } catch { return null; }
}

/** The cache, or `null`. A malformed file is an absent one — the hook reads this, and must never crash. */
export function readListCache(root) {
  try {
    const raw = JSON.parse(readFileSync(revocationsPath(root), 'utf8'));
    return raw && typeof raw === 'object' && typeof raw.checkedAt === 'string' ? raw : null;
  } catch { return null; }
}

/**
 * Write the cache whole, atomically, 0600 — the same discipline as every other `.local/` file. A
 * half-written cache read by the banner at the wrong moment would be a list that is not there.
 */
export function writeListCache(root, { list = null, checkedAt, source }) {
  const path = revocationsPath(root);
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const tmp = `${path}.tmp-${process.pid}`;
  writeFileSync(tmp, `${JSON.stringify({ checkedAt, source, list }, null, 2)}\n`, { mode: 0o600 });
  renameSync(tmp, path);
  if (process.platform !== 'win32') chmodSync(path, 0o600);
}

/** The cached list, verified with the shipped keys — or `null`, which is what an unverifiable one is. */
export function heldList(cache, keys = PRODUCT_KEYS) {
  if (!cache?.list) return null;
  const list = readList(cache.list, { keys });
  return list.ok ? list : null;
}

/** Is the cached list stale? No cache, an unreadable date or a date from the future all are. */
export function listStale(cache, now = new Date(), afterMs = LIST_REFRESH_MS) {
  const at = Date.parse(cache?.checkedAt ?? '');
  if (Number.isNaN(at)) return true;
  const age = now.getTime() - at;
  return age < 0 || age >= afterMs;
}

/**
 * This checkout's licence: the core's status, which list it was judged against, and `enforced`, which is
 * true on every build. Reads two files; fetches nothing, and reads no variable.
 */
export function licenceStatus(root, { keys = PRODUCT_KEYS, now = new Date() } = {}) {
  const cache = readListCache(root);
  const list = heldList(cache, keys);
  const status = checkLicence(readLicenceText(root), { keys, list, now });
  return { ...status, enforced: true, list: list ? { version: list.version, checkedAt: cache.checkedAt } : null };
}

/**
 * ARC-11-C6 (ruling R1) — would the package CLI refuse `instance` and `store` in this run? B06 and B08 start it, so
 * they ask first, through the gate both doors use, and skip instead of meeting the refusal. The licence is the one
 * the run read (`stepContext`), or this root's for a caller that has none; with neither, nothing is refused here and
 * the package CLI's own door still holds.
 */
export function packageCliRefused({ licence, root } = {}) {
  const s = licence ?? (root ? licenceStatus(root) : null);
  return s !== null && refusesCommand('instance', s);
}

/**
 * ARC-11-C6 step 6 — the commands that run without a licence, as a reader reads them: "licence, doctor, …, bootstrap
 * and mode design". Built from the gate's lists, so a sentence that names the set cannot hold a copy of it.
 */
export function allowedPhrase({ allowed = CLI_ALLOWED, forms = CLI_ALLOWED_FORMS } = {}) {
  const all = [...allowed, ...Object.entries(forms).flatMap(([command, args]) => args.map((a) => `${command} ${a}`))];
  return all.length > 1 ? `${all.slice(0, -1).join(', ')} and ${all.at(-1)}` : all.join('');
}

/** What a refused command prints: the state, why it was refused, and the remedy. */
export const refusalLines = (name, s, cli) => [
  `snowarch ${name}: licence ${s.state}${s.signatureValid ? ` (${s.id})` : ''} — this command does not run `
    + 'without a valid licence',
  REMEDY(cli),
];
