// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * The store schema, version 1 — exactly `01` §7.
 *
 * Two shapes are refused deliberately, because both look right and behave wrong:
 *
 *  - `flags` values are the literal STRINGS "true" / "false", never booleans. The env
 *    path compares byte-exactly against "true", so a JSON boolean would read as absent
 *    and silently disable a write flag the user believes they enabled.
 *  - `auth.method` is `basic | oauth_ropc`. `client_credentials` is roadmap: accepting it
 *    would store a client id and secret the client code has no branch to use.
 */
import { z } from 'zod';
import { cliSpelling } from '../cli/tty.js';
export const STORE_VERSION = 1;
export const FLAG_NAMES = [
    'WRITE_ENABLED', 'CMDB_WRITE_ENABLED', 'SCRIPTING_ENABLED',
    'ATF_ENABLED', 'NOW_ASSIST_ENABLED', 'FLUENT_ENABLED',
];
const flagValue = z.enum(['true', 'false'], {
    errorMap: () => ({ message: 'must be the string "true" or "false"' }),
});
// A bare https origin: no path, no query, no trailing slash. A trailing slash produces
// `https://x//api/now/...` on join, which some proxies reject and others silently rewrite.
const instanceUrl = z.string().refine((v) => {
    let u;
    try {
        u = new URL(v);
    }
    catch {
        return false;
    }
    return u.protocol === 'https:' && u.pathname === '/' && !u.search && !u.hash && !v.endsWith('/');
}, { message: 'must be a bare https:// origin with no path or trailing slash' });
const label = z.string().regex(/^[a-z][a-z0-9_-]{0,31}$/, 'must match ^[a-z][a-z0-9_-]{0,31}$');
const authBasic = z.object({
    method: z.literal('basic'),
    username: z.string().min(1),
    password: z.string().min(1),
});
const authOauthRopc = z.object({
    method: z.literal('oauth_ropc'),
    clientId: z.string().min(1),
    clientSecret: z.string().min(1),
    username: z.string().min(1),
    password: z.string().min(1),
});
// discriminatedUnion so the error names `auth.method` rather than listing both branches.
const auth = z.discriminatedUnion('method', [authBasic, authOauthRopc], {
    errorMap: (issue, ctx) => issue.code === z.ZodIssueCode.invalid_union_discriminator
        ? { message: 'must be "basic" or "oauth_ropc"' }
        : { message: ctx.defaultError },
});
export const instanceSchema = z.object({
    url: instanceUrl,
    environment: z.enum(['pdi', 'dev', 'test', 'prod']),
    auth,
    preset: z.enum(['read-only', 'pdi-developer', 'full', 'custom']),
    // Fewer than six is allowed; the loader fills the gaps with "false" and warns
    // FLAGS_INCOMPLETE so the doctor can offer --fix.
    flags: z.record(z.enum(FLAG_NAMES), flagValue).default({}),
    toolPackage: z.enum(['full']).default('full'),
    maxRecords: z.number().int().min(1).max(1000).default(100),
    prodWriteAck: z.boolean().default(false),
    // passthrough: ARC-07-S03 adds probe keys without a schema version bump.
    lastProbe: z.object({ at: z.string() }).passthrough().optional(),
}).strict();
export const storeSchema = z.object({
    version: z.literal(STORE_VERSION),
    defaultInstance: label.optional(),
    instances: z.record(label, instanceSchema),
}).strict();
/**
 * `instances.pdi.flags.WRITE_ENABLED`, in backticks: the path a user can find in their own file, or nothing for the
 * store's root.
 *
 * ARC-09-C211 — IN BACKTICKS, because a bare `word.word` is what the engine's printer masks as a person's first.last:
 * the doctor's SV-02 printed "instances.pdi Unrecognized key(s) …" as "i***.p*** …". A key in backticks is left alone.
 */
export function issuePath(issue) {
    const path = issue.path.join('.');
    return path ? `\`${path}\`` : '';
}
/**
 * Version first, and separately from the schema: a store written by a different server is a
 * different failure from a malformed one, and the remedy is a command, not an edit.
 *
 * TWO codes, not one (ARC-09-S06). `STORE_SCHEMA_UNSUPPORTED` said "run ./snowarch upgrade" in
 * both directions, which is right for a store from the future and wrong — actively misleading —
 * for one from the past: upgrading the checkout that already reads the newer schema does nothing
 * at all, and the file the user needed to migrate sits there through it. The two directions have
 * two remedies and now say so.
 */
/**
 * ARC-07-C31 slice 3 — A DEFAULT IS ALLOWED: exactly one product caller, `store/index.ts:94`.
 */
export function parseStore(raw, cli = cliSpelling()) {
    if (raw && typeof raw === 'object' && 'version' in raw) {
        const v = raw.version;
        if (typeof v === 'number' && v !== STORE_VERSION) {
            return v > STORE_VERSION
                ? { error: { code: 'STORE_SCHEMA_NEWER',
                        message: `store schema ${v} is newer than this server supports (${STORE_VERSION}) — `
                            + `run ${cli} upgrade, or restore a backup (${cli} store backups)` } }
                : { error: { code: 'STORE_SCHEMA_OUTDATED',
                        message: `store schema ${v} is older than this server (${STORE_VERSION}) — `
                            + `run ${cli} store migrate` } };
        }
    }
    const parsed = storeSchema.safeParse(raw);
    if (parsed.success)
        return { store: parsed.data };
    const first = parsed.error.issues[0];
    return { error: { code: 'STORE_SCHEMA_INVALID',
            message: [issuePath(first), first.message].filter(Boolean).join(' ') } };
}
/** Absent flags read as "false" — the same semantics the env path has always had. */
export function completeFlags(flags) {
    const out = {};
    for (const name of FLAG_NAMES)
        out[name] = flags[name] ?? 'false';
    return out;
}
