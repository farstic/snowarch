// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * Store schema migrations — explicit, versioned, backed up, and never near a credential.
 *
 * ARC-09-S06. The old server (`src/cli/config-store.ts`) migrated per-instance fields silently on
 * every load and swallowed a parse error by returning an empty config, which is two bad ideas
 * wearing one coat: a user whose file was mistyped was told they had no instances, and a user who
 * pulled a new version had their credential file rewritten by a process they never started. This
 * module is the replacement, and its shape is a reaction to both:
 *
 *   **Nothing migrates on load.** The server reads the version, and if it is not this build's it
 *   refuses to start configured — with `STORE_SCHEMA_OUTDATED` and the command to run. Migrating
 *   is a thing a person asks for.
 *
 *   **A parse error is a hard error.** `STORE_UNREADABLE`, with the path, and the file is left
 *   exactly as it was. "Return empty" is how a store with one typo becomes a store with nothing.
 *
 *   **A backup before every write**, 0600, byte-identical to the input, named for the moment it
 *   was taken. Restoring is `store restore`, not a rescue operation.
 *
 *   **Credential values are never touched.** Not by policy — by a test that deep-compares the
 *   `auth` subtree of every instance before and after, over a deep-frozen input, on every
 *   migration in the registry. A migration that touches `auth` fails the suite; it cannot ship.
 *
 * The registry is EMPTY at 2.0.0 and `CURRENT_SCHEMA_VERSION` is 1. That is deliberate: the
 * framework exists before the first migration so that whoever changes the schema is forced
 * through it — the contiguity test refuses a `MIGRATIONS` array that does not end exactly at
 * `CURRENT_SCHEMA_VERSION`, so a bumped constant with no migration is a failing build.
 */
import { chmodSync, copyFileSync, existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { STORE_VERSION } from '../schema.js';
import { maskPath } from '../paths.js';
import { saveStore } from '../index.js';
const isWindows = process.platform === 'win32';
/**
 * The version this build reads and writes.
 *
 * ONE constant, defined in `schema.ts` where the shape it describes lives, and re-exported under
 * the name the migration framework thinks in. Two constants would be the classic version of this
 * bug: the schema accepts 1, the migrator believes the target is 2, and a store that satisfies
 * neither is written by a program that believes it succeeded.
 */
export const CURRENT_SCHEMA_VERSION = STORE_VERSION;
/**
 * The shipped registry. Empty at v1 — see the header.
 *
 * The test seam is the `migrations` PARAMETER of `migrateStore`, not a `registerMigrationForTest`
 * hook — story amendment. A registry a test can append to is a registry a production path can
 * append to, and the hook would have to exist in the shipped build to be callable from one. A
 * parameter defaulting to the shipped list gives a test its 1→2 fixture with no shipped mutable
 * state at all, and `checkRegistry()` is applied to whatever list is passed, so the fixture is
 * held to the same contiguity and purity rules as the real thing.
 */
export const MIGRATIONS = [];
/** The oldest store that has ever existed. Asserted of the SHIPPED chain, not of every chain. */
export const SHIPPED_CHAIN_STARTS_AT = 1;
export class StoreMigrationError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.name = 'StoreMigrationError';
        this.code = code;
    }
}
/**
 * The registry's own rules, checked as a function so the test and any future loader ask the same
 * question rather than two similar ones.
 *
 * Contiguity is what makes "apply each in order" safe: with a gap, a v1 store meets the 3→4
 * migration with v1 data. The chain must be single steps, in order, ending exactly at the version
 * this build writes.
 *
 * Where it STARTS is not checked here: `migrateStore` already refuses a store the chain cannot
 * take (`STORE_SCHEMA_OUTDATED`, naming the version), which is the same fact discovered against
 * the actual file rather than asserted in the abstract. `SHIPPED_CHAIN_STARTS_AT` is the separate
 * claim about the shipped registry — v1 is the oldest store that has ever existed — and the
 * registry test is where it belongs.
 */
export function checkRegistry(migrations = MIGRATIONS, current = CURRENT_SCHEMA_VERSION) {
    const problems = [];
    if (migrations.length === 0) {
        if (current !== 1)
            problems.push(`no migrations, but CURRENT_SCHEMA_VERSION is ${current}`);
        return problems;
    }
    for (const [i, m] of migrations.entries()) {
        if (m.to !== m.from + 1)
            problems.push(`migration ${i} is ${m.from}→${m.to}, not a single step`);
        if (i > 0 && m.from !== migrations[i - 1].to) {
            problems.push(`migration ${i} starts at ${m.from}, but ${i - 1} ended at ${migrations[i - 1].to}`);
        }
        if (!m.describe.trim())
            problems.push(`migration ${i} (${m.from}→${m.to}) has no description`);
    }
    const last = migrations[migrations.length - 1].to;
    if (last !== current)
        problems.push(`the chain ends at ${last}, but CURRENT_SCHEMA_VERSION is ${current}`);
    return problems;
}
/** Deep-freeze, so a migration that mutates its input throws in a test rather than passing. */
function deepFreeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
        Object.freeze(value);
        for (const v of Object.values(value))
            deepFreeze(v);
    }
    return value;
}
/**
 * The credential invariant, as a comparison rather than a promise.
 *
 * Every instance's `auth` subtree — method, username, password, client id and secret — must be
 * deep-equal before and after. Compared by serialisation because that is what "the same bytes end
 * up in the file" means, and the VALUES never appear in the failure message: a test that printed
 * the diff would print the password it was protecting.
 */
export function authUnchanged(before, after) {
    const problems = [];
    const instancesOf = (s) => (s.instances ?? {});
    const a = instancesOf(before);
    const b = instancesOf(after);
    for (const label of Object.keys(a)) {
        if (!(label in b)) {
            problems.push(`instance "${label}" was removed by a migration`);
            continue;
        }
        const one = JSON.stringify(a[label]?.auth ?? null);
        const two = JSON.stringify(b[label]?.auth ?? null);
        // The LENGTHS and the fact, never the content.
        if (one !== two)
            problems.push(`instance "${label}": the auth subtree changed (${one.length} → ${two.length} bytes)`);
    }
    return problems;
}
/** `instances.json.bak-20261001T101500Z` — sorts chronologically, and says what it is. */
export function backupName(at) {
    return `instances.json.bak-${at.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')}`;
}
/**
 * Migrate a store file, or say why not.
 *
 * The order is the whole design: read, parse, decide, BACK UP, apply, write. Nothing is written
 * before the decision, and nothing is applied before the backup exists — so every failure mode
 * leaves either the original file or the original file plus a copy of itself.
 */
/**
 * ARC-07-C31 slice 3 — `cli` REQUIRED: TWO product callers (`cli/store-command.ts:101` and `:135`),
 * and the rule this row settled is a count rather than a judgement. Both of them sit inside a command
 * that has already resolved the spelling, so requiring it makes them pass what they know instead of
 * letting this function read the process behind them.
 */
export function migrateStore(path, { backup = true, dryRun = false, migrations = MIGRATIONS, current = CURRENT_SCHEMA_VERSION, now = () => new Date(), cli, }) {
    const shown = maskPath(path);
    if (!existsSync(path)) {
        throw new StoreMigrationError('STORE_NOT_FOUND', `store not found: ${shown}`);
    }
    let raw;
    const text = readFileSync(path, 'utf8');
    try {
        raw = JSON.parse(text);
    }
    catch {
        // The parse error's own message is not repeated: it names an offset, which sends a reader
        // into a credential file with an editor. The remedy is a backup, and `store backups` lists them.
        throw new StoreMigrationError('STORE_UNREADABLE', `${shown} is not valid JSON — restore a backup (${cli} store backups)`);
    }
    const from = raw?.version;
    if (typeof from !== 'number' || !Number.isInteger(from) || from < 1) {
        throw new StoreMigrationError('STORE_SCHEMA_INVALID', `${shown}: version must be a positive integer, not ${JSON.stringify(from)}`);
    }
    if (from === current)
        return { migrated: false, from, to: current, steps: [] };
    if (from > current) {
        throw new StoreMigrationError('STORE_SCHEMA_NEWER', `store schema ${from} is newer than this server supports (${current}) — run ${cli} upgrade, `
            + `or restore a backup (${cli} store backups)`);
    }
    const pending = migrations.filter((m) => m.from >= from);
    const problems = checkRegistry(migrations, current);
    if (problems.length > 0) {
        throw new StoreMigrationError('STORE_SCHEMA_INVALID', `the migration registry is not usable: ${problems.join('; ')}`);
    }
    if (pending.length === 0 || pending[0].from !== from) {
        throw new StoreMigrationError('STORE_SCHEMA_OUTDATED', `${shown} is schema ${from}, and this build has no migration from it to ${current}`);
    }
    const steps = pending.map((m) => `${m.from}→${m.to} ${m.describe}`);
    if (dryRun)
        return { migrated: false, from, to: current, steps, dryRun: true };
    let backupPath;
    if (backup) {
        backupPath = join(dirname(path), backupName(now()));
        // `copyFileSync`, so the backup is the input's BYTES — not a re-serialisation of the parsed
        // object, which would silently reformat (and quietly "fix") the very file kept for rescue.
        copyFileSync(path, backupPath);
        if (!isWindows)
            chmodSync(backupPath, 0o600);
    }
    const before = deepFreeze(JSON.parse(text));
    let state = before;
    for (const m of pending) {
        state = { ...m.up(deepFreeze(state)), version: m.to };
    }
    const changed = authUnchanged(before, state);
    if (changed.length > 0) {
        // The backup is already on disk and the store is untouched, so this refusal costs a file and
        // nothing else. Refusing AFTER applying and BEFORE writing is the only order in which a
        // migration's actual output can be judged.
        throw new StoreMigrationError('STORE_SCHEMA_INVALID', `a migration changed credential data and was refused: ${changed.join('; ')}`);
    }
    saveStore(path, state);
    return { migrated: true, from, to: current, steps, ...(backupPath ? { backup: backupPath } : {}) };
}
/** `instances.json.bak-*` beside the store, newest first. */
export function listBackups(storePath) {
    const dir = dirname(storePath);
    if (!existsSync(dir))
        return [];
    return readdirSync(dir)
        .filter((f) => f.startsWith('instances.json.bak-'))
        .map((f) => {
        const p = join(dir, f);
        const s = statSync(p);
        return { path: p, size: s.size, at: s.mtime };
    })
        .sort((a, b) => b.at.getTime() - a.at.getTime());
}
/**
 * Put a backup back, atomically and 0600.
 *
 * It is PARSED first: a backup that is not a valid store is not a rescue, and discovering that
 * after overwriting the current file would leave a user with two broken copies.
 */
export function restoreBackup(storePath, backupPath) {
    if (!existsSync(backupPath)) {
        throw new StoreMigrationError('STORE_NOT_FOUND', `backup not found: ${maskPath(backupPath)}`);
    }
    let raw;
    try {
        raw = JSON.parse(readFileSync(backupPath, 'utf8'));
    }
    catch {
        throw new StoreMigrationError('STORE_UNREADABLE', `${maskPath(backupPath)} is not valid JSON — it cannot be restored`);
    }
    saveStore(storePath, raw);
    return { version: typeof raw.version === 'number' ? raw.version : 0 };
}
