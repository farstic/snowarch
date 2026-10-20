import { type StoreError } from '../schema.js';
/**
 * The version this build reads and writes.
 *
 * ONE constant, defined in `schema.ts` where the shape it describes lives, and re-exported under
 * the name the migration framework thinks in. Two constants would be the classic version of this
 * bug: the schema accepts 1, the migrator believes the target is 2, and a store that satisfies
 * neither is written by a program that believes it succeeded.
 */
export declare const CURRENT_SCHEMA_VERSION = 1;
/** A store as it was at some version — shapeless here on purpose; only `version` is load-bearing. */
export type VersionedStore = {
    version: number;
} & Record<string, unknown>;
export interface Migration {
    from: number;
    to: number;
    /** One line, shown by `store migrate` BEFORE it runs. A user approves what they can read. */
    describe: string;
    /** Pure: the input is deep-frozen, and the output is a new object. */
    up(store: Readonly<VersionedStore>): VersionedStore;
}
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
export declare const MIGRATIONS: Migration[];
/** The oldest store that has ever existed. Asserted of the SHIPPED chain, not of every chain. */
export declare const SHIPPED_CHAIN_STARTS_AT = 1;
export declare class StoreMigrationError extends Error {
    code: StoreError['code'] | 'STORE_SCHEMA_OUTDATED' | 'STORE_SCHEMA_NEWER';
    constructor(code: StoreMigrationError['code'], message: string);
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
export declare function checkRegistry(migrations?: readonly Migration[], current?: number): string[];
/**
 * The credential invariant, as a comparison rather than a promise.
 *
 * Every instance's `auth` subtree — method, username, password, client id and secret — must be
 * deep-equal before and after. Compared by serialisation because that is what "the same bytes end
 * up in the file" means, and the VALUES never appear in the failure message: a test that printed
 * the diff would print the password it was protecting.
 */
export declare function authUnchanged(before: VersionedStore, after: VersionedStore): string[];
/** `instances.json.bak-20261001T101500Z` — sorts chronologically, and says what it is. */
export declare function backupName(at: Date): string;
export interface MigrateResult {
    migrated: boolean;
    from: number;
    to: number;
    backup?: string;
    /** The `describe` line of each migration that ran, or would run under `--dry-run`. */
    steps: string[];
    dryRun?: boolean;
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
export declare function migrateStore(path: string, { backup, dryRun, migrations, current, now, cli, }: {
    backup?: boolean;
    dryRun?: boolean;
    migrations?: readonly Migration[];
    current?: number;
    now?: () => Date;
    cli: string;
}): MigrateResult;
/** `instances.json.bak-*` beside the store, newest first. */
export declare function listBackups(storePath: string): {
    path: string;
    size: number;
    at: Date;
}[];
/**
 * Put a backup back, atomically and 0600.
 *
 * It is PARSED first: a backup that is not a valid store is not a rescue, and discovering that
 * after overwriting the current file would leave a user with two broken copies.
 */
export declare function restoreBackup(storePath: string, backupPath: string): {
    version: number;
};
