// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
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
import { currentInstance, FLAG_NAMES } from '../servicenow/context.js';
import { cliSpelling, needCli } from '../cli/tty.js';
export { FLAG_NAMES };
const all = (v) => Object.fromEntries(FLAG_NAMES.map((f) => [f, v]));
/**
 * The preset table of `01` §6.3. Exported because ARC-04-S06 emits it into the contract:
 * one table, so a client and the server cannot hold different ideas of what `full` means.
 */
export const PRESETS = {
    'read-only': all('false'),
    'pdi-developer': {
        WRITE_ENABLED: 'true', CMDB_WRITE_ENABLED: 'true', SCRIPTING_ENABLED: 'true',
        ATF_ENABLED: 'true', NOW_ASSIST_ENABLED: 'false', FLUENT_ENABLED: 'false',
    },
    full: all('true'),
};
/** Six explicit strings, always. `custom` takes the store's flags; absent reads as "false". */
export function expandPreset(preset, custom) {
    if (preset === 'custom') {
        return Object.fromEntries(FLAG_NAMES.map((f) => [f, custom?.[f] === 'true' ? 'true' : 'false']));
    }
    return { ...PRESETS[preset] };
}
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
export function matchPreset(flags) {
    for (const [name, preset] of Object.entries(PRESETS)) {
        if (FLAG_NAMES.every((f) => flags[f] === preset[f]))
            return name;
    }
    return 'custom';
}
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
export const DEPENDENCIES = Object.freeze({
    WRITE_ENABLED: [],
    // Scripting and CMDB writes ARE writes; declaring either without WRITE is a contradiction.
    CMDB_WRITE_ENABLED: ['WRITE_ENABLED'],
    SCRIPTING_ENABLED: ['WRITE_ENABLED'],
    ATF_ENABLED: [],
    NOW_ASSIST_ENABLED: [],
    FLUENT_ENABLED: [],
});
/**
 * What `flag` needs turned on before it means anything.
 *
 * No `?? []` fallback: the table is typed `Record<FlagName, …>` and a test asserts its keys ARE
 * `FLAG_NAMES`, so a missing entry cannot happen — and a fallback that cannot run is a branch the
 * coverage gate correctly refuses to accept as tested.
 */
export const requiresOf = (flag) => DEPENDENCIES[flag];
/** What would become a contradiction if `flag` were turned off. In `FLAG_NAMES` order. */
export const dependentsOf = (flag) => FLAG_NAMES.filter((f) => requiresOf(f).includes(flag));
export function applyDependencyRule(flags, label = 'unknown') {
    const effective = { ...flags };
    const warnings = [];
    for (const dependent of FLAG_NAMES) {
        const unmet = requiresOf(dependent).filter((needed) => flags[needed] !== 'true');
        if (flags[dependent] === 'true' && unmet.length > 0) {
            effective[dependent] = 'false';
            warnings.push(`FLAG_DEPENDENCY_VIOLATION: ${dependent}=true requires ${unmet.join(' and ')}=true `
                + `on instance "${label}" — treated as false`);
        }
    }
    return { effective, warnings };
}
/** A preset whose expansion disagrees with the stored flags. The expansion wins. */
export function checkPresetMismatch(preset, stored, label = 'unknown') {
    if (preset === 'custom')
        return [];
    const expanded = PRESETS[preset];
    const differing = FLAG_NAMES.filter((f) => f in stored && stored[f] !== expanded[f]);
    return differing.length === 0 ? [] : [
        `PRESET_FLAGS_MISMATCH: instance "${label}" declares preset ${preset} but its flags differ `
            + `(${differing.join(', ')}) — the preset's values are used`,
    ];
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
export function checkProdPosture(entry, cli) {
    needCli(cli, 'checkProdPosture');
    if (entry.environment !== 'prod')
        return { ok: true };
    const raised = FLAG_NAMES.filter((f) => entry.effectiveFlags[f] === 'true');
    if (raised.length === 0 || entry.prodWriteAck === true)
        return { ok: true };
    return {
        ok: false,
        code: 'PROD_WRITE_NOT_ACKNOWLEDGED',
        message: `instance "${entry.label}": environment=prod with preset ${entry.preset} but prodWriteAck `
            + `is not true — not loaded. Raise it deliberately with: `
            + `${cli} instance set-preset ${entry.label} ${entry.preset} --ack-prod `
            + `(code PROD_WRITE_NOT_ACKNOWLEDGED)`,
    };
}
/**
 * The one place a gate is decided. `mutates` matters only for `fluent`, whose read
 * operations are harmless and whose writes are writes.
 *
 * Ordering note: for the composite gates the message names WRITE first when WRITE is what
 * is missing — the same order the old `requireCmdbWrite` produced, so an existing client
 * parsing these codes sees no change.
 */
export function evaluateGate(gate, mutates, flags) {
    const need = (f) => flags[f] === 'true';
    switch (gate) {
        case 'none':
            return { ok: true };
        case 'write':
            return need('WRITE_ENABLED') ? { ok: true } : { ok: false, code: 'WRITE_NOT_ENABLED', missing: ['WRITE_ENABLED'] };
        case 'cmdb_write':
            if (!need('WRITE_ENABLED'))
                return { ok: false, code: 'WRITE_NOT_ENABLED', missing: ['WRITE_ENABLED'] };
            return need('CMDB_WRITE_ENABLED') ? { ok: true }
                : { ok: false, code: 'CMDB_WRITE_NOT_ENABLED', missing: ['CMDB_WRITE_ENABLED'] };
        case 'scripting':
            if (!need('WRITE_ENABLED'))
                return { ok: false, code: 'WRITE_NOT_ENABLED', missing: ['WRITE_ENABLED'] };
            return need('SCRIPTING_ENABLED') ? { ok: true }
                : { ok: false, code: 'SCRIPTING_NOT_ENABLED', missing: ['SCRIPTING_ENABLED'] };
        case 'atf':
            return need('ATF_ENABLED') ? { ok: true } : { ok: false, code: 'ATF_NOT_ENABLED', missing: ['ATF_ENABLED'] };
        case 'now_assist':
            return need('NOW_ASSIST_ENABLED') ? { ok: true }
                : { ok: false, code: 'NOW_ASSIST_NOT_ENABLED', missing: ['NOW_ASSIST_ENABLED'] };
        case 'fluent':
            if (!need('FLUENT_ENABLED'))
                return { ok: false, code: 'FLUENT_NOT_ENABLED', missing: ['FLUENT_ENABLED'] };
            if (mutates && !need('WRITE_ENABLED'))
                return { ok: false, code: 'WRITE_NOT_ENABLED', missing: ['WRITE_ENABLED'] };
            return { ok: true };
        /* c8 ignore next 2 -- exhaustive: GateName has no other member; kept so a new gate fails loudly */
        default:
            return { ok: false, code: 'UNKNOWN_GATE', missing: [] };
    }
}
const HUMAN = {
    WRITE_NOT_ENABLED: 'Write operations are disabled',
    CMDB_WRITE_NOT_ENABLED: 'CMDB write operations are disabled',
    SCRIPTING_NOT_ENABLED: 'Scripting operations are disabled',
    ATF_NOT_ENABLED: 'ATF test execution is disabled',
    NOW_ASSIST_NOT_ENABLED: 'Now Assist / AI features are disabled',
    FLUENT_NOT_ENABLED: 'Fluent / now-sdk operations are disabled',
};
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
export function remedyPreset(missing = []) {
    const order = ['read-only', 'pdi-developer', 'full'];
    return order.find((name) => missing.every((f) => PRESETS[name][f] === 'true')) ?? 'full';
}
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
export function gateError(result, cli = cliSpelling()) {
    const rt = currentInstance();
    const code = result.code ?? 'WRITE_NOT_ENABLED';
    const what = HUMAN[code] ?? 'Operation is disabled';
    const remedy = rt.environment === 'prod'
        ? `Instance "${rt.label}" is tagged prod and capped at read-only. `
            + `Raising it requires: ${cli} instance set-preset ${rt.label} <preset> --ack-prod`
        : `Run: ${cli} instance set-preset ${rt.label} ${remedyPreset(result.missing)}`;
    return new ServiceNowError(`${what} for instance "${rt.label}" (preset ${rt.preset}). ${remedy}`, code);
}
function gate(name, mutates = false) {
    const rt = currentInstance();
    const result = evaluateGate(name, mutates, rt.effectiveFlags);
    if (!result.ok)
        throw gateError(result);
}
export function requireWrite() { gate('write'); }
export function requireCmdbWrite() { gate('cmdb_write'); }
export function requireScripting() { gate('scripting'); }
export function requireAtf() { gate('atf'); }
export function requireNowAssist() { gate('now_assist'); }
export function requireFluent() { gate('fluent'); }
const enabled = (name, mutates = false) => {
    const rt = currentInstance();
    return evaluateGate(name, mutates, rt.effectiveFlags).ok;
};
export function isWriteEnabled() { return enabled('write'); }
export function isCmdbWriteEnabled() { return enabled('cmdb_write'); }
export function isScriptingEnabled() { return enabled('scripting'); }
export function isAtfEnabled() { return enabled('atf'); }
export function isNowAssistEnabled() { return enabled('now_assist'); }
export function isFluentEnabled() { return enabled('fluent'); }
