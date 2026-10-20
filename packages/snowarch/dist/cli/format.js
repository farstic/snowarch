// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-07-S06 — the serializer: the ONE place a store entry becomes something a user can see.
 *
 * Masking happens HERE, in the shape, and not in the printer. A printer that masked would be one
 * of several printers — `list`, `list --json`, `test --json`, S07's `--all`, S08's import summary —
 * and the day a sixth is written is the day one of them forgets. Nothing in this module can emit
 * a password: `maskedInstance()` does not carry one, so a caller has nothing to leak.
 *
 * `maskUsername` and `maskPath` are ARC-04-S02's. There were briefly two username maskers — S05
 * wrote a second one that dropped the domain (`c***` where the store's own says `c***@corp.com`) —
 * which is exactly the drift this file exists to prevent, and it is deleted.
 */
import { maskPath, maskUsername } from '../store/paths.js';
import { completeFlags } from '../store/schema.js';
import { PROBE_FIELDS, probeFieldText } from '../servicenow/probes.js';
import { NO_INSTANCE_MESSAGE } from '../no-instance.js';
import { cliSpelling, needCli } from './tty.js';
/**
 * A secret, described rather than shown: `set (len 12)`.
 *
 * The LENGTH is the useful part — "did the client secret arrive whole" is the question a support
 * conversation actually asks — and it is not the secret. `not set` for an absent one, because an
 * empty field and a missing field are different states to a reader debugging an OAuth entry.
 */
export const secretNote = (secret) => (secret === undefined || secret === '' ? 'not set' : `set (len ${secret.length})`);
export function maskedInstance(label, entry) {
    return {
        label,
        url: entry.url,
        environment: entry.environment,
        auth: {
            method: entry.auth.method,
            username: maskUsername(entry.auth.username),
            secret: secretNote(entry.auth.password),
        },
        preset: entry.preset,
        flags: completeFlags(entry.flags),
        prodWriteAck: entry.prodWriteAck,
        lastProbe: entry.lastProbe ?? null,
    };
}
/** `list --json`. The store path is masked too: an absolute path carries the account name. */
export function listJson(storePath, store) {
    return {
        store: maskPath(storePath),
        defaultInstance: store.defaultInstance ?? null,
        instances: Object.entries(store.instances).map(([label, entry]) => maskedInstance(label, entry)),
    };
}
/**
 * ARC-08-C7 — the SAME state as everywhere else, so the same remedy.
 *
 * This was the seventh wording, and it escaped the first scan by being plural: `No instanceS
 * configured`. Being inside `instance list` is not a reason to send the reader somewhere different —
 * `instance add` is the wizard alone, and it would leave them one step into a live mode the toggles
 * do not reflect, in a terminal where `mode live` is just as available.
 */
export const NO_INSTANCES = NO_INSTANCE_MESSAGE;
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
export function probeCell(probe) {
    if (!probe)
        return NEVER_PROBED;
    return PROBE_FIELDS
        .filter(({ key }) => probe[key] !== undefined && probe[key] !== null)
        // ARC-07-W16 — the shared renderer, so this cell and the wizard's Saved line cannot describe one
        // measurement in two vocabularies. ARC-07-C6 made the ORDER and the NAMES shared and left the
        // VALUES to each caller; this finishes it.
        .map(({ label, key }) => probeFieldText(label, probe[key]))
        .join(' · ');
}
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
export function probeColumnHeader(instances) {
    const latest = instances
        .map((i) => i.lastProbe?.at)
        .filter((at) => typeof at === 'string')
        .sort()
        .at(-1);
    return latest ? `LAST PROBE (most recent: ${latest})` : 'LAST PROBE';
}
/** The cell for an instance nothing has probed. Spelled once — the footnote explains this glyph. */
export const NEVER_PROBED = '—';
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
export const neverProbedNote = (instances, cli) => {
    // A BLOCK BODY, because the guard has to run before the ternary and `&&` would have turned a `null`
    // return into the guard's own string — which is the kind of quiet type change an expression body hides.
    needCli(cli, 'neverProbedNote');
    return instances.some((i) => !i.lastProbe)
        ? `${NEVER_PROBED} = never probed. ${cli} instance test <label> probes one; `
            + '--all probes every one.'
        : null;
};
const HEADERS = ['LABEL', 'ENV', 'AUTH', 'PRESET', 'DEFAULT', 'USER'];
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
export function listTable(list, cli = cliSpelling()) {
    if (list.instances.length === 0)
        return NO_INSTANCES(cli);
    const rows = list.instances.map((i) => [
        i.label, i.environment, i.auth.method, i.preset,
        list.defaultInstance === i.label ? '*' : '', i.auth.username,
    ]);
    const probeHeader = probeColumnHeader(list.instances);
    const width = HEADERS.map((h, c) => Math.max(h.length, ...rows.map((r) => r[c]?.length ?? 0)));
    const line = (cells, last) => `${cells.map((cell, c) => cell.padEnd(width[c])).join('  ')}  ${last}`.trimEnd();
    const note = neverProbedNote(list.instances, cli);
    return [line(HEADERS, probeHeader),
        ...rows.map((r, n) => line(r, probeCell(list.instances[n]?.lastProbe ?? null))),
        ...(note ? ['', note] : [])].join('\n');
}
/**
 * `test --json` and `test --all --json` — ONE envelope, whether it holds one instance or five.
 *
 * The story specifies the shape for `--all`; giving the single form a different one would make
 * ARC-06-S08's merge (`probes[label] = JSON.parse(stdout)`) depend on which flag produced the
 * output, and a consumer that has to ask "how many did I request?" before reading a result is a
 * consumer that will get it wrong once.
 */
export function probesJson(storePath, probes) {
    return { store: maskPath(storePath), instances: probes };
}
// ═══ ARC-07-S07 — two stores, and which one wins ═══════════════════════════════════════════
/**
 * The precedence sentence, spelled ONCE.
 *
 * `add --global`, `list --all` and `instance test` all say it, and the one thing a user needs from
 * it is which file the server will actually read. Paths go through `maskPath` — the home directory
 * becomes `~`, and an absolute path carries the account name into every screen share and ticket.
 */
export const precedenceNote = (label, firstPath, globalPath, source = 'project') => {
    // The noun follows the SOURCE, because "the project store" is false when `SNOW_STORE` selected
    // the file — and the whole point of the sentence is to name the file the server reads. The
    // project wording is byte-for-byte the story's.
    const noun = source === 'project' ? 'the project store' : `the store ${source} selects`;
    const uses = source === 'project' ? 'the project store' : `the ${source} store`;
    return `Note: "${label}" exists in both ${noun} (${maskPath(firstPath)}) and the global `
        + `store (${maskPath(globalPath)}). The server uses ${uses} for this checkout; the `
        + 'global entry is ignored here.';
};
/** The footer `list` prints when the OTHER store is not empty. */
/**
 * ARC-07-C31 slice 3 — A DEFAULT IS ALLOWED HERE BECAUSE THERE IS EXACTLY ONE CALLER, NAMED:
 * `cli/instance.ts:1532`. Its other three call sites are tests, which is the same shape
 * `formatStatus` has in the engine.
 */
export const otherStoreFooter = (count, cli = cliSpelling()) => `(+ ${count} instance${count === 1 ? '' : 's'} in the global store — ${cli} instance list --all)`;
export const storeLabelFor = (source) => (source === 'env' ? 'SNOW_STORE' : source === 'global' ? 'global' : 'project');
/**
 * Both stores, side by side, with every row saying where it came from.
 *
 * NEVER MERGED — `01` §7, and the reason is that a merge makes "which file set this value"
 * unanswerable. The rows are concatenated, a duplicate label appears TWICE with different `store`
 * values, and the note says which of the two the server reads.
 */
export function combinedListJson(first, globalStore) {
    // The FIRST store is whatever the resolver selected — the per-checkout one, or the file
    // `SNOW_STORE` names, or the global one when there is nothing else. It used to be computed
    // separately as "the project path", so a run under `SNOW_STORE` listed only the global store
    // and left out the file the server actually reads. Found in review.
    const sameFile = first.path === globalStore.path;
    const rows = [];
    for (const [source, side] of [[first.source, first],
        ...(sameFile ? [] : [['global', globalStore]])]) {
        for (const [label, entry] of Object.entries(side.store?.instances ?? {})) {
            // The default marker belongs to the ROW'S OWN store. Both files name a default, and marking
            // a global row because the project store calls that label its default would claim a
            // relationship between two files that are never read together.
            rows.push({ ...maskedInstance(label, entry), store: source,
                default: side.store?.defaultInstance === label });
        }
    }
    const inBoth = sameFile ? [] : Object.keys(first.store?.instances ?? {})
        .filter((label) => Boolean(globalStore.store?.instances?.[label]));
    return {
        store: maskPath(first.store ? first.path : globalStore.path),
        defaultInstance: first.store?.defaultInstance ?? globalStore.store?.defaultInstance ?? null,
        instances: rows,
        stores: {
            project: first.source === 'project' && first.store ? maskPath(first.path) : null,
            SNOW_STORE: first.source === 'SNOW_STORE' && first.store ? maskPath(first.path) : null,
            global: globalStore.store ? maskPath(globalStore.path) : null,
        },
        notes: inBoth.map((label) => precedenceNote(label, first.path, globalStore.path, first.source)),
    };
}
const ALL_HEADERS = ['LABEL', 'STORE', 'ENV', 'AUTH', 'PRESET', 'DEFAULT', 'USER'];
/** `list --all`: the table with a STORE column, then the precedence note for anything in both. */
/**
 * ARC-07-C31 slice 3 — A DEFAULT IS ALLOWED BECAUSE THERE IS EXACTLY ONE PRODUCT CALLER, NAMED:
 * `cli/instance.ts:1520`. Its other call sites are tests, the same shape the engine's `formatStatus` has.
 */
export function listAllTable(list, cli = cliSpelling()) {
    if (list.instances.length === 0)
        return NO_INSTANCES(cli);
    const rows = list.instances
        .map((i) => [
        i.label, i.store, i.environment, i.auth.method, i.preset,
        i.default ? '*' : '', i.auth.username,
    ]);
    const width = ALL_HEADERS.map((h, c) => Math.max(h.length, ...rows.map((r) => r[c]?.length ?? 0)));
    const line = (cells, last) => `${cells.map((cell, c) => cell.padEnd(width[c])).join('  ')}  ${last}`.trimEnd();
    // ARC-07-C6 — the same header and the same footnote as `list`. This table showed a bare
    // `LAST PROBE` and no explanation of the dash, so the one view that spans two stores was the one
    // that said least about the column both of them share.
    const note = neverProbedNote(list.instances, cli);
    return [
        line(ALL_HEADERS, probeColumnHeader(list.instances)),
        ...rows.map((r, n) => line(r, probeCell(list.instances[n]?.lastProbe ?? null))),
        ...(note ? ['', note] : []),
        ...(list.notes.length > 0 ? ['', ...list.notes] : []),
    ].join('\n');
}
