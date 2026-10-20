// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-11-C1 — the licence, read and judged: the server's copy. Pure: no file, no clock, no environment.
 *
 * This package imports nothing from outside itself, so the CLI's `tools/snowarch/lib/licence/core.mjs`
 * cannot be shared and is copied here instead. `tools/snowarch/tests/licence-parity.test.mjs` runs
 * both copies over every case and holds them to the same verdict; a change to one that is not made
 * to the other fails there. The CLI's header explains the format; in short:
 *
 * - a licence file is `{ format, licence, signature }`, the signature a DETACHED Ed25519 signature
 *   over the canonical JSON of `licence` (keys sorted at every depth, no whitespace);
 * - a key the product does not ship signs nothing, whatever fingerprint the file claims, so a
 *   perpetual licence (no `valid_until`) from any other key is invalid like every other;
 * - the states are ok, expiring (see `expiringThreshold`), expired, revoked, invalid and missing, and an
 *   id is reported only when the signature holds;
 * - a revocation list names a licence by id, date and a reason from a short list, and a list no
 *   newer than the one held is ignored.
 *
 * The server never signs anything: issuing and revoking are the CLI's.
 */
import { createHash, createPublicKey, verify } from 'node:crypto';
export const LICENCE_FORMAT = 'snowarch-licence/1';
export const LIST_FORMAT = 'snowarch-revocations/1';
export const SCOPES = Object.freeze(['design-only', 'live']);
export const REASONS = Object.freeze(['ended', 'breach', 'lost', 'other']);
export const EXPIRING_DAYS = 30;
export const ID_PATTERN = /^LIC-\d{4}-\d{4}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;
const ENTRY_FIELDS = ['id', 'revokedAt', 'reason'];
/** The one byte string a signature covers: keys sorted at every depth, no whitespace. */
export function canonicalJson(value) {
    if (value === null || typeof value === 'boolean' || typeof value === 'string')
        return JSON.stringify(value);
    if (typeof value === 'number') {
        if (!Number.isFinite(value))
            throw new TypeError('canonical JSON holds finite numbers only');
        return JSON.stringify(value);
    }
    if (Array.isArray(value))
        return `[${value.map((v) => canonicalJson(v === undefined ? null : v)).join(',')}]`;
    if (typeof value === 'object') {
        const obj = value;
        const keys = Object.keys(obj).filter((k) => obj[k] !== undefined).sort();
        return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(',')}}`;
    }
    throw new TypeError(`canonical JSON cannot hold a ${typeof value}`);
}
/** `sha256:` and the hex digest of the key's DER SubjectPublicKeyInfo. */
export function fingerprint(publicKeyPem) {
    const der = createPublicKey(publicKeyPem).export({ type: 'spki', format: 'der' });
    return `sha256:${createHash('sha256').update(der).digest('hex')}`;
}
/** Which shipped key signed `body`, found by the fingerprint OF ITS PUBLIC KEY, or why none did. */
export function verifyBody(body, signature, keys) {
    const sig = signature;
    if (!sig || typeof sig !== 'object' || sig.alg !== 'Ed25519'
        || typeof sig.key !== 'string' || typeof sig.value !== 'string') {
        return { ok: false, reason: 'the signature is missing or not an Ed25519 signature' };
    }
    const key = keys.find((k) => fingerprint(k.publicKey) === sig.key);
    if (!key)
        return { ok: false, reason: 'not signed by a key this product ships' };
    let good = false;
    try {
        good = verify(null, Buffer.from(canonicalJson(body), 'utf8'), createPublicKey(key.publicKey), Buffer.from(sig.value, 'base64'));
    }
    catch {
        good = false;
    }
    return good ? { ok: true, role: key.role } : { ok: false, reason: 'the signature does not match the content' };
}
const isDate = (s) => typeof s === 'string' && DATE.test(s)
    && !Number.isNaN(Date.parse(`${s}T00:00:00Z`))
    && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
const nonEmpty = (s) => typeof s === 'string' && s.trim() !== '';
/** Why this is not a licence, or `null` when every field is what the format says. */
export function licenceProblem(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return 'there is no licence in the file';
    const l = value;
    if (typeof l.id !== 'string' || !ID_PATTERN.test(l.id))
        return 'the id is not LIC-YYYY-NNNN';
    for (const f of ['licensee', 'org', 'issuer'])
        if (!nonEmpty(l[f]))
            return `${f} is empty`;
    if (!SCOPES.includes(l.scope))
        return `the scope is not one of ${SCOPES.join(', ')}`;
    if (!isDate(l.issued))
        return 'issued is not a date (YYYY-MM-DD)';
    if (l.valid_until !== undefined && !isDate(l.valid_until))
        return 'valid_until is not a date (YYYY-MM-DD)';
    if (l.valid_until !== undefined && l.valid_until < l.issued)
        return 'valid_until is before issued';
    if (l.notes !== undefined && typeof l.notes !== 'string')
        return 'notes is not text';
    return null;
}
/** The UTC calendar date of `now`, as YYYY-MM-DD. */
export const utcDate = (now) => now.toISOString().slice(0, 10);
/** Whole days from `from` to `to`, both YYYY-MM-DD. */
export const daysBetween = (from, to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
/**
 * ARC-09-C159 — WHEN A LICENCE IS EXPIRING: when the days left are at most min(EXPIRING_DAYS, floor(term / 3)), the
 * term being the licence's own length in whole days, valid_until − issued. A year's licence warns from 30 days left, a
 * 30-day licence from 10, a 3-day one from 1, and a perpetual licence never. Under a flat 30 days the Windows
 * colleague's 30-day licence read `expiring` on its first day (2026-10-16).
 */
export const expiringThreshold = (issued, validUntil) => Math.min(EXPIRING_DAYS, Math.floor(daysBetween(issued, validUntil) / 3));
const verdict = (state, over = {}) => ({
    state, id: null, licensee: null, org: null, scope: null, issued: null, validUntil: null,
    perpetual: false, daysLeft: null, key: null, signatureValid: false, reason: null, revocation: null, ...over,
});
/** The status of a licence file's TEXT — `null` for no file — against the keys, a list and a moment. */
export function checkLicence(text, { keys, list = null, now }) {
    if (text === null || text === undefined)
        return verdict('missing', { reason: 'no licence is installed' });
    let doc;
    try {
        doc = JSON.parse(text);
    }
    catch {
        return verdict('invalid', { reason: 'the file is not JSON' });
    }
    if (!doc || typeof doc !== 'object' || doc.format !== LICENCE_FORMAT) {
        return verdict('invalid', { reason: `the file is not a ${LICENCE_FORMAT} licence` });
    }
    const problem = licenceProblem(doc.licence);
    if (problem)
        return verdict('invalid', { reason: problem });
    const signed = verifyBody(doc.licence, doc.signature, keys);
    if (!signed.ok)
        return verdict('invalid', { reason: signed.reason });
    const l = doc.licence;
    const perpetual = l.valid_until === undefined;
    const daysLeft = perpetual ? null : daysBetween(utcDate(now), l.valid_until);
    const known = {
        id: l.id, licensee: l.licensee, org: l.org, scope: l.scope,
        issued: l.issued, validUntil: perpetual ? null : l.valid_until, perpetual, daysLeft,
        key: signed.role, signatureValid: true,
    };
    const entry = list?.revoked?.find((e) => e.id === l.id);
    if (entry) {
        return verdict('revoked', { ...known, reason: `revoked on ${entry.revokedAt} (${entry.reason})`,
            revocation: { revokedAt: entry.revokedAt, reason: entry.reason } });
    }
    if (daysLeft !== null && daysLeft < 0)
        return verdict('expired', { ...known, reason: `expired on ${l.valid_until}` });
    if (daysLeft !== null && daysLeft <= expiringThreshold(l.issued, l.valid_until))
        return verdict('expiring', known);
    return verdict('ok', known);
}
function listProblem(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return 'there is no list in the file';
    const list = value;
    if (!Number.isInteger(list.version) || list.version < 1)
        return 'the version is not a whole number from 1';
    if (!Array.isArray(list.revoked))
        return 'revoked is not a list';
    const seen = new Set();
    for (const raw of list.revoked) {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw))
            return 'an entry is not an object';
        const e = raw;
        const extra = Object.keys(e).filter((k) => !ENTRY_FIELDS.includes(k));
        if (extra.length > 0)
            return `an entry carries ${extra.join(', ')} — only id, revokedAt and reason belong in the list`;
        if (typeof e.id !== 'string' || !ID_PATTERN.test(e.id))
            return 'an entry\'s id is not LIC-YYYY-NNNN';
        if (!isDate(e.revokedAt))
            return `${e.id}: revokedAt is not a date (YYYY-MM-DD)`;
        if (!REASONS.includes(e.reason))
            return `${e.id}: the reason is not one of ${REASONS.join(', ')}`;
        if (seen.has(e.id))
            return `${e.id} is listed twice`;
        seen.add(e.id);
    }
    return null;
}
/** A revocation list — text or parsed document — verified, or the reason it is refused. */
export function readList(input, { keys }) {
    let doc = input;
    if (typeof input === 'string') {
        try {
            doc = JSON.parse(input);
        }
        catch {
            return { ok: false, reason: 'the list is not JSON' };
        }
    }
    if (!doc || typeof doc !== 'object' || doc.format !== LIST_FORMAT) {
        return { ok: false, reason: `the file is not a ${LIST_FORMAT} list` };
    }
    const problem = listProblem(doc.list);
    if (problem)
        return { ok: false, reason: problem };
    const signed = verifyBody(doc.list, doc.signature, keys);
    if (!signed.ok)
        return { ok: false, reason: signed.reason };
    const list = doc.list;
    return { ok: true, version: list.version, revoked: list.revoked, key: signed.role };
}
/** The list to keep: the held one, unless the other is a verified list with a HIGHER version. */
export function newerList(held, fetched) {
    if (!fetched)
        return held ?? null;
    if (!held)
        return fetched;
    return fetched.version > held.version ? fetched : held;
}
