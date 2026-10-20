/**
 * The permission gates — now per instance, not per process.
 *
 * Every `require*()` keeps its zero-argument signature and reads the ambient instance
 * (`currentInstance()`), so the 166 call sites in the dispatchers did not change. What
 * changed is where the answer comes from: the instance's EFFECTIVE flags, after preset
 * expansion and the dependency rule, rather than `process.env`.
 *
 * `evaluateGate` is the single implementation. The `require*` functions are thin wrappers
 * over it, so the contract test (S06) and the runtime cannot disagree about what a gate
 * means — which they could if each gate carried its own copy of the rule.
 */
import { ServiceNowError } from './errors.js';
import type { ErrorCodeName } from '../errors/codes.js';
import { FLAG_NAMES, type FlagName, type Flags } from '../servicenow/context.js';
export { FLAG_NAMES };
export type { FlagName, Flags };
export type PresetName = 'read-only' | 'pdi-developer' | 'full' | 'custom';
export type GateName = 'none' | 'write' | 'cmdb_write' | 'scripting' | 'atf' | 'now_assist' | 'fluent';
/**
 * The preset table of `01` §6.3. Exported because ARC-04-S06 emits it into the contract:
 * one table, so a client and the server cannot hold different ideas of what `full` means.
 */
export declare const PRESETS: Record<Exclude<PresetName, 'custom'>, Flags>;
/** Six explicit strings, always. `custom` takes the store's flags; absent reads as "false". */
export declare function expandPreset(preset: PresetName, custom?: Partial<Flags>): Flags;
/**
 * The named preset these six toggles ARE, or `custom`.
 *
 * The inverse of `expandPreset`, and it lives here for the same reason `expandPreset` does: the
 * preset table is one definition, and a UI that decided "this looks like pdi-developer" by its own
 * comparison would be a second one — wrong the moment a preset gains a flag.
 *
 * `custom` is not a failure. It is the honest name for a combination nobody named, and the wizard
 * prints it as such.
 */
export declare function matchPreset(flags: Flags): PresetName;
/**
 * Scripting and CMDB writes are writes. Declaring one without `WRITE_ENABLED` is a
 * contradiction, and resolving it towards "allowed" would let a store that reads as
 * read-only perform writes. The dependent flag is forced false and the contradiction is
 * reported; the store on disk is never modified by the server.
 */
/**
 * WHICH FLAG NEEDS WHICH, in one table.
 *
 * The graph was written twice — here, inside `applyDependencyRule`, and again in ARC-07-S04's
 * review screen, which had to know that turning WRITE off means asking about SCRIPTING and
 * CMDB_WRITE. Two encodings of one rule disagree the moment a third dependency appears, and the
 * UI's copy is the one nobody would think to update. So the table is the definition, the server's
 * rule reads it, and the wizard reads it: `requiresOf` for "what does this flag need", `dependentsOf`
 * for "what needs this flag".
 */
export declare const DEPENDENCIES: Readonly<Record<FlagName, readonly FlagName[]>>;
/**
 * What `flag` needs turned on before it means anything.
 *
 * No `?? []` fallback: the table is typed `Record<FlagName, …>` and a test asserts its keys ARE
 * `FLAG_NAMES`, so a missing entry cannot happen — and a fallback that cannot run is a branch the
 * coverage gate correctly refuses to accept as tested.
 */
export declare const requiresOf: (flag: FlagName) => readonly FlagName[];
/** What would become a contradiction if `flag` were turned off. In `FLAG_NAMES` order. */
export declare const dependentsOf: (flag: FlagName) => readonly FlagName[];
export declare function applyDependencyRule(flags: Flags, label?: string): {
    effective: Flags;
    warnings: string[];
};
/** A preset whose expansion disagrees with the stored flags. The expansion wins. */
export declare function checkPresetMismatch(preset: PresetName, stored: Partial<Flags>, label?: string): string[];
export interface ProdPosture {
    ok: boolean;
    code?: 'PROD_WRITE_NOT_ACKNOWLEDGED';
    message?: string;
}
/**
 * D-05. The threshold is ANY effective flag true, not `WRITE_ENABLED` — deliberately
 * stricter. A `custom` instance with only `ATF_ENABLED` still runs tests against
 * production, and the acknowledgement is about the operator having chosen that on purpose.
 */
/**
 * ARC-07-C31 slice 3 — RENDERED INTO CHAT, AND STILL THE OPERATOR'S OWN SHELL.
 *
 * This sentence leaves as a `ServiceNowError` and reaches the MCP client, which is Claude, which
 * renders it into a conversation rather than into a terminal. That invites the conclusion that no
 * shell is involved and the spelling does not matter. It is the wrong conclusion: the operator reads
 * it and types it on the machine THIS SERVER IS RUNNING ON, so `cliSpelling()` is the right source.
 */
/** `cli` REQUIRED: five product callers, and the rule is a count rather than a judgement. */
export declare function checkProdPosture(entry: {
    label: string;
    environment: string;
    preset: string;
    effectiveFlags: Flags;
    prodWriteAck: boolean;
}, cli: string): ProdPosture;
export interface GateResult {
    ok: boolean;
    code?: ErrorCodeName;
    missing?: FlagName[];
}
/**
 * The one place a gate is decided. `mutates` matters only for `fluent`, whose read
 * operations are harmless and whose writes are writes.
 *
 * Ordering note: for the composite gates the message names WRITE first when WRITE is what
 * is missing — the same order the old `requireCmdbWrite` produced, so an existing client
 * parsing these codes sees no change.
 */
export declare function evaluateGate(gate: GateName, mutates: boolean, flags: Flags): GateResult;
/**
 * The smallest preset whose expansion turns every missing flag on.
 *
 * Hard-coding `pdi-developer` was wrong and shipped: a FLUENT or NOW_ASSIST refusal on an
 * instance already at `pdi-developer` told the reader to set the preset they were already
 * on — a remedy that changes nothing. Those two flags are only in `full`.
 *
 * Ordered least-permissive first, so the suggestion never grants more than the caller
 * actually needs.
 */
export declare function remedyPreset(missing?: FlagName[]): Exclude<PresetName, 'custom'>;
/**
 * The refusal a caller sees. It names the instance, because with several configured
 * "writes are disabled" is not actionable on its own, and it carries the command that
 * changes it. A prod instance gets the stronger sentence: the cap is deliberate, and
 * raising it needs an explicit acknowledgement rather than a preset change.
 */
/**
 * ARC-07-C31 slice 3 — RENDERED INTO CHAT, AND STILL THE OPERATOR'S OWN SHELL.
 *
 * This sentence leaves as a `ServiceNowError` and reaches the MCP client, which is Claude, which
 * renders it into a conversation rather than into a terminal. That invites the conclusion that no
 * shell is involved and the spelling does not matter. It is the wrong conclusion: the operator reads
 * it and types it on the machine THIS SERVER IS RUNNING ON, so `cliSpelling()` is the right source.
 */
/** A default is within the rule here: exactly one product caller, and it is named at that site. */
export declare function gateError(result: GateResult, cli?: string): ServiceNowError;
export declare function requireWrite(): void;
export declare function requireCmdbWrite(): void;
export declare function requireScripting(): void;
export declare function requireAtf(): void;
export declare function requireNowAssist(): void;
export declare function requireFluent(): void;
export declare function isWriteEnabled(): boolean;
export declare function isCmdbWriteEnabled(): boolean;
export declare function isScriptingEnabled(): boolean;
export declare function isAtfEnabled(): boolean;
export declare function isNowAssistEnabled(): boolean;
export declare function isFluentEnabled(): boolean;
