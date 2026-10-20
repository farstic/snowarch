// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-07-S02 — what counts as an instance address, and what the wizard will not guess.
 *
 * P-23 is the whole reason this file has rules rather than a regex. The wizard it replaces
 * "helpfully" turned `https://acme.service-now.com/api` into a base URL of `https://acme
 * .service-now.com/api` and saved it — after which every REST path was `/api/api/now/table/…`
 * and nothing worked, with no error that mentioned the URL. So: a path is REFUSED with the
 * reason, never repaired silently; a bare word is PROPOSED and shown before it is accepted
 * (principle 10); and a URL with credentials in it is refused outright, because a password in a
 * URL is a password in the store, in a log and in a shell history.
 *
 * The environment is the other half. `dev12345.service-now.com` is a PDI and the wizard says so;
 * anything else is ASKED, never guessed, because the environment decides which preset a write is
 * checked against — and `dev12345.service-now.com.evil.example` ends in a domain somebody else
 * owns.
 */
import { ERROR_CODES } from '../errors/codes.js';
import { fillRemedy } from '../servicenow/net-errors.js';
/** A bare subdomain: the thing a user types when asked for "the instance". */
const BARE = /^[a-z0-9-]+$/;
/** A PDI, and only a PDI. Anchored at both ends — see the `.evil.example` case in the tests. */
export const PDI_HOST = /^https:\/\/dev\d+\.service-now\.com$/;
export const ENVIRONMENTS = ['pdi', 'dev', 'test', 'prod'];
const bad = (code, message) => ({ ok: false, code, message });
/**
 * Normalise, or refuse with the reason.
 *
 * The order matters: `http://` is checked before parsing, because `new URL` accepts it happily
 * and the resulting message would be about a path rather than about the scheme.
 */
export function normalizeInstanceUrl(input) {
    const trimmed = String(input ?? '').trim();
    if (trimmed === '') {
        // The same sentence the non-interactive branch prints. An empty answer and a missing `--url`
        // are ONE condition — the wizard has no URL — and this file used to carry a third text for it,
        // beside the wizard's and the registry's.
        return bad('URL_REQUIRED', `URL_REQUIRED — ${fillRemedy('URL_REQUIRED')}.`);
    }
    // A bare word is a PROPOSAL, not a decision: the caller shows it and Enter accepts.
    if (BARE.test(trimmed.toLowerCase())) {
        return { ok: true, url: `https://${trimmed.toLowerCase()}.service-now.com`, proposed: true, notes: [] };
    }
    if (/^http:\/\//i.test(trimmed)) {
        return bad('URL_NOT_HTTPS', 'ServiceNow instances are served over https only; use https://<host>');
    }
    let parsed;
    try {
        parsed = new URL(trimmed);
    }
    catch {
        return bad('URL_INVALID', `"${trimmed}" is not a URL — enter https://<host>`);
    }
    if (parsed.protocol !== 'https:') {
        return bad('URL_NOT_HTTPS', 'ServiceNow instances are served over https only; use https://<host>');
    }
    if (parsed.username !== '' || parsed.password !== '') {
        // The VALUE is never echoed back — that is the point of refusing it.
        return bad('URL_HAS_CREDENTIALS', 'Never put a username or password in the URL; the wizard will ask for them separately.');
    }
    if (parsed.pathname === '/api' || parsed.pathname.startsWith('/api/')) {
        // Its own message, because this is the mistake that produced P-23 and the generic one would
        // not tell the reader why the thing they were told to paste is wrong.
        return bad('URL_HAS_PATH', '"/api" is the REST base the server adds itself — enter the bare origin (https://<host>)');
    }
    if ((parsed.pathname !== '/' && parsed.pathname !== '') || parsed.search !== '' || parsed.hash !== '') {
        return bad('URL_HAS_PATH', 'Enter the instance origin only (https://<host>), without a path');
    }
    const notes = [];
    if (trimmed.endsWith('/') && parsed.pathname === '/')
        notes.push('trailing slash removed');
    // `origin` keeps an explicit port — on-prem and vanity hosts run on one — and drops everything
    // this function has just refused to accept.
    return { ok: true, url: parsed.origin, proposed: false, notes };
}
/** `pdi` for a PDI host, `null` for everything else. Never a guess. */
export function proposeEnvironment(url) {
    return PDI_HOST.test(url) ? 'pdi' : null;
}
/** The registry's own words, so the wizard and `docs/TROUBLESHOOTING.md` say the same thing. */
export const codeMeaning = (code) => ERROR_CODES.find((e) => e.code === code)?.meaning ?? code;
/**
 * The environment: proposed, given, or asked — and refused when it can be none of those.
 *
 * `--yes` means "no questions", so a non-PDI host without `--env` cannot be resolved and must
 * FAIL rather than default. Defaulting would pick an environment, and the environment is what
 * decides whether a write needs `--ack-prod`.
 *
 * The interactive path asks with NO default: Enter repeats the question. `pdi` is right often
 * enough to be a tempting default and wrong in exactly the case that matters.
 */
export async function resolveEnvironment({ url, env, yes, ask }) {
    if (env !== undefined) {
        const value = String(env).trim().toLowerCase();
        if (!ENVIRONMENTS.includes(value)) {
            return { ok: false, code: 'VALIDATION_ERROR',
                message: `--env must be one of ${ENVIRONMENTS.join(', ')}, not "${env}"` };
        }
        return { ok: true, environment: value };
    }
    const proposed = proposeEnvironment(url);
    if (proposed)
        return { ok: true, environment: proposed };
    if (yes || !ask) {
        const host = hostOf(url);
        return {
            ok: false,
            code: 'ENV_REQUIRED',
            message: `--env is required for ${host} (only devNNNNN.service-now.com hosts are recognised `
                + 'as PDI).',
        };
    }
    const answer = await ask();
    return { ok: true, environment: answer };
}
/** The host, for a message. Falls back to the input when it cannot be parsed — never throws. */
export function hostOf(url) {
    try {
        return new URL(url).host;
    }
    catch {
        return url;
    }
}
