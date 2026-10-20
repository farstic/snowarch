import { type Environment } from './url.js';
import { type AddIo, type ManageDeps } from './instance.js';
import { type StoreInstance } from '../store/schema.js';
import { FLAG_NAMES, type Flags } from '../utils/permissions.js';
/**
 * Where snow-mcp 1.x kept its store, ON EVERY OPERATING SYSTEM.
 *
 * `homedir()/.config`, including on Windows — the old code used the POSIX shape there too, so the
 * Windows default is `%USERPROFILE%\.config\servicenow-mcp\instances.json` and never `%APPDATA%`.
 * ARC-08's E-24 detector checks this same path; getting it wrong here would mean the doctor finds
 * a legacy store the import then cannot open.
 */
export declare const legacyStorePath: (home?: string) => string;
/** The directory the closing advice names — both files live in it. */
export declare const legacyStoreDir: (home?: string) => string;
/**
 * Every key the legacy entry shape has, and what becomes of it. DATA, and complete.
 *
 * A test asserts that every key in the fixture is in this table — mapped, dropped or a secret —
 * so a legacy field cannot be silently ignored. "Silently" is the operative word: dropping
 * `group` is correct, and telling the user it was dropped is what makes it correct.
 */
export declare const FIELD_MAP: Readonly<Record<string, 'mapped' | 'dropped' | 'secret'>>;
/**
 * The legacy key for a flag, DERIVED rather than listed.
 *
 * `WRITE_ENABLED` → `writeEnabled`, `CMDB_WRITE_ENABLED` → `cmdbWriteEnabled`,
 * `NOW_ASSIST_ENABLED` → `nowAssistEnabled`: the old wizard's field names are the lower-camel form
 * of the same words. Spelling the five out here would put flag literals in `src/cli/`, which this
 * repository forbids for the reason ARC-07-S04 learnt — the graph belongs in the permission module,
 * and a second copy is the one nobody updates.
 */
export declare const legacyKeyFor: (flag: string) => string;
/** The flag the old wizard never wrote (P-23) — always imported as off, and never read. */
export declare const NEVER_IN_LEGACY: ("WRITE_ENABLED" | "CMDB_WRITE_ENABLED" | "SCRIPTING_ENABLED" | "ATF_ENABLED" | "NOW_ASSIST_ENABLED" | "FLUENT_ENABLED")[];
/** The five legacy flags. `FLUENT` is not among them; it is written off, always. */
export declare const FLAG_MAP: ReadonlyArray<{
    legacy: string;
    flag: typeof FLAG_NAMES[number];
}>;
/** The old wizard's five environment words, and what each becomes. */
export declare const ENVIRONMENT_MAP: Readonly<Record<string, Environment>>;
export interface LegacyEntry {
    name?: string;
    [key: string]: unknown;
}
export interface LegacyStore {
    version?: number;
    defaultInstance?: string;
    entries: LegacyEntry[];
    /** Keys no version of the legacy shape ever had — reported, never fatal. */
    unknown: string[];
}
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
export declare function readLegacyStore(path: string): {
    ok: true;
    store: LegacyStore;
} | {
    ok: false;
    message: string;
};
/** `My PDI!` → `my-pdi`; `2025-dev` → `i-2025-dev`. The note says when the label changed. */
export declare function normaliseLabel(name: string): {
    label: string;
    note?: string;
};
export interface PlannedEntry {
    label: string;
    url: string;
    environment: Environment | null;
    auth: 'basic' | 'oauth_ropc';
    preset: string;
    flags: Flags;
    notes: string[];
    /** Set when this entry will NOT be imported; the reason is shown in the plan. */
    skip?: string;
    credentials?: StoreInstance['auth'];
}
export interface ImportPlan {
    legacyPath: string;
    targetPath: string;
    targetSource: string;
    entries: PlannedEntry[];
    unknownKeys: string[];
    defaultInstance?: string;
}
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
export declare function planEntry(entry: LegacyEntry, taken: ReadonlySet<string>, cli?: string): PlannedEntry;
export interface ImportOptions {
    path?: string;
    dryRun?: boolean;
    yes?: boolean;
    global?: boolean;
    only?: string[];
    json?: boolean;
}
/** The plan, printed before anything is written and in full. */
export declare function renderPlan(plan: ImportPlan): string;
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
export declare function deletionAdvice(imported: number, total: number, home?: string, platform?: NodeJS.Platform, env?: NodeJS.ProcessEnv): string;
export interface ImportResult {
    exitCode: number;
    imported: number;
    total: number;
    plan: ImportPlan;
}
interface ImportDeps extends ManageDeps {
    home?: string;
    platform?: NodeJS.Platform;
}
/**
 * The whole command: read, plan, show, confirm, probe, save, advise.
 *
 * The order is the product. Nothing is written before the plan has been SHOWN and accepted, one
 * cloud-sync warning covers the run rather than nagging per entry, and each entry is probed with
 * ONE request before it is saved — an entry whose credentials no longer work is skipped with the
 * command that would add it by hand, because a store full of instances that cannot log in is
 * worse than a store with one that can.
 */
export declare function runImport(options: ImportOptions, io: AddIo, deps?: ImportDeps): Promise<ImportResult>;
export {};
