export declare const LICENCE_FORMAT = "snowarch-licence/1";
export declare const LIST_FORMAT = "snowarch-revocations/1";
export declare const SCOPES: readonly ["design-only", "live"];
export declare const REASONS: readonly ["ended", "breach", "lost", "other"];
export declare const EXPIRING_DAYS = 30;
export declare const ID_PATTERN: RegExp;
export type LicenceState = 'ok' | 'expiring' | 'expired' | 'revoked' | 'invalid' | 'missing';
export type KeyRole = 'primary' | 'recovery';
export interface ProductKey {
    role: KeyRole;
    fingerprint: string;
    publicKey: string;
}
export interface RevocationEntry {
    id: string;
    revokedAt: string;
    reason: string;
}
export interface VerifiedList {
    ok: true;
    version: number;
    revoked: RevocationEntry[];
    key: KeyRole;
}
export interface RefusedList {
    ok: false;
    reason: string;
}
export interface LicenceStatus {
    state: LicenceState;
    id: string | null;
    licensee: string | null;
    org: string | null;
    scope: string | null;
    issued: string | null;
    validUntil: string | null;
    perpetual: boolean;
    daysLeft: number | null;
    key: KeyRole | null;
    signatureValid: boolean;
    reason: string | null;
    revocation: {
        revokedAt: string;
        reason: string;
    } | null;
}
/** The one byte string a signature covers: keys sorted at every depth, no whitespace. */
export declare function canonicalJson(value: unknown): string;
/** `sha256:` and the hex digest of the key's DER SubjectPublicKeyInfo. */
export declare function fingerprint(publicKeyPem: string): string;
type Verified = {
    ok: true;
    role: KeyRole;
} | {
    ok: false;
    reason: string;
};
/** Which shipped key signed `body`, found by the fingerprint OF ITS PUBLIC KEY, or why none did. */
export declare function verifyBody(body: unknown, signature: unknown, keys: readonly ProductKey[]): Verified;
/** Why this is not a licence, or `null` when every field is what the format says. */
export declare function licenceProblem(value: unknown): string | null;
/** The UTC calendar date of `now`, as YYYY-MM-DD. */
export declare const utcDate: (now: Date) => string;
/** Whole days from `from` to `to`, both YYYY-MM-DD. */
export declare const daysBetween: (from: string, to: string) => number;
/**
 * ARC-09-C159 — WHEN A LICENCE IS EXPIRING: when the days left are at most min(EXPIRING_DAYS, floor(term / 3)), the
 * term being the licence's own length in whole days, valid_until − issued. A year's licence warns from 30 days left, a
 * 30-day licence from 10, a 3-day one from 1, and a perpetual licence never. Under a flat 30 days the Windows
 * colleague's 30-day licence read `expiring` on its first day (2026-10-16).
 */
export declare const expiringThreshold: (issued: string, validUntil: string) => number;
export interface CheckOptions {
    keys: readonly ProductKey[];
    list?: {
        revoked?: RevocationEntry[];
    } | null;
    now: Date;
}
/** The status of a licence file's TEXT — `null` for no file — against the keys, a list and a moment. */
export declare function checkLicence(text: string | null | undefined, { keys, list, now }: CheckOptions): LicenceStatus;
/** A revocation list — text or parsed document — verified, or the reason it is refused. */
export declare function readList(input: unknown, { keys }: {
    keys: readonly ProductKey[];
}): VerifiedList | RefusedList;
/** The list to keep: the held one, unless the other is a verified list with a HIGHER version. */
export declare function newerList(held: VerifiedList | null, fetched: VerifiedList | null): VerifiedList | null;
export {};
