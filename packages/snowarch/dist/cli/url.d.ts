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
import { type ErrorCodeName } from '../errors/codes.js';
export interface UrlOk {
    ok: true;
    /** The origin, and nothing else: no path, no search, no hash, no trailing slash. */
    url: string;
    /** True when the wizard INVENTED this from a bare word and must show it before accepting. */
    proposed: boolean;
    /** What was changed on the way, for the caller to print. Empty when nothing was. */
    notes: string[];
}
export interface UrlBad {
    ok: false;
    code: ErrorCodeName;
    message: string;
}
export type UrlResult = UrlOk | UrlBad;
/** A PDI, and only a PDI. Anchored at both ends — see the `.evil.example` case in the tests. */
export declare const PDI_HOST: RegExp;
export declare const ENVIRONMENTS: readonly ["pdi", "dev", "test", "prod"];
export type Environment = (typeof ENVIRONMENTS)[number];
/**
 * Normalise, or refuse with the reason.
 *
 * The order matters: `http://` is checked before parsing, because `new URL` accepts it happily
 * and the resulting message would be about a path rather than about the scheme.
 */
export declare function normalizeInstanceUrl(input: string): UrlResult;
/** `pdi` for a PDI host, `null` for everything else. Never a guess. */
export declare function proposeEnvironment(url: string): Environment | null;
export interface EnvironmentResolution {
    ok: boolean;
    environment?: Environment;
    code?: ErrorCodeName;
    message?: string;
}
/** The registry's own words, so the wizard and `docs/TROUBLESHOOTING.md` say the same thing. */
export declare const codeMeaning: (code: ErrorCodeName) => string;
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
export declare function resolveEnvironment({ url, env, yes, ask }: {
    url: string;
    env?: string;
    yes?: boolean;
    ask?: () => Promise<string>;
}): Promise<EnvironmentResolution>;
/** The host, for a message. Falls back to the input when it cannot be parsed — never throws. */
export declare function hostOf(url: string): string;
