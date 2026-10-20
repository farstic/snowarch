/**
 * ARC-07-S04 — propose, review, apply. Nothing is imposed and nothing is decided by a probe.
 *
 * D-05, and it is worth being exact about what it rules, because the temptation runs the other
 * way: THE PROPOSAL IS A FUNCTION OF THE ENVIRONMENT ALONE. A probe that came back `not licensed`
 * changes the RECOMMENDATION TEXT on that line and never the toggle — because a probe is a
 * reading of the instance at one moment, and a wizard that silently turned a flag off on the
 * strength of one would produce an installation the user did not choose and cannot explain.
 *
 * Production is capped at `read-only` here with no override at all. Raising it is a separate,
 * named step in a different command (`set-preset --ack-prod`, ARC-07-S06), which is the point:
 * the moment you can raise production inside a wizard, raising production becomes something that
 * happens while you are doing something else.
 */
import { type FlagName, type Flags, type PresetName } from '../utils/permissions.js';
import { type LastProbe, type ProbeStatus } from '../servicenow/probes.js';
/** Every line this screen prints fits here. A wrapped hint is indented under its annotation. */
export declare const COLUMNS = 100;
export type Environment = 'pdi' | 'dev' | 'test' | 'prod';
/** The short label a reader sees, derived from the flag key — never a second list to maintain. */
export declare const labelOf: (flag: FlagName) => string;
/**
 * What `?` prints. Kept beside the screen that prints it, and asserted against
 * `docs/MODES-AND-PRESETS.md` §4 — one meaning per flag, in the page's own words.
 */
export declare const FLAG_MEANINGS: Readonly<Record<FlagName, string>>;
/** P-25: written on every entry, whatever the preset. One constant, consumed by S05's save. */
export declare const ENTRY_DEFAULTS: Readonly<{
    toolPackage: "full";
    maxRecords: 100;
}>;
/** The proposal. The environment, and nothing else — see the note at the top of this file. */
export declare function proposePreset(environment: Environment): PresetName;
export declare const PROD_LOCKED: (label: string, flag: FlagName, cli?: string) => string;
/** The refusal, in the story's words. Exit 3 — a policy answer, not a usage mistake. */
export declare const prodRefusal: (label: string, cli?: string) => string;
/**
 * The probe annotation for one flag.
 *
 * `ok` is one word; everything else says what was found AND what it would mean to leave the flag
 * on — a recommendation the user is free to ignore, which is the whole shape of this screen.
 */
/**
 * The statuses on which the review screen recommends turning a flag OFF — ARC-07-C4.
 *
 * ONE definition, two readers. `annotate` below renders "(recommend: off)" for exactly these, and
 * the non-interactive path applies exactly these; a test walks every `ProbeStatus` and asserts the
 * two agree, because a recommendation shown on one path and not applied on the other is how
 * `FLUENT=on` and `fluent not installed` came to print in the same Saved line.
 *
 * `skipped` and `undefined` are NOT here on purpose: a probe that did not run is not a probe that
 * failed, and turning a flag off because nobody looked would be the check-cannot-tell-absence-from-
 * failure defect wearing the other hat.
 */
export declare const probeRecommendsOff: (status: ProbeStatus | undefined) => boolean;
/**
 * The same finding, phrased for a line nobody can answer — ARC-07-C4.
 *
 * `annotate` asks "keep on?", which is right on a screen and wrong on the one line a `--yes` run
 * prints: there is nobody to ask. This states the consequence instead, and returns `null` for
 * exactly the statuses `probeRecommendsOff` rejects, so the two cannot drift — a test walks every
 * status and requires them to agree.
 */
export declare function probeNote(status: ProbeStatus | undefined, recordedAt?: string | null): string | null;
/**
 * WHEN THE PROBE WAS TAKEN — `null` for one that has just run.
 *
 * The screen renders the same `probe: ok` whether the probe ran a second ago or was read out of the
 * store, and the two callers differ: `instance add`, `instance test` and `import --from-legacy`
 * probe live and pass what they measured, while **`set-preset` passes `entry.lastProbe`** — a value
 * that can be any age. The owner asked the question in the 2026-09-23 sitting: *either the probes
 * are fresh and should be written, or they are the recorded ones and the word should say so*. They
 * are the recorded ones, so the word says so.
 *
 * A DATE, not an age: "recorded 2026-09-19" stays true tomorrow, where "5 days ago" is a sentence
 * that has to be recomputed to stay honest and is wrong in a transcript the moment it is pasted.
 */
export declare const recordedSuffix: (at: string | null | undefined) => string;
/** The command that clears this probe result, if naming one helps — ARC-07-W16. One definition. */
export declare const annotationCommand: (status: ProbeStatus | undefined) => string | null;
export declare function annotate(status: ProbeStatus | undefined, hint?: string, recordedAt?: string | null, row?: number): string;
/** The `LastProbe` field that carries a flag's result. One mapping, used by the screen and S05. */
export declare const PROBE_FIELD: Readonly<Record<FlagName, keyof Omit<LastProbe, 'at' | 'auth'>>>;
export interface ScreenInput {
    /**
     * The launcher spelling this screen should print (ARC-07-C1, second Windows round).
     *
     * OPTIONAL, defaulting to `cliSpelling()` — so production behaviour is unchanged and a Windows
     * user sees `.\snowarch.cmd`. It exists because the locked-production screen is asserted BYTE FOR
     * BYTE against `docs/snippets/review-screen-prod.txt`, and a snapshot is a fixed answer: a screen
     * that reads the platform inside itself renders one thing on a mac and another on Windows, and the
     * equality fails on the runner with no way for the case to say which platform it meant. Now it can.
     */
    cli?: string;
    label: string;
    environment: Environment;
    preset: PresetName;
    flags: Flags;
    probes?: LastProbe;
    /**
     * WHEN the probes in `probes` were taken, or `null`/absent when they have just been measured.
     *
     * `set-preset` reads `entry.lastProbe` out of the store, so its screen can be annotating a probe
     * from days ago; `instance add`, `instance test` and `import --from-legacy` pass what they just
     * measured. Rendering the two identically is what the owner's sitting flagged.
     */
    probesRecordedAt?: string | null;
    /** Per-flag hint text, for `role missing`. */
    hints?: Partial<Record<FlagName, string>>;
    /**
     * The production cap, lifted — and ONLY by ARC-07-S06's `set-preset --ack-prod` after the label
     * has been typed back (D-05).
     *
     * The cap is not a rendering detail: a screen whose boxes can be toggled on a `prod` instance is
     * the moment raising production becomes something that happens while you are doing something
     * else, which is exactly what S04 refuses. So the wizard never sets this, there is no flag that
     * reaches it from `instance add`, and the only caller is the branch that has already printed the
     * warning and read the label back.
     */
    prodAcknowledged?: boolean;
}
/**
 * Wrap `text` to `width`, on word boundaries.
 *
 * Truncation is not an option: the part of a hint that gets cut is the part that says what to do
 * about it, and a reader cannot tell anything is missing. A word longer than the width is left
 * whole and allowed to overflow — breaking a URL or a table name in half helps nobody.
 */
export declare function wrapText(text: string, width: number): string[];
/**
 * ARC-07-C41 — a list of `name: value` fields folds at its SEPARATORS, never inside a field.
 *
 * `wrapText` breaks on whitespace, which is right for prose and wrong for this: the owner's 2.0.6 field run
 * came back with `… now_assist: ok · FLUENT:` on one line and `off.` on the next. Measured on their own
 * configuration — everything on with FLUENT turned off at the permissions screen — the line is 103 columns
 * and `wrapText` breaks it after `FLUENT:` at 98. Both halves are under budget, which is exactly why the W16
 * budget case passes over it: this is not a width defect.
 *
 * A unit longer than the width takes its own line whole, which is the rule `wrapText` already applies to a
 * long word and `storeLine` applies to a path — breaking a field in half helps nobody. And the separator
 * joins two fields, so when they land on different lines it belongs to neither: no line ends in a dangling
 * ` ·`.
 */
export declare function wrapFields(text: string, width: number, separator?: string): string[];
/**
 * One flag row: a FIXED prefix and a wrapped annotation under it.
 *
 * Wrapping the whole row as one string was the first attempt, and it collapsed the column
 * padding — `NOW_ASSIST` sat one space from its annotation while every other row lined up,
 * because the padding is consecutive spaces and a word-wrapper eats those. The prefix is
 * therefore never wrapped; only the text after it is.
 */
export declare function wrapRow(prefix: string, note: string, columns?: number): string[];
/** The screen, byte for byte. The snapshot files in `docs/snippets/` are this function's output. */
/**
 * What the proposal actually IS, read off the flags.
 *
 * ARC-08-C23 — this said `non-production: everything on` for every non-production environment,
 * whatever the preset. So `set-preset pdi read-only` printed
 * `read-only  — non-production: everything on`: a header contradicting the word beside it, on the
 * screen whose entire job is to show what is about to be turned on. The phrase was describing the
 * ENVIRONMENT — "this is not production, so we are allowed to offer everything" — and reading as a
 * description of the PRESET.
 *
 * It is read from the flags rather than from the preset NAME, so `custom` gets an honest sentence
 * too and a preset whose expansion changes cannot leave this line behind.
 */
export declare function presetNote(flags: Flags): string;
export declare function renderReviewScreen(input: ScreenInput): string;
/** `Applying: preset custom — WRITE=on CMDB_WRITE=on …` — printed before anything is saved. */
export declare function applyingLine(preset: PresetName, flags: Flags, because?: Partial<Record<FlagName, string>>): string;
export interface FlagsParse {
    ok: boolean;
    flags?: Flags;
    message?: string;
}
/**
 * `--flags WRITE=on,CMDB_WRITE=on,…` — all six, or it is not a description of an installation.
 *
 * Five entries is a usage error naming the missing flag rather than a default for it: the whole
 * point of the flag form is that a machine said exactly what it wanted, and filling in the sixth
 * would be the wizard choosing while claiming the caller did.
 */
export declare function parseFlagsArg(raw: string): FlagsParse;
/** The dependency rule as a sentence, or null. The UI's copy of the server's own rule. */
export declare function dependencyViolation(flags: Flags): string | null;
export interface ReviewIo {
    /** One line from the operator, or null when input has ended. */
    ask: (prompt: string) => Promise<string | null>;
    write: (text: string) => void;
}
export interface ReviewResult {
    preset: PresetName;
    flags: Flags;
    cancelled?: boolean;
}
/**
 * The screen, until Enter.
 *
 * Case-insensitive because the labels are shouted in the screen and typed in lower case by
 * everyone. `q` and end-of-input both cancel, and cancelling saves nothing — which is why the
 * result says so rather than returning a preset the caller might write.
 */
/**
 * `FLUENT:  [1] on (current)  [2] off — recommended: @servicenow/sdk not on PATH` (ARC-07-C14).
 *
 * The reason appears only when the probe recommends off, and it is `annotationParts`' own head — one
 * definition, so the question and the row cannot describe the same probe differently.
 */
export declare function flagQuestion(flag: FlagName, flags: Flags, status?: ProbeStatus, hint?: string): string;
/**
 * One answer to a flag's question: `1`/`2`, `on`/`off`, or nothing.
 *
 * `null` means leave it and go back to the screen — Enter APPLIES at the screen's own prompt, and a
 * row opened by mistake must not change a permission. `undefined` is an answer that is not an option.
 *
 * THE PLAN SCREEN'S SEMANTICS, DELIBERATELY NOT ITS CODE: `resolveChoice` lives in
 * `tools/snowarch/lib/plan.mjs`, and the engine and the server are separate packages — `plan.mjs`'s
 * own comment records that the engine must not depend on the server, and nothing depends the other
 * way either. Importing across that line to share four lines would buy consistency with a coupling
 * neither package has today, so the grammar is shared and the function is not.
 */
export declare function resolveFlagAnswer(input: string | null): 'true' | 'false' | null | undefined;
export declare function runReviewScreen(input: ScreenInput, io: ReviewIo): Promise<ReviewResult>;
/**
 * One toggle, and the conversation the dependency rule needs.
 *
 * `n` keeps the state the story asks for in each direction: turning WRITE off with dependents on
 * leaves WRITE ON (the alternative is a contradiction the server would resolve by force), and
 * turning a dependent on with WRITE off leaves BOTH OFF.
 */
export declare function toggleFlag(current: Flags, flag: FlagName, io: ReviewIo): Promise<Flags>;
export interface ResolveInput {
    label: string;
    environment: Environment;
    preset?: string;
    flags?: string;
    yes?: boolean;
    probes?: LastProbe;
    /**
     * WHEN the probes in `probes` were taken, or `null`/absent when they have just been measured.
     *
     * `set-preset` reads `entry.lastProbe` out of the store, so its screen can be annotating a probe
     * from days ago; `instance add`, `instance test` and `import --from-legacy` pass what they just
     * measured. Rendering the two identically is what the owner's sitting flagged.
     */
    probesRecordedAt?: string | null;
    hints?: Partial<Record<FlagName, string>>;
    io?: ReviewIo;
    /** See `ScreenInput.prodAcknowledged` — S06's `--ack-prod`, after the label was typed back. */
    prodAcknowledged?: boolean;
}
export interface ResolveResult {
    ok: boolean;
    preset?: PresetName;
    flags?: Flags;
    applying?: string;
    /** Set when the answer is a refusal: the caller exits with it and writes nothing. */
    exitCode?: number;
    message?: string;
}
/**
 * The whole decision, with nothing written.
 *
 * S05 owns the save; this owns what would be saved, and returns BEFORE any store call on every
 * refusal path — which is what makes "writes nothing" testable here rather than only end to end.
 */
export declare function resolveFlags(input: ResolveInput): Promise<ResolveResult>;
