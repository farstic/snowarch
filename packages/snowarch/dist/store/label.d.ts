import { type Flags } from '../utils/permissions.js';
export interface DefaultLabel {
    label: string;
}
/**
 * `{ label }` when the store names a default, `null` otherwise — including when the file is
 * missing or malformed. A mirror that threw would make an unreadable store fail a step whose job
 * is unrelated to it; the store's own reader reports that, with its own diagnosis.
 */
export declare function readDefaultLabel(storePath: string): DefaultLabel | null;
/** The three non-secret fields that name an install: what B09 prints and what `mode` reports. */
export interface DefaultSummary {
    label: string;
    environment: string | null;
    preset: string | null;
}
/**
 * The default instance's label, environment and preset — ARC-06-C15.
 *
 * `./snowarch mode` printed `instance=pdi (unknown) preset=unknown` on every live checkout, because
 * it read `state.instance` and `state.steps.B08.data.instance` and NOTHING in the tree ever wrote
 * either. The two fields could not be anything but `unknown`. B06 has just watched the wizard save
 * them, so B06 is the step that should record them — the same rule ARC-06-C7 applied to the mode
 * itself: the step that makes it true is the step that writes it down.
 *
 * Deliberately NOT an extension of `readDefaultLabel`: that function's one-key shape is pinned by a
 * test whose message says "exactly one key, so nothing else can ride along", and the right answer to
 * a guard like that is a second function with its own guard, not an argument with it.
 */
export declare function readDefaultSummary(storePath: string): DefaultSummary | null;
/**
 * Every configured instance, named — ARC-08-C17.
 *
 * SV-03's cheap half: who is in the store, without a probe, a network call or a spawned server.
 * The doctor's quick run needs this because `deriveMode` was deciding "design-only" from an empty
 * instance list that was empty only because nobody had asked — and the SessionStart hook prints
 * that line, while the rule file forbids every MCP call in design-only. A checkout with a working
 * instance could not get a single tool called.
 *
 * Same discipline as its two siblings: three non-secret fields per entry, named one at a time, and
 * a test pins the key set. A spread of the entry would carry the credential block.
 */
/**
 * ARC-08-C21 — a summary that can answer "what is this instance allowed to do".
 *
 * `effectiveFlags` is what the SERVER would gate on, computed here with the server's own two
 * functions rather than a second reading: `expandPreset` turns a named preset into six explicit
 * strings (and `custom` into the entry's own), `applyDependencyRule` then turns off anything whose
 * prerequisite is off. Two encodings of that rule disagree the moment a dependency is added, and
 * `DEPENDENCIES` is already the one definition both the server and the wizard read.
 *
 * `null` when the entry names a preset this build does not know — which is a real possibility on a
 * store written by a newer version. Guessing `read-only` would understate it and `full` would
 * overstate it; saying nothing is what the caller can render honestly.
 */
export interface StoreSummary extends DefaultSummary {
    effectiveFlags: Flags | null;
}
export declare function readStoreSummaries(storePath: string): StoreSummary[];
