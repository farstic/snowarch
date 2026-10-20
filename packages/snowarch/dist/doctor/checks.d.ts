import { pathToFileURL } from 'node:url';
import type { Check } from './types.js';
/**
 * Where `dist/` is, relative to this module once built.
 *
 * `fileURLToPath`, never `new URL(...).pathname`. On Windows the pathname of a file URL is
 * `/C:/…` — a leading slash before the drive letter, which is not a filesystem path. The first
 * version used it, so `dist/contract.json` was never found on any Windows cell: SV-05 skipped,
 * SV-01 failed, and the report read as a broken installation on a perfectly good one.
 */
declare const distDir: () => string;
export declare const svNodeFloor: Check;
export declare const svDist: Check;
export declare const svStore: Check;
export declare const svInstances: Check;
export declare const svProbes: Check;
interface Handshake {
    tools: string[];
    capabilities: Record<string, unknown> | null;
    error?: string;
    /**
     * Milliseconds from spawn to the `initialize` reply — the COLD START, which is the number
     * `MCP_TIMEOUT` is set against (S-06). Recorded here rather than measured by a caller: the
     * caller would be timing its own `await`, which includes `tools/list` and a tool call.
     */
    initializeMs?: number;
}
/**
 * Speak MCP to our own `dist/server.js` over stdio.
 *
 * Hand-rolled JSON-RPC rather than the SDK client: the doctor must work from a plain install
 * with no dev dependencies, and it is diagnosing the very thing the SDK would be talking to —
 * a failure inside a client library would be reported as a server fault.
 *
 * `[UNDICI-EHPA] Warning: EnvHttpProxyAgent is experimental` appears on stderr the first time
 * the proxy agent is built. Stderr is IGNORED here for exactly that reason: a server that warns
 * is not a server that failed, and treating any stderr output as an error would make this check
 * red on every machine.
 */
/**
 * The handshake's own deadline, in milliseconds.
 *
 * A TESTABILITY SEAM, not a behaviour change: the default is the 20 000 ms this has always used,
 * and no caller in the product passes anything else. It exists so a test can point the handshake at
 * a server that never answers and get the timeout in milliseconds instead of twenty seconds on
 * every CI cell (ARC-06 acceptance, B06-02 and B06-04).
 *
 * It is deliberately NOT `MCP_TIMEOUT`. That value is the number the cold start is compared
 * *against* — the engine reads `.claude/settings.json` and warns when the start is over 60 % of it —
 * and it has never bounded this deadline. See the ARC-06 chores table: tying the two together is a
 * 2.0.x candidate, and this parameter is where a fix would attach.
 */
export declare const HANDSHAKE_TIMEOUT_MS = 20000;
/**
 * Exported as a test seam only. Production reaches it through `getHandshake()`, which fixes the
 * server path and the deadline; a test needs both to point a never-answering fixture at it without
 * a built `dist/` and without waiting the real timeout.
 */
export declare function handshake(serverPath: string, timeoutMs?: number): Promise<Handshake>;
/** Test seam: run the next handshake against a short deadline, and put it back. */
export declare function setHandshakeTimeoutMs(ms: number): void;
/** Test seam: forget the cached handshake between fixtures. */
export declare function resetHandshakeCache(): void;
export declare const svHandshake: Check;
export declare const svCapabilities: Check;
export declare const svAudit: Check;
/**
 * Every ancestor of `dir` that holds a `.claude/skills`.
 *
 * Ported from `scripts/ci/skill-listing-check.mjs`, which is the measured implementation behind
 * the S-13 addendum. Kept as a separate exported function so ARC-08 can re-home this check as
 * an engine check without moving the walk.
 */
export declare function pollutingAncestors(dir: string, home?: string): string[];
export declare const svAncestorSkills: Check;
/**
 * Does this build read the store that is there?
 *
 * ARC-09-S06, and it is SV-09 rather than the story's SV-08 — ARC-08-S04 shipped the ancestor
 * skills check under that id first.
 *
 * Separate from SV-02 on purpose. SV-02 answers "is the file safe and loadable"; this answers
 * "is it the shape this build speaks", and the two have different remedies pointing in opposite
 * directions — migrate the file, or upgrade the checkout. Folding them together would give one
 * line that has to hedge.
 *
 * NOT fixable, deliberately and permanently: `--fix`'s whitelist never touches the credential
 * file (`01` §8). The command is what `--fix` reports under REFUSED, which is how a user running
 * it learns exactly what it declined to do and what to run instead.
 */
export declare const svStoreSchema: Check;
export declare const ALL_CHECKS: Check[];
/** Exported so a caller can resolve `dist/` the same way the checks do. */
export { distDir, pathToFileURL };
