// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-07-S08 — `instance import --from-legacy`: read the old store, SHOW the plan, then migrate.
 *
 * Three rules shape this file, and each of them is a decision rather than an implementation
 * detail:
 *
 *   IT NEVER DELETES ANYTHING. The legacy files are left exactly where they are and the closing
 *   advice names them; the user does the deleting, when they are satisfied. A migration that
 *   removed the old copy would be irreversible on the strength of one run of code nobody has
 *   watched work yet — and the whole reason the advice exists is that those files hold plaintext
 *   secrets, which is a reason to be told, not a reason for a tool to act.
 *
 *   IT SHOWS THE PLAN FIRST. Every entry, what it becomes, and every note — printed before
 *   anything is written, stopped by `--dry-run`, confirmed by `Proceed?` otherwise. The legacy
 *   files the Electron app wrote default `writeEnabled` to TRUE, so an import that saved silently
 *   would hand somebody an all-write installation they never chose.
 *
 *   IT CARRIES NO `aiApiKey`. The key is listed as dropped, by NAME, and its value never reaches
 *   an output byte — not the plan, not the summary, not a log line. 2.0.0 has nowhere to put it
 *   and no reason to know it.
 *
 * Everything else is composition: S02's URL rules, S03's probes, S04's screen and preset matching,
 * S05's save path, S06's masking, S07's `--global` resolution and cloud-sync warning.
 */
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { normalizeInstanceUrl, proposeEnvironment } from './url.js';
import { COLUMNS, ENTRY_DEFAULTS, labelOf, resolveFlags, wrapText, } from './preset-ui.js';
import { cloudSyncGate, maskUsername, probeOptionsFor, targetStore, EXIT_FAILED, EXIT_OK, EXIT_POLICY, EXIT_USAGE, LABEL_RULE, } from './instance.js';
import { probeAll, toLastProbe } from '../servicenow/probes.js';
import { ServiceNowClient } from '../servicenow/client.js';
import { loadStore, saveStore } from '../store/index.js';
import { STORE_VERSION, completeFlags } from '../store/schema.js';
import { maskPath } from '../store/paths.js';
import { applyDependencyRule, matchPreset, FLAG_NAMES } from '../utils/permissions.js';
import { remedyFor } from '../errors/codes.js';
import { cliSpelling } from './tty.js';
/**
 * Where snow-mcp 1.x kept its store, ON EVERY OPERATING SYSTEM.
 *
 * `homedir()/.config`, including on Windows — the old code used the POSIX shape there too, so the
 * Windows default is `%USERPROFILE%\.config\servicenow-mcp\instances.json` and never `%APPDATA%`.
 * ARC-08's E-24 detector checks this same path; getting it wrong here would mean the doctor finds
 * a legacy store the import then cannot open.
 */
export const legacyStorePath = (home = homedir()) => join(home, '.config', 'servicenow-mcp', 'instances.json');
/** The directory the closing advice names — both files live in it. */
export const legacyStoreDir = (home = homedir()) => join(home, '.config', 'servicenow-mcp');
/**
 * Every key the legacy entry shape has, and what becomes of it. DATA, and complete.
 *
 * A test asserts that every key in the fixture is in this table — mapped, dropped or a secret —
 * so a legacy field cannot be silently ignored. "Silently" is the operative word: dropping
 * `group` is correct, and telling the user it was dropped is what makes it correct.
 */
export const FIELD_MAP = Object.freeze({
    name: 'mapped',
    instanceUrl: 'mapped',
    authMethod: 'mapped',
    username: 'mapped',
    password: 'mapped',
    clientId: 'mapped',
    clientSecret: 'mapped',
    authMode: 'mapped', // not carried, but it produces a NOTE, so it is read
    writeEnabled: 'mapped',
    scriptingEnabled: 'mapped',
    cmdbWriteEnabled: 'mapped',
    atfEnabled: 'mapped',
    nowAssistEnabled: 'mapped',
    toolPackage: 'mapped',
    environment: 'mapped',
    group: 'dropped',
    integrationMode: 'dropped',
    mcpEnabled: 'dropped',
    sdkEnabled: 'dropped',
    apexEnabled: 'dropped',
    aiProvider: 'dropped',
    aiModel: 'dropped',
    aiBaseUrl: 'dropped',
    addedAt: 'dropped',
    aiApiKey: 'secret',
});
/**
 * The legacy key for a flag, DERIVED rather than listed.
 *
 * `WRITE_ENABLED` → `writeEnabled`, `CMDB_WRITE_ENABLED` → `cmdbWriteEnabled`,
 * `NOW_ASSIST_ENABLED` → `nowAssistEnabled`: the old wizard's field names are the lower-camel form
 * of the same words. Spelling the five out here would put flag literals in `src/cli/`, which this
 * repository forbids for the reason ARC-07-S04 learnt — the graph belongs in the permission module,
 * and a second copy is the one nobody updates.
 */
export const legacyKeyFor = (flag) => {
    const [first, ...rest] = flag.toLowerCase().split('_');
    return [first, ...rest.map((w) => `${w[0]?.toUpperCase() ?? ''}${w.slice(1)}`)].join('');
};
/** The flag the old wizard never wrote (P-23) — always imported as off, and never read. */
export const NEVER_IN_LEGACY = FLAG_NAMES.filter((f) => labelOf(f) === 'FLUENT');
/** The five legacy flags. `FLUENT` is not among them; it is written off, always. */
export const FLAG_MAP = Object.freeze(FLAG_NAMES.filter((f) => !NEVER_IN_LEGACY.includes(f))
    .map((flag) => ({ legacy: legacyKeyFor(flag), flag })));
/** The old wizard's five environment words, and what each becomes. */
export const ENVIRONMENT_MAP = Object.freeze({
    production: 'prod',
    development: 'dev',
    test: 'test',
    staging: 'test',
    pdi: 'pdi',
});
/**
 * The tolerant reader.
 *
 * A file written by a version nobody here has seen must not stop a migration: unknown keys are
 * COLLECTED and reported, and the entries that do parse are still offered. The one thing it will
 * not do is guess — an entry with no usable URL is skipped with the reason, not repaired.
 *
 * Both container shapes are accepted. The story documents an array with `name` on each entry; a
 * record keyed by label appears in some 1.x files, and rejecting it would send a user to a
 * hand-edit for a difference this reader can simply absorb.
 */
export function readLegacyStore(path) {
    if (!existsSync(path)) {
        const remedy = remedyFor('LEGACY_STORE_NOT_FOUND').remedy;
        return { ok: false,
            message: `LEGACY_STORE_NOT_FOUND — no legacy store at ${maskPath(path)}. `
                + `${remedy.charAt(0).toUpperCase()}${remedy.slice(1)}.` };
    }
    let raw;
    try {
        raw = JSON.parse(readFileSync(path, 'utf8'));
    }
    catch (e) {
        return { ok: false, message: `LEGACY_STORE_UNREADABLE — ${maskPath(path)} is not JSON (${e.message}).` };
    }
    const root = (raw ?? {});
    const container = root.instances;
    const entries = Array.isArray(container)
        ? container
        : Object.entries((container ?? {}))
            .map(([name, entry]) => ({ name, ...entry }));
    const unknown = [...new Set(entries.flatMap((e) => Object.keys(e)))]
        .filter((key) => !(key in FIELD_MAP) && !key.startsWith('_'))
        .sort();
    return { ok: true,
        store: {
            ...(typeof root.version === 'number' ? { version: root.version } : {}),
            ...(typeof root.defaultInstance === 'string' ? { defaultInstance: root.defaultInstance } : {}),
            entries,
            unknown,
        } };
}
/** `My PDI!` → `my-pdi`; `2025-dev` → `i-2025-dev`. The note says when the label changed. */
export function normaliseLabel(name) {
    const cleaned = String(name).toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
    // A label that cannot start with a letter gets one, rather than being refused: the old wizard
    // allowed names this schema does not, and refusing an otherwise-perfect entry over its first
    // character would send somebody to a hand-edit for nothing.
    const prefixed = /^[a-z]/.test(cleaned) ? cleaned : `i-${cleaned}`;
    const label = prefixed.slice(0, 32).replace(/-+$/, '');
    return label === String(name)
        ? { label }
        : { label, note: `label "${name}" normalised to "${label}"` };
}
/**
 * ARC-07-C31 slice 3 — one caller, `line 472` below, so a default is within the rule and named.
 */
const skipAdd = (label, url, environment, reason, cli = cliSpelling()) => `${reason} — add it fresh with: ${cli} instance add ${label} --url ${url} --env ${environment}`;
/**
 * One legacy entry, mapped. Nothing here touches the network or the disk.
 *
 * Every rule the story lists lives in this function, and each produces a NOTE rather than a silent
 * change: a migration whose output differs from its input without saying so is how somebody ends
 * up with a production instance that can write.
 */
/**
 * ARC-07-C31 slice 3 — one PRODUCT caller, `line 425` below; its other call site is a test.
 */
export function planEntry(entry, taken, cli = cliSpelling()) {
    const notes = [];
    const { label, note } = normaliseLabel(String(entry.name ?? ''));
    if (note)
        notes.push(note);
    const blank = { label, url: String(entry.instanceUrl ?? ''), environment: null,
        auth: 'basic', preset: 'read-only', flags: completeFlags({}), notes };
    if (!LABEL_RULE.test(label))
        return { ...blank, skip: `skipped: "${entry.name}" is not a usable label` };
    if (taken.has(label)) {
        return { ...blank, skip: 'skipped: label exists (use --only and remove first, or rename manually)' };
    }
    // The URL, through S02 — including the `/api` suffix the old wizard appended for its own client.
    const rawUrl = String(entry.instanceUrl ?? '');
    const stripped = rawUrl.replace(/\/api\/?$/, '');
    if (stripped !== rawUrl)
        notes.push('"/api" removed from URL');
    const url = normalizeInstanceUrl(stripped);
    if (!url.ok)
        return { ...blank, skip: `skipped: ${url.message}` };
    const legacyAuth = String(entry.authMethod ?? 'basic').toLowerCase();
    const auth = legacyAuth === 'oauth' ? 'oauth_ropc' : 'basic';
    if (entry.authMode !== undefined && entry.authMode !== 'service-account') {
        notes.push('per-user/impersonation mode is not carried (removed in 2.0.0)');
    }
    const username = String(entry.username ?? '');
    const password = String(entry.password ?? '');
    let credentials;
    if (auth === 'oauth_ropc') {
        const clientId = String(entry.clientId ?? '');
        const clientSecret = String(entry.clientSecret ?? '');
        if (!clientId || !clientSecret || !username || !password) {
            return { ...blank, url: url.url, auth, skip: 'skipped: oauth entry incomplete' };
        }
        credentials = { method: 'oauth_ropc', username, password, clientId, clientSecret };
    }
    else {
        if (!username || !password)
            return { ...blank, url: url.url, skip: 'skipped: no username or password' };
        credentials = { method: 'basic', username, password };
    }
    // The environment, mapped or proposed. NEVER guessed: the environment decides whether a write
    // needs `--ack-prod`, so an entry that cannot say which it is has to be asked or skipped.
    const legacyEnv = entry.environment === undefined ? '' : String(entry.environment).toLowerCase();
    let environment = ENVIRONMENT_MAP[legacyEnv] ?? null;
    if (legacyEnv === 'staging')
        notes.push('staging mapped to test');
    if (environment === null && legacyEnv !== '')
        notes.push(`environment "${entry.environment}" not recognised`);
    if (environment === null)
        environment = proposeEnvironment(url.url);
    // The flags: five mapped, FLUENT always written off, then ARC-04-S03's dependency rule.
    const mapped = Object.fromEntries(FLAG_MAP.map(({ legacy, flag }) => [flag, entry[legacy] === true ? 'true' : 'false']));
    // Explicitly off, by the flag's own constant: P-23 — the old wizard never wrote this one, and an
    // absent flag would be filled in by `completeFlags` anyway. Saying so in a note is what makes it
    // a decision the reader can see rather than a default they discover later.
    const declared = completeFlags({ ...mapped,
        ...Object.fromEntries(NEVER_IN_LEGACY.map((f) => [f, 'false'])) });
    notes.push(`${NEVER_IN_LEGACY.map(labelOf).join(', ')} set to off`);
    const ruled = applyDependencyRule(declared, label);
    for (const warning of ruled.warnings)
        notes.push(warning.replace(/^FLAG_DEPENDENCY_VIOLATION: /, ''));
    let flags = ruled.effective;
    if (environment === 'prod' && FLAG_NAMES.some((f) => flags[f] === 'true')) {
        flags = completeFlags({});
        notes.push('production capped at read-only (D-05) — raise with: '
            + `${cli} instance set-preset ${label} <preset> --ack-prod`);
    }
    if (entry.toolPackage !== undefined && entry.toolPackage !== 'full') {
        notes.push(`tool package "${entry.toolPackage}" not carried — 2.0.0 uses full (P-25)`);
    }
    const dropped = Object.keys(entry).filter((k) => FIELD_MAP[k] === 'dropped').sort();
    if (dropped.length > 0)
        notes.push(`dropped: ${dropped.join(', ')}`);
    // By NAME, never by value. The key is the one thing in a legacy file that 2.0.0 has nowhere to
    // put and no reason to know.
    if (entry.aiApiKey !== undefined)
        notes.push('dropped: aiApiKey (a secret — not carried; delete the legacy file)');
    const planned = {
        label, url: url.url, environment, auth, flags, notes,
        preset: matchPreset(flags), credentials,
    };
    if (environment === null) {
        return { ...planned, skip: 'environment unknown — add it with instance add --env …' };
    }
    return planned;
}
/** The plan, printed before anything is written and in full. */
export function renderPlan(plan) {
    const lines = [
        `Legacy store: ${maskPath(plan.legacyPath)} (${plan.entries.length} instance${plan.entries.length === 1 ? '' : 's'})`,
        `Target store: ${maskPath(plan.targetPath)} (${plan.targetSource})`,
    ];
    const width = (pick) => Math.max(...plan.entries.map((e) => pick(e).length), 0);
    const labelWidth = width((e) => e.label);
    const urlWidth = width((e) => e.url);
    const envWidth = width((e) => e.environment ?? '?');
    const authWidth = width((e) => e.auth);
    for (const entry of plan.entries) {
        const head = `  ${entry.label.padEnd(labelWidth)}  ${entry.url.padEnd(urlWidth)}  `
            + `${(entry.environment ?? '?').padEnd(envWidth)}  ${entry.auth.padEnd(authWidth)}`;
        lines.push(entry.skip
            ? `${head}  → ${entry.skip}`
            : `${head}  → preset ${entry.preset}`);
        // ONE `notes:` clause per entry, as the story's plan shows — wrapped at the review screen's
        // own budget rather than run out to three hundred characters, because the notes are the part
        // a reader has to act on and a terminal folding them mid-word is where they stop reading.
        if (entry.notes.length > 0) {
            const indent = ' '.repeat(labelWidth + 4);
            const wrapped = wrapText(`notes: ${entry.notes.join('; ')}`, COLUMNS - indent.length);
            for (const line of wrapped)
                lines.push(`${indent}${line}`);
        }
    }
    if (plan.unknownKeys.length > 0) {
        lines.push(`  Unrecognised legacy keys, ignored: ${plan.unknownKeys.join(', ')}`);
    }
    lines.push('Each imported instance is probed before it is saved; an entry whose credentials fail is not saved.');
    return lines.join('\n');
}
/** The closing advice. It NAMES the files; it never removes one. */
/**
 * ARC-07-C31 slice 3 — `env` JOINS THE `platform` THIS ALREADY HAD, and it is not symmetry.
 *
 * `cliSpelling(platform, env)` is `platform === 'win32' && !env.SHELL && !env.MSYSTEM`, so
 * `cliSpelling('win32')` alone reads the RUNNER's `SHELL` and renders POSIX on any mac — the fixture
 * trap that cost this programme three sittings. This function's contract is already "render for the
 * platform I was told", and its own test drives `'win32'` from a mac, so the shell has to be told
 * too or the test would assert the POSIX spelling while claiming to check the Windows one.
 */
export function deletionAdvice(imported, total, home = homedir(), platform = process.platform, env = process.env) {
    // The separator follows the PLATFORM THIS ADVICE IS FOR, not the one the process happens to run
    // on: `join()` uses the host's, so a Windows command rendered on a POSIX runner (and the reverse,
    // which is how this was found) came out with the wrong slashes in a line the reader will paste.
    const separator = platform === 'win32' ? '\\' : '/';
    const dir = maskPath(legacyStoreDir(home)).split(/[\\/]/).join(separator);
    const remove = platform === 'win32' ? `Remove-Item -Recurse ${dir}` : `rm -r ${dir}`;
    return `Imported ${imported} of ${total}. The legacy files were left in place. When you are `
        + `satisfied, delete them: ${remove}   (contains instances.json and tokens.json with plaintext `
        + `secrets). Then remove stale Claude Code registrations: ${cliSpelling(platform, env)} doctor `
        + 'lists the exact '
        + 'claude mcp remove commands.';
}
const defaultClient = (entry) => new ServiceNowClient({
    instanceUrl: entry.url,
    authMethod: entry.auth.method === 'basic' ? 'basic' : 'oauth',
    maxRetries: 0,
    requestTimeoutMs: 15_000,
    ...(entry.auth.method === 'basic'
        ? { basic: { username: entry.auth.username, password: entry.auth.password } }
        : { oauth: { username: entry.auth.username, password: entry.auth.password,
                clientId: entry.auth.clientId, clientSecret: entry.auth.clientSecret } }),
});
/**
 * The whole command: read, plan, show, confirm, probe, save, advise.
 *
 * The order is the product. Nothing is written before the plan has been SHOWN and accepted, one
 * cloud-sync warning covers the run rather than nagging per entry, and each entry is probed with
 * ONE request before it is saved — an entry whose credentials no longer work is skipped with the
 * command that would add it by hand, because a store full of instances that cannot log in is
 * worse than a store with one that can.
 */
export async function runImport(options, io, deps = {}) {
    const env = deps.env ?? process.env;
    const home = deps.home ?? homedir();
    const legacyPath = options.path ?? legacyStorePath(home);
    const empty = { legacyPath, targetPath: '', targetSource: '', entries: [], unknownKeys: [] };
    const legacy = readLegacyStore(legacyPath);
    if (!legacy.ok) {
        io.write(`${legacy.message}\n`);
        return { exitCode: EXIT_USAGE, imported: 0, total: 0, plan: empty };
    }
    const target = targetStore(deps, options);
    const existing = existsSync(target.path) ? loadStore(target.path) : null;
    const store = existing && 'store' in existing
        ? existing.store
        : { version: STORE_VERSION, instances: {} };
    const only = options.only && options.only.length > 0 ? new Set(options.only) : null;
    const taken = new Set(Object.keys(store.instances));
    const entries = [];
    for (const raw of legacy.store.entries) {
        const planned = planEntry(raw, taken);
        if (only && !only.has(planned.label) && !only.has(String(raw.name ?? '')))
            continue;
        // A label planned in this run is taken for the next one: two legacy entries that normalise to
        // the same label must not both claim it.
        if (!planned.skip)
            taken.add(planned.label);
        entries.push(planned);
    }
    const plan = {
        legacyPath,
        targetPath: target.path,
        targetSource: target.source,
        entries,
        unknownKeys: legacy.store.unknown,
        ...(legacy.store.defaultInstance ? { defaultInstance: legacy.store.defaultInstance } : {}),
    };
    io.write(`${renderPlan(plan)}\n`);
    if (options.dryRun)
        return { exitCode: EXIT_OK, imported: 0, total: entries.length, plan };
    const importable = entries.filter((e) => !e.skip);
    if (importable.length === 0) {
        io.write(`${deletionAdvice(0, entries.length, home, deps.platform ?? process.platform)}\n`);
        return { exitCode: EXIT_OK, imported: 0, total: entries.length, plan };
    }
    if (!options.yes) {
        const answer = ((await io.ask('Proceed? [Y/n] ')) ?? '').trim().toLowerCase();
        if (answer === 'n' || answer === 'no') {
            io.write('Nothing imported.\n');
            return { exitCode: EXIT_OK, imported: 0, total: entries.length, plan };
        }
    }
    // ONE warning for the run. Per entry it would be the same sentence five times about one file.
    const gate = await cloudSyncGate(target.path, options, io, env);
    if (!gate.ok) {
        io.write('Nothing imported.\n');
        return { exitCode: EXIT_POLICY, imported: 0, total: entries.length, plan };
    }
    let next = store;
    let imported = 0;
    for (const entry of importable) {
        const credentials = entry.credentials;
        const client = (deps.makeClient ?? defaultClient)({ url: entry.url, auth: credentials });
        const all = await (deps.probe ?? probeAll)(client, probeOptionsFor(credentials, env));
        if (all.auth.status !== 'ok') {
            const reason = all.auth.status === 'unreachable' ? 'unreachable' : String(all.auth.status);
            entry.skip = `skipped: ${skipAdd(entry.label, entry.url, entry.environment, reason)}`;
            io.write(`  ${entry.label}: ${entry.skip}\n`);
            continue;
        }
        const lastProbe = toLastProbe({ ...all, at: (deps.now ?? (() => new Date().toISOString()))() });
        // The migrated flags are a PROPOSAL, not a decision (principle 10): the legacy files the
        // Electron app wrote default `writeEnabled` to true, so a non-prod entry goes through S04's
        // screen unless the caller said `--yes`.
        const decision = await resolveFlags({
            label: entry.label,
            environment: entry.environment,
            flags: FLAG_NAMES.map((f) => `${labelOf(f)}=${entry.flags[f] === 'true' ? 'on' : 'off'}`).join(','),
            ...(options.yes ? { yes: true } : { io: io }),
            probes: lastProbe,
        });
        if (!decision.ok) {
            entry.skip = `skipped: ${decision.message}`;
            io.write(`  ${entry.label}: ${entry.skip}\n`);
            continue;
        }
        const saved = {
            url: entry.url,
            environment: entry.environment,
            auth: credentials,
            preset: decision.preset,
            flags: completeFlags(decision.flags),
            ...ENTRY_DEFAULTS,
            prodWriteAck: false,
            lastProbe,
        };
        next = {
            ...next,
            instances: { ...next.instances, [entry.label]: saved },
        };
        // The default is carried only when that label was imported AND the target has none: a
        // migration that changed which instance the server starts with would be a surprise nobody
        // asked for.
        if (plan.defaultInstance === entry.label && next.defaultInstance === undefined) {
            next = { ...next, defaultInstance: entry.label };
        }
        saveStore(target.path, next);
        imported += 1;
        io.write(`  ${entry.label}: imported (preset ${decision.preset}, user ${maskUsername(credentials.username)})\n`);
    }
    io.write(`${deletionAdvice(imported, entries.length, home, deps.platform ?? process.platform)}\n`);
    return { exitCode: imported === 0 ? EXIT_FAILED : EXIT_OK, imported, total: entries.length, plan };
}
