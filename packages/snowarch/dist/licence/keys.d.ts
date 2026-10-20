/**
 * ARC-11-C1 — the public keys this server trusts to sign a licence or a revocation list.
 *
 * The CLI's `tools/snowarch/lib/licence/keys.mjs` is the other copy; this package imports nothing
 * from outside itself, so the list is written twice and `tools/snowarch/tests/licence-parity.test.mjs`
 * holds the two equal. Two keys by fingerprint, PRIMARY and RECOVERY (ruling R3), public halves only:
 * `tools/snowarch/tests/licence-keys-guard.test.mjs` fails on any private-key armour in this file,
 * its build or the CLI's copy.
 *
 * THE OWNER'S KEYS, from the owner's keygen, relayed on 2026-10-11 and committed here and in the CLI's copy as
 * ARC-11-C1's last code commit. A third key, or a replacement for either, is ARC-11-C3's key rotation.
 */
import type { ProductKey } from './core.js';
export declare const PRODUCT_KEYS: readonly ProductKey[];
