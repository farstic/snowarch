export type StoreSource = 'env' | 'project' | 'global' | 'none';
export interface StoreCandidate {
    path: string;
    exists: boolean;
}
export interface StoreResolution {
    path: string | null;
    source: StoreSource;
    candidates: StoreCandidate[];
}
/**
 * An environment variable is "set" only when it is present AND non-empty.
 *
 * `.mcp.json` passes `${SNOW_STORE:-}` (01 §5), so an unset variable arrives as an
 * empty string. Treating `""` as a value would resolve the store to the current
 * directory and load whatever happened to be there.
 */
export declare function envPath(name: string): string | undefined;
/**
 * The per-user global store, per OS.
 *
 * `XDG_CONFIG_HOME` is honoured (ARC-07-S07): `01` §7 names `~/.config/snowarch/instances.json`,
 * and on a machine where that variable is set, `~/.config` is not where a user's configuration
 * lives — writing there anyway would put the credential store somewhere they do not look and
 * somewhere their backup rules do not cover. Windows keeps `%APPDATA%` with ARC-04-S02's fallback.
 */
export declare function globalStorePath(): string;
/** The per-checkout store. `CLAUDE_PROJECT_DIR` is set by Claude Code; cwd is the fallback. */
export declare function projectStorePath(): string;
/**
 * The precedence: explicit override, then per-checkout, then global. First existing wins;
 * they are never merged, because a merge makes "which file set this value" unanswerable.
 *
 * `SNOW_STORE` is the exception: it is explicit, so a missing file is an ERROR rather than
 * a reason to try the next candidate. Falling back would mean a typo in the override
 * silently loads a different instance than the one asked for.
 */
export declare function resolveStorePath({ global }?: {
    global?: boolean;
}): StoreResolution;
/**
 * A path fit for a log line: the home directory becomes `~`, the checkout becomes
 * `<checkout>`. Absolute paths carry the account name, and a log is the one place a
 * username reaches a screen share, a bug report or a support ticket.
 */
/**
 * Is `path` the prefix, or under it? The remainder if so, `null` if not.
 *
 * ARC-08-C23 — BOTH SEPARATORS, and this is the second masker in this product to need it. #229
 * taught `homeValues` in `doctor/json-boundary.mjs` the lesson: on Windows `git rev-parse
 * --show-toplevel` answers with FORWARD slashes, and a HOME or `CLAUDE_PROJECT_DIR` set by a bash
 * shell arrives the same way, so a path under home spelled with `/` is a spelling the product
 * itself produces. `maskPath` compared with the platform separator alone, so on Windows
 * `C:\Users\someone/checkout/.local/instances.json` matched nothing and the account name printed.
 * I fixed the first masker and did not look for a second; the Windows cell found it.
 *
 * Normalised for COMPARISON only — the remainder is returned exactly as it was given, because a
 * remedy or a log line should read the way the caller wrote it. The replacement is 1:1 in length,
 * which is what makes slicing by the original prefix's length correct.
 *
 * ONE DIRECTION, as in #229: `\` is a legal filename character on POSIX, so the two are treated as
 * interchangeable only where the platform says they are.
 */
export declare function underPrefix(path: string, prefix: string, sepChar?: string): string | null;
export declare function maskPath(p: string, { sepChar }?: {
    sepChar?: string;
}): string;
/**
 * A path fit for a REMEDY the reader will paste into a shell: home becomes `~`, which a
 * shell expands, and the checkout is left alone because `<checkout>` is not a path.
 *
 * `maskPath` is for prose and log lines; this is for the text after `Run:`. A remedy that
 * has been prettified into something unrunnable is worse than one that was never offered.
 */
export declare function maskPathForShell(p: string, { sepChar }?: {
    sepChar?: string;
}): string;
/**
 * The whole `Run:` clause for a remedy, phrased so it is BOTH pasteable and free of an
 * absolute path. Which of the three it is depends on where the file actually lives:
 *
 *  - inside the checkout  → a checkout-relative path, with "from the checkout" said out
 *    loud. This is the case `maskPathForShell` alone could not handle: a checkout on a
 *    second volume, under /srv, in a sandbox or on a CI runner is not under HOME, so
 *    there was no `~` to substitute and the absolute path was echoed.
 *  - under HOME           → `~/…`, which a shell expands.
 *  - anywhere else        → as given. The user chose that path explicitly (SNOW_STORE),
 *    and rewriting it would make the remedy point somewhere they did not name.
 */
export declare function shellRemedy(command: string, target: string, { sepChar }?: {
    sepChar?: string;
}): string;
/** `someone@corp.example.com` → `s***@corp.example.com`; `admin` → `a***`. Never the whole name. */
export declare function maskUsername(u: string): string;
/**
 * The provider names this repository uses, in the words a user would recognise.
 *
 * `CloudStorage (unknown provider)` is the fifth, and it is not padding: macOS mounts every
 * provider under `~/Library/CloudStorage/<Provider>-<tenant>`, so a mount whose vendor is not in
 * the table is still a synced folder — and saying "synced, and I cannot tell you by whom" is more
 * use than saying nothing. ARC-06-S05's engine module already worded it that way.
 */
export type CloudProvider = 'OneDrive' | 'Dropbox' | 'iCloud Drive' | 'Google Drive' | 'CloudStorage (unknown provider)';
export interface CloudSyncHit {
    provider: CloudProvider;
    /** The ancestor directory that matched — the folder to move the checkout OUT of. */
    root: string;
}
/**
 * THE provider list, as data.
 *
 * Three implementations must agree about it — this one, the bootstrap's stdlib re-implementation
 * (ARC-06-S05's `lib/cloud-sync.mjs`, for a checkout that has never run `npm ci`) and the doctor's
 * E-25 (ARC-08-S03). They agree by satisfying ONE fixture,
 * `packages/snowarch/tests/fixtures/cloud-sync-paths.json`, rather than by three tables that look
 * alike today. Order matters: `Mobile Documents` and `com~apple~CloudDocs` are how macOS spells
 * iCloud, and no user calls it either of those.
 */
export declare const CLOUD_SYNC_SEGMENTS: ReadonlyArray<{
    pattern: RegExp;
    provider: CloudProvider;
}>;
/** The Windows variables the OneDrive client sets. Checked BEFORE the name patterns. */
export declare const ONEDRIVE_ENV_ROOTS: readonly ["OneDrive", "OneDriveCommercial", "OneDriveConsumer"];
/**
 * Which cloud provider synchronises this path, and from which folder — or `null`.
 *
 * It matters because 0600 is a LOCAL permission: the sync client runs as the same user, so the
 * mode does not stop the file leaving the machine. The wizard warns and asks (D-04), the doctor
 * reports it, the server logs it.
 *
 * THE ENVIRONMENT ROOTS COME FIRST, and they are the only detector for the case that matters most:
 * enterprise "Known Folder Move" redirects `Documents` and `Desktop` into OneDrive without the word
 * OneDrive appearing anywhere in the path the user sees. `%OneDrive%` still points at it. macOS has
 * no equivalent — a redirected `~/Documents` there is undetectable, and that is a documented limit
 * rather than an oversight.
 *
 * Symlinks are resolved first, because a link into a synced folder is a path into a synced folder.
 * A path that does not exist — every path in the unit tests, and any path being planned rather than
 * visited — is matched as given: `realpathSync` throws on those, and refusing to answer would make
 * the check useless exactly where it is cheapest to run.
 */
export declare function detectCloudSync(absPath: string, { env, realpath }?: {
    env?: NodeJS.ProcessEnv;
    realpath?: (p: string) => string;
}): CloudSyncHit | null;
/** ARC-04-S02's boolean, now one question asked of one detector. */
export declare const isUnderCloudSyncFolder: (p: string) => boolean;
