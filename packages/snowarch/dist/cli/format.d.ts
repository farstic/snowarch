import { type Store, type StoreInstance } from '../store/schema.js';
import { type LastProbe } from '../servicenow/probes.js';
import type { Flags } from '../utils/permissions.js';
/**
 * A secret, described rather than shown: `set (len 12)`.
 *
 * The LENGTH is the useful part — "did the client secret arrive whole" is the question a support
 * conversation actually asks — and it is not the secret. `not set` for an absent one, because an
 * empty field and a missing field are different states to a reader debugging an OAuth entry.
 */
export declare const secretNote: (secret: string | undefined) => string;
export interface MaskedInstance {
    label: string;
    url: string;
    environment: StoreInstance['environment'];
    auth: {
        method: StoreInstance['auth']['method'];
        username: string;
        secret: string;
    };
    preset: StoreInstance['preset'];
    flags: Flags;
    prodWriteAck: boolean;
    lastProbe: LastProbe | null;
}
export declare function maskedInstance(label: string, entry: StoreInstance): MaskedInstance;
export interface ListJson {
    store: string;
    defaultInstance: string | null;
    instances: MaskedInstance[];
}
/** `list --json`. The store path is masked too: an absolute path carries the account name. */
export declare function listJson(storePath: string, store: Store): ListJson;
/**
 * ARC-08-C7 — the SAME state as everywhere else, so the same remedy.
 *
 * This was the seventh wording, and it escaped the first scan by being plural: `No instanceS
 * configured`. Being inside `instance list` is not a reason to send the reader somewhere different —
 * `instance add` is the wizard alone, and it would leave them one step into a live mode the toggles
 * do not reflect, in a terminal where `mode live` is just as available.
 */
export declare const NO_INSTANCES: (cli: string) => string;
/**
 * One probe as the table shows it: `auth ok · write ok · …`, or a dash when none has run.
 *
 * ARC-07-C6 — EVERY KEY THE RECORD CARRIES, in `PROBE_FIELDS`' order, which the wizard's Saved line
 * also reads. This used to name five of the seven in a hand-written list — `auth`, `write`,
 * `scripting`, `cmdb`, `atf` — so `nowAssist` and `fluent` were measured, stored, and never shown:
 * an instance whose Now Assist probe returned `not licensed` listed as a row of `ok`s. The fixture
 * in `instance-manage.test.ts` had carried `nowAssist: 'not licensed'` and `fluent: 'not installed'`
 * since the test was written, and nothing asserted on them because nothing printed them.
 *
 * PRESENT, not merely declared. A record written by an older build has fewer keys, and a cell
 * reading `now_assist undefined` would be a renderer inventing a result for a probe that never ran.
 * An absent key is left out; the dash is reserved for a record that does not exist at all.
 */
export declare function probeCell(probe: LastProbe | null): string;
/**
 * `LAST PROBE (most recent: 2026-09-04T10:12:00Z)` — and `most recent:` is not decoration.
 *
 * ARC-07-C6. The header carries ONE time because every row's own would repeat a 20-character
 * timestamp per line to say what one header says once, and a table nobody can read across is a
 * table nobody reads. But the time it carries is the newest in the store, so on a store with two
 * instances probed a week apart the bare `LAST PROBE (<at>)` read as a claim about both rows — and
 * the row it was wrong about was the stale one, which is the row a reader is looking for.
 *
 * Two instances, one aggregate: say which.
 */
export declare function probeColumnHeader(instances: readonly MaskedInstance[]): string;
/** The cell for an instance nothing has probed. Spelled once — the footnote explains this glyph. */
export declare const NEVER_PROBED = "\u2014";
/**
 * What the column means, printed under the table only when a row actually shows the dash.
 *
 * The header says WHEN — `LAST PROBE (2026-09-04T10:12:00Z)` — and a reader who sees `—` in a cell
 * has no way to tell "never probed" from "probed, nothing to report". It is the second of those
 * that would be alarming, and it is never what the dash means.
 *
 * Conditional on purpose: a table where every instance has been probed gets no footnote, because a
 * sentence explaining a glyph that is not on the screen is a line a reader has to rule out.
 */
/**
 * ARC-07-C31 slice 3 — `cli` REQUIRED: two callers, both in this file (lines 168 and 291). Two is
 * not one, and the rule is a COUNT rather than a judgement about whether two callers feel like one.
 */
export declare const neverProbedNote: (instances: readonly MaskedInstance[], cli: string) => string | null;
/**
 * The table. Columns are as wide as their widest cell, never wider.
 *
 * The `LAST PROBE` header carries the time of the most RECENT probe in the store, because every
 * row's own time would repeat a 20-character timestamp per line to say what one header says once,
 * and a table nobody can read across is a table nobody reads.
 */
/**
 * ARC-07-C31 slice 3 — A DEFAULT IS ALLOWED BECAUSE THERE IS EXACTLY ONE PRODUCT CALLER, NAMED:
 * `cli/instance.ts:1525`. Its other call sites are tests, the same shape the engine's `formatStatus` has.
 */
export declare function listTable(list: ListJson, cli?: string): string;
export interface ProbesJson {
    store: string;
    instances: Record<string, LastProbe>;
}
/**
 * `test --json` and `test --all --json` — ONE envelope, whether it holds one instance or five.
 *
 * The story specifies the shape for `--all`; giving the single form a different one would make
 * ARC-06-S08's merge (`probes[label] = JSON.parse(stdout)`) depend on which flag produced the
 * output, and a consumer that has to ask "how many did I request?" before reading a result is a
 * consumer that will get it wrong once.
 */
export declare function probesJson(storePath: string, probes: Record<string, LastProbe>): ProbesJson;
/**
 * The precedence sentence, spelled ONCE.
 *
 * `add --global`, `list --all` and `instance test` all say it, and the one thing a user needs from
 * it is which file the server will actually read. Paths go through `maskPath` — the home directory
 * becomes `~`, and an absolute path carries the account name into every screen share and ticket.
 */
export declare const precedenceNote: (label: string, firstPath: string, globalPath: string, source?: StoreLabel) => string;
/** The footer `list` prints when the OTHER store is not empty. */
/**
 * ARC-07-C31 slice 3 — A DEFAULT IS ALLOWED HERE BECAUSE THERE IS EXACTLY ONE CALLER, NAMED:
 * `cli/instance.ts:1532`. Its other three call sites are tests, which is the same shape
 * `formatStatus` has in the engine.
 */
export declare const otherStoreFooter: (count: number, cli?: string) => string;
/**
 * What the STORE column says — the thing that SELECTED the file, in the words a reader can check.
 *
 * `SNOW_STORE` rather than the resolver's internal `env`: a cell saying `env` sends somebody
 * looking for an environment, and the variable's own name is both shorter and checkable.
 */
export type StoreLabel = 'project' | 'global' | 'SNOW_STORE';
export declare const storeLabelFor: (source: string) => StoreLabel;
export interface CombinedListJson extends ListJson {
    /** `list --all`: which store each row came from, and the note when a label is in both. */
    stores: Record<StoreLabel, string | null>;
    notes: string[];
}
/**
 * Both stores, side by side, with every row saying where it came from.
 *
 * NEVER MERGED — `01` §7, and the reason is that a merge makes "which file set this value"
 * unanswerable. The rows are concatenated, a duplicate label appears TWICE with different `store`
 * values, and the note says which of the two the server reads.
 */
export declare function combinedListJson(first: {
    path: string;
    store: Store | null;
    source: StoreLabel;
}, globalStore: {
    path: string;
    store: Store | null;
}): CombinedListJson;
/** `list --all`: the table with a STORE column, then the precedence note for anything in both. */
/**
 * ARC-07-C31 slice 3 — A DEFAULT IS ALLOWED BECAUSE THERE IS EXACTLY ONE PRODUCT CALLER, NAMED:
 * `cli/instance.ts:1520`. Its other call sites are tests, the same shape the engine's `formatStatus` has.
 */
export declare function listAllTable(list: CombinedListJson, cli?: string): string;
