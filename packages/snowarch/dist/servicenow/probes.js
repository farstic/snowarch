// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-07-S03 — one library that proves an instance's credentials, and never locks an account out.
 *
 * Three callers need the same answer: the wizard while it is being set up, `instance test`
 * afterwards, and the ARC-08 doctor later. If each asked in its own way they would disagree about
 * the same instance on the same day, and the user would believe the last one they ran.
 *
 * The rule that shapes every function here: ONE HTTP REQUEST PER PROBE, EVER. The client is
 * constructed with `maxRetries: 0` even though it already excludes authentication failures from
 * its retry policy, because "excluded today" is a property of code somebody may reasonably change
 * and "no retries configured" is a property of this call. A retried 401 is an account three
 * attempts closer to a lockout, on an instance whose lockout policy we do not know.
 *
 * Nothing here writes. Every probe is a `GET` with `sysparm_limit=1`, and the one that is not a
 * GET — the ROPC token request — asks for a token and discards it.
 */
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { delimiter, join } from 'node:path';
import { FLAG_NAMES } from '../utils/permissions.js';
import { classifyNetworkError } from './net-errors.js';
/**
 * The sentence every review screen prints ONCE, above the probe lines.
 *
 * A probe proves the account can READ the table family a flag unlocks. It does not prove a write
 * will be allowed: ServiceNow evaluates write ACLs per call, per record, and a probe that implied
 * otherwise would be the wizard promising something the instance has not agreed to.
 */
export const HONESTY_NOTE = 'Probes confirm the account can reach each table family; write ACLs are still evaluated per call.';
/**
 * ARC-07-C6 — THE ORDER AND THE NAMES OF A PROBE RECORD, once, for every renderer.
 *
 * There were two. `probeSummary` (the wizard's Saved line) printed seven fields in the flag order,
 * spelled as the flags are — `auth · write · cmdb_write · scripting · atf · now_assist · fluent`.
 * `probeCell` (the `instance list` table) printed FIVE in a different order with different names —
 * `auth · write · scripting · cmdb · atf` — and silently dropped `nowAssist` and `fluent`. So an
 * instance whose Now Assist probe came back `not licensed` listed as a row of `ok`s, and the two
 * surfaces disagreed about both the vocabulary and the number of facts a probe has.
 *
 * DERIVED FROM `FLAG_NAMES`, not spelled again: a seventh capability added to the flags appears in
 * both renderers or in neither, and cannot appear under two names. `auth` leads because it is not a
 * capability — it is the question the other six presuppose, and a reader scanning a row wants the
 * answer to "did it log in" before the answer to "may it write".
 */
export const PROBE_FIELD_OF = Object.freeze({
    WRITE_ENABLED: 'write',
    CMDB_WRITE_ENABLED: 'cmdb',
    SCRIPTING_ENABLED: 'scripting',
    ATF_ENABLED: 'atf',
    NOW_ASSIST_ENABLED: 'nowAssist',
    FLUENT_ENABLED: 'fluent',
});
/**
 * WHAT A PROBE RESULT IS CALLED, in one place — ARC-07-W16.
 *
 * THREE SURFACES RENDER THE SAME MEASUREMENT: the permissions screen's annotation, the wizard's Saved
 * line, and `instance list`'s probe column. The screen said `@servicenow/sdk not on PATH`, the other
 * two said `not installed`, and a user who saw two of them saw two findings where there was one.
 *
 * ARC-07-C6 already noticed half of this — it made the ORDER and the NAMES come from `PROBE_FIELDS`
 * for exactly this reason — and left the VALUES formatted separately in each place. Putting the words
 * here finishes that row's argument: `probeFieldText` is now the one renderer, and C6's assertion that
 * the Saved line equals the list cell holds by construction rather than by two functions agreeing.
 *
 * `ok`, `skipped` and an unknown status pass through as themselves; there is nothing to translate.
 */
export const statusWords = (status) => {
    switch (status) {
        case 'role missing': return 'role missing';
        case 'not licensed': return 'no licence detected';
        case 'not installed': return 'ServiceNow SDK not installed';
        case undefined: return 'not run';
        default: return String(status);
    }
};
/**
 * One probe field, as every surface prints it — `auth: ok`, `fluent: ServiceNow SDK not installed`.
 *
 * The colon arrived with the words: the values are phrases now, and `atf no licence detected` without
 * one reads as a sentence fragment rather than a field and its value.
 */
export const probeFieldText = (label, status) => `${label}: ${statusWords(status)}`;
export const PROBE_FIELDS = Object.freeze([
    { label: 'auth', key: 'auth', flag: null },
    ...FLAG_NAMES.map((flag) => ({
        label: flag.replace(/_ENABLED$/, '').toLowerCase(),
        key: PROBE_FIELD_OF[flag],
        flag,
    })),
]);
/** The 403 hint, spelled once: the account is real, the role is not. */
export const ROLE_MISSING_HINT = 'The credentials are valid but the account cannot read sys_user over REST. On a PDI use the '
    + 'admin account; elsewhere ask for a role that grants sys_user read (itil or admin).';
export const ROLES_UNREADABLE_HINT = 'could not read roles';
/**
 * ServiceNow's OAuth error bodies, as DATA.
 *
 * RFC 6749 §5.2 names these; what a given instance actually returns is CAPTURED, not assumed —
 * ARC-07-S11 records the real texts from a PDI with the hardening property toggled and fills
 * `tests/fixtures/oauth-ropc-errors.json`. Until then this table is the RFC's names, and anything
 * unrecognised falls through to `auth failed` with the raw value in `detail` rather than being
 * guessed at.
 */
export const ROPC_ERROR_TABLE = Object.freeze([
    {
        error: 'unsupported_grant_type',
        status: 'auth failed',
        code: 'OAUTH_ROPC_DISABLED',
        hint: 'This instance has disabled the OAuth password grant (system property '
            + 'glide.oauth.inbound.ropc.grant_type.disabled = true — Security Center hardening). Use '
            + 'basic authentication, or ask the instance admin; the client-credentials grant is on the '
            + 'roadmap.',
    },
    {
        error: 'invalid_client',
        status: 'auth failed',
        code: 'OAUTH_CLIENT_INVALID',
        hint: 'Client ID or client secret rejected; the user password was not checked.',
    },
    { error: 'invalid_grant', status: 'auth failed' },
    { error: 'access_denied', status: 'auth failed' },
]);
/**
 * Prove the credentials. One request; on 401, never a second.
 *
 * The 403 path is its own status rather than a failure: on a hardened instance the login is
 * correct and the REST ACL is not, and telling that user their password is wrong sends them to
 * change a password that works.
 */
export async function probeAuth(client, { username, authMethod = 'basic', tokenProbe, env = process.env, } = {}) {
    if (authMethod === 'oauth_ropc') {
        if (!tokenProbe)
            return { status: 'error', detail: 'no token probe supplied' };
        let token;
        try {
            token = await tokenProbe();
        }
        catch (err) {
            return unreachable(err, env);
        }
        if (!token.ok) {
            const row = ROPC_ERROR_TABLE.find((r) => r.error === token.error);
            return row
                ? { status: row.status, ...(row.code ? { code: row.code } : {}), ...(row.hint ? { hint: row.hint } : {}),
                    ...(token.httpStatus ? { httpStatus: token.httpStatus } : {}) }
                // Unrecognised: the raw value, said plainly, rather than a guess dressed as a diagnosis.
                : { status: 'auth failed', code: 'AUTHENTICATION_FAILED',
                    detail: token.error ?? 'the token request failed with no error field' };
        }
    }
    try {
        await client.queryRecords({ table: 'sys_user', fields: 'sys_id', limit: 1 });
    }
    catch (err) {
        return fromClientError(err, env);
    }
    // Best effort, and after the login is already proven: a 403 here means the roles cannot be
    // read, not that the account is unusable — the review screen simply annotates less.
    if (!username)
        return { status: 'ok' };
    try {
        const result = await client.queryRecords({
            table: 'sys_user_has_role',
            query: `user.user_name=${username}`,
            fields: 'role.name',
            limit: 200,
        });
        const roles = result.records
            .map((r) => r['role.name'])
            .filter((r) => typeof r === 'string' && r !== '');
        return { status: 'ok', roles };
    }
    catch {
        return { status: 'ok', hint: ROLES_UNREADABLE_HINT };
    }
}
/** The table each flag's probe reads, and what "ok" means for it. Keyed by `FLAG_NAMES`. */
export const CAPABILITY_TABLE = Object.freeze({
    WRITE_ENABLED: { table: 'sys_update_set' },
    SCRIPTING_ENABLED: { table: 'sys_script_include' },
    CMDB_WRITE_ENABLED: { table: 'cmdb_ci' },
    ATF_ENABLED: { table: 'sys_atf_test' },
    NOW_ASSIST_ENABLED: {
        table: 'sys_properties',
        query: 'nameSTARTSWITHsn_generative_ai',
        needsRows: true,
        emptyStatus: 'not licensed',
        // "properties found", never "Now Assist works": a plugin can be installed without a licence,
        // and the tools themselves report the licence error. Recorded as a limitation in S10.
        emptyDetail: 'no Now Assist properties found — plugin absent or not licensed',
    },
    FLUENT_ENABLED: { local: 'fluent' },
});
/**
 * The SDK's version, from the `package.json` the resolver already found.
 *
 * ARC-08-S04 AC 5 says SV-03 "prints its version", and the check printed the LOCATION instead —
 * found in the acceptance pass (plan item B08-01..03, B08-03). The version is the more useful half
 * of the two in a pasted report ("which SDK do you have" is answerable; "where is it" rarely is),
 * so the check prints both now.
 *
 * Never throws. This whole probe is a hint: an unreadable or versionless `package.json` means the
 * SDK is still installed, and a doctor check that crashed on a malformed dependency would be worse
 * than one that says less.
 */
function sdkVersion(packageJson, read = readFileSync) {
    try {
        const v = JSON.parse(read(packageJson, 'utf8')).version;
        return typeof v === 'string' && v.length > 0 ? v : undefined;
    }
    catch {
        return undefined;
    }
}
/**
 * Is `@servicenow/sdk` on this machine — in the checkout, or installed globally?
 *
 * The global lookup spawns `npm root -g`, and on Windows `npm` is a `.cmd`: since Node 20.12
 * `child_process` refuses to spawn one without a shell, so the executable is LOCATED on PATH
 * first and a `.cmd` is run through `cmd /c`. Bare `spawn('npm')` looked like it worked
 * everywhere right up until it did not, on the one platform nobody develops on.
 *
 * The spawn is injected, so CI never runs the real `npm root -g` — which would be a network-shaped
 * dependency in a unit test and slow on every cell.
 */
export function checkFluent({ from = import.meta.url, runNpm = defaultNpmRoot, exists = existsSync, } = {}) {
    try {
        const resolved = createRequire(from).resolve('@servicenow/sdk/package.json');
        return { installed: true, where: resolved, version: sdkVersion(resolved) };
    }
    catch { /* not in the checkout; try the global root */ }
    const root = runNpm();
    if (!root)
        return { installed: false };
    const candidate = join(root, '@servicenow', 'sdk', 'package.json');
    return exists(candidate)
        ? { installed: true, where: candidate, version: sdkVersion(candidate) }
        : { installed: false };
}
/** `npm root -g`, with a 5 s deadline, or null. Never throws: this is a hint, not a dependency. */
function defaultNpmRoot() {
    const npm = locate('npm');
    if (!npm)
        return null;
    let result;
    try {
        result = npm.toLowerCase().endsWith('.cmd')
            ? spawnSync('cmd', ['/c', npm, 'root', '-g'], { encoding: 'utf8', timeout: 5_000 })
            : spawnSync(npm, ['root', '-g'], { encoding: 'utf8', timeout: 5_000 });
    }
    catch {
        return null;
    }
    const out = String(result.stdout ?? '').trim();
    return result.status === 0 && out !== '' ? out : null;
}
/** The absolute path of an executable on PATH, or null. Windows decides by PATHEXT. */
function locate(name, env = process.env) {
    const path = env.PATH ?? env.Path ?? '';
    const exts = process.platform === 'win32'
        ? (env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean)
        : [''];
    for (const dir of path.split(delimiter).filter(Boolean)) {
        for (const ext of exts) {
            const candidate = join(dir, `${name}${ext}`);
            if (existsSync(candidate))
                return candidate;
        }
    }
    return null;
}
/** One capability. Read-only, one request, and `skipped` is never inferred here. */
export async function probeCapability(client, flag, { env = process.env, fluent = checkFluent, } = {}) {
    const row = CAPABILITY_TABLE[flag];
    if (!row)
        return { flag, status: 'error', detail: `no probe defined for ${flag}` };
    if (row.local === 'fluent') {
        const found = fluent();
        return found.installed
            ? { flag, status: 'ok', detail: '@servicenow/sdk found' }
            : { flag, status: 'not installed', detail: '@servicenow/sdk not found — npm i -g @servicenow/sdk' };
    }
    try {
        const result = await client.queryRecords({
            table: row.table,
            ...(row.query ? { query: row.query } : {}),
            fields: 'sys_id',
            limit: 1,
        });
        if (row.needsRows && result.records.length === 0) {
            return { flag, status: row.emptyStatus ?? 'error', detail: row.emptyDetail ?? 'no rows' };
        }
        return { flag, status: 'ok', detail: `${row.table} readable` };
    }
    catch (err) {
        const mapped = fromClientError(err, env);
        return { flag, status: mapped.status,
            detail: mapped.hint ?? mapped.detail ?? mapped.code ?? 'the request failed' };
    }
}
/**
 * Auth first; capabilities only if it passed.
 *
 * A capability probe against an instance that just refused the login tells you nothing you did not
 * already know and spends five more requests finding it out — on the same account, moments after
 * a failed authentication.
 */
export async function probeAll(client, { username, authMethod = 'basic', tokenProbe, env = process.env, fluent = checkFluent, now = () => new Date(), } = {}) {
    const auth = await probeAuth(client, {
        ...(username ? { username } : {}), authMethod, ...(tokenProbe ? { tokenProbe } : {}), env,
    });
    if (auth.status !== 'ok') {
        return {
            at: now().toISOString(),
            auth,
            capabilities: FLAG_NAMES.map((flag) => ({
                flag, status: 'skipped', detail: `auth ${auth.status} — not attempted`,
            })),
        };
    }
    const capabilities = await Promise.all(FLAG_NAMES.map((flag) => probeCapability(client, flag, { env, fluent })));
    return { at: now().toISOString(), auth, capabilities };
}
/**
 * The store shape.
 *
 * STATUSES ONLY. No username, no role list, no hint text — the store is read by the banner, the
 * doctor and `/snowarch status`, and a probe record that carried an account name would put it in
 * every one of them.
 */
export function toLastProbe(result) {
    const status = (flag) => result.capabilities.find((c) => c.flag === flag)?.status ?? 'skipped';
    return {
        at: result.at,
        auth: result.auth.status,
        write: status('WRITE_ENABLED'),
        scripting: status('SCRIPTING_ENABLED'),
        cmdb: status('CMDB_WRITE_ENABLED'),
        atf: status('ATF_ENABLED'),
        nowAssist: status('NOW_ASSIST_ENABLED'),
        fluent: status('FLUENT_ENABLED'),
    };
}
/** A client error, mapped to a probe status — the client's own code, never re-derived. */
function fromClientError(err, env) {
    const e = err;
    const httpStatus = e?.details?.status;
    if (e?.code === 'AUTHENTICATION_FAILED' || httpStatus === 401) {
        return { status: 'auth failed', code: 'AUTHENTICATION_FAILED', ...(httpStatus ? { httpStatus } : {}) };
    }
    if (e?.code === 'INSUFFICIENT_PRIVILEGES' || httpStatus === 403) {
        return {
            status: 'role missing',
            code: 'INSUFFICIENT_PRIVILEGES',
            ...(httpStatus ? { httpStatus } : {}),
            hint: ROLE_MISSING_HINT,
        };
    }
    if (httpStatus !== undefined) {
        return { status: 'error', ...(e.code ? { code: e.code } : {}), httpStatus,
            detail: `the instance answered ${httpStatus}` };
    }
    return unreachable(err, env);
}
/** A network failure: S02's classification, not a second opinion. */
function unreachable(err, env) {
    const diagnosis = classifyNetworkError(err, env);
    return { status: 'unreachable', code: diagnosis.code, detail: diagnosis.remedy };
}
