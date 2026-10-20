// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-11-C1 — the public keys this product trusts to sign a licence or a revocation list.
 *
 * TWO KEYS, by fingerprint (ruling R3): the PRIMARY signs day to day, and the RECOVERY key, kept
 * offline, signs when the primary is lost — so the creator can always sign again. Each entry is
 * `{ role, fingerprint, publicKey }`; `fingerprint` is `sha256:` and the hex digest of the key's DER
 * SubjectPublicKeyInfo, which is what `./snowarch licence show` prints and the owner reads aloud.
 *
 * THE OWNER'S KEYS. The owner ran `./snowarch licence keygen` on their own machine, outside the
 * checkout, and relayed the two PUBLIC keys and their fingerprints on 2026-10-11; they were committed
 * here and in the server's copy as ARC-11-C1's last code commit. The private halves never left that
 * machine. A third key, or a replacement for either, is a key rotation: ARC-11-C3's, not an edit here.
 *
 * PUBLIC KEYS ONLY. A private key never enters this repository; `tools/snowarch/tests/licence-keys-guard.test.mjs`
 * fails on any private-key armour here and holds the count to the two keys. The server's copy is
 * `packages/snowarch/src/licence/keys.ts`, held equal to this one by `tools/snowarch/tests/licence-parity.test.mjs`.
 */
export const PRODUCT_KEYS = Object.freeze([
  Object.freeze({
    role: 'primary',
    fingerprint: 'sha256:a2bffafd270c3f77b29447810dcea42933696264ddbd15f3bfeb004a81ba2e17',
    publicKey: "-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAUYtVQBY2Mdj6Nh4R3TcznEC6tLE7HBRhkQLH6Iz+d/k=\n-----END PUBLIC KEY-----\n",
  }),
  Object.freeze({
    role: 'recovery',
    fingerprint: 'sha256:d591bb502f63090d98ec9f63c711b473210cf9c859ce9e46af642b812eaf9f3e',
    publicKey: "-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAP88ZSUDmY20J12+f6EfcBoU/jhJgrH4f8307TzJ6KAk=\n-----END PUBLIC KEY-----\n",
  }),
]);
