// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-08-S05 — the authoritative `Mode:` line: derived, never remembered.
//
// The rule file's promise is that this line is the mode — "never infer mode from any other file"
// — and a promise like that is only as good as the number of places that can produce it. So the
// derivation is a PURE FUNCTION of four facts, the sentences live in `text.mjs` with every other
// Mode line the product prints, and this module renders through `modeLine()` rather than holding
// a second sentence table.
//
// What it never reads is `~/.claude.json`. That file is where the OLD engine looked for the mode
// (`00` P-05/P-21), and it is wrong three ways: it belongs to Claude Code, it describes the
// registration rather than the configuration, and a stale entry there outlived the install it
// described. The toggle file and the store are the two things that decide, and both are ours.
import { flagNames } from '../../../../packages/contract/lib/contract.mjs';
import { modeLine as renderModeLine, MODE_VARIANTS } from '../text.mjs';
import { projectEntryCarries } from '../settings-local.mjs';

/** `2026-09-10 41 ok` / `2026-09-10 2 FAIL` — what the banner shows about the last run. */
export function doctorStamp({ summary = {}, at = new Date() } = {}) {
  const day = (at instanceof Date ? at : new Date(at)).toISOString().slice(0, 10);
  return summary.fail > 0
    ? `doctor ${day} ${summary.fail} FAIL`
    : `doctor ${day} ${summary.ok ?? 0} ok`;
}

/**
 * Which mode this checkout is in, and why — the whole decision, in one place.
 *
 * `live` is the conjunction of two facts and nothing else: the server is REACHABLE — the project
 * toggle is on, or a local/user registration carries it instead — and the store has an instance
 * that LOADED. Everything else is design-only with a
 * qualifier that names which half is missing, because "design-only" alone sends a user looking for
 * a problem that may be a deliberate choice.
 *
 * @param {object} facts
 * @param {{enabled?: boolean}} facts.toggles     `.claude/settings.local.json`, already read
 * @param {Array} facts.instances                 `server.instances[]` from the SV checks
 * @param {boolean} facts.bootstrapped            a `bootstrap-state.json` exists
 */
export function deriveMode({ toggles = {}, instances = [], bootstrapped = true,
  registration = 'project', probed = true,
  // ARC-07-W17 — THE SPELLING IS A PARAMETER, because this function has no ctx. I wrote
  // `spell` here first on the strength of every other file in this directory having one, which
  // is the third time in this row I have referenced a ctx that is not in scope — and it would have
  // thrown only when the branch ran, not at import.
  //
  // REQUIRED, no process default: the doctor renders for the ctx it was given, `gen-doctor-docs` for a
  // committed page that must be identical on every runner, and the hook for the person in front of it.
  // A process default satisfied the hook and broke the other two across twelve Windows cells.
  spell } = {}) {
  const loaded = instances.filter((i) => i.status === 'loaded');
  const configured = instances.length > 0;
  // ARC-08-C16 — the toggle file decides only when the PROJECT entry is the carrier.
  //
  // `.claude/settings.local.json` governs `.mcp.json` and nothing else. A `local` or `user`
  // registration carries the server in `~/.claude.json`, and on that path the project toggle is
  // deliberately OFF — otherwise both entries load. Reading `toggles.enabled` alone therefore
  // called a live, connected checkout design-only, in a report whose own E-11 said `mode live`
  // and whose E-27 said `Connected · scope local`.
  //
  // This does NOT reach into `~/.claude.json` — the thing this module promises never to read.
  // The registration is OUR record of what we did, in `bootstrap-state.json`, which is the same
  // file the mode itself comes from; the promise is about Claude Code's file, not about knowing
  // which entry we created.
  const serverEnabled = projectEntryCarries(registration) ? toggles.enabled !== false : true;

  if (!bootstrapped) {
    return { mode: 'unknown', variant: 'notBootstrapped',
      qualifier: MODE_VARIANTS.notBootstrapped(spell), instance: null, loaded, serverEnabled };
  }
  if (serverEnabled && loaded.length > 0) {
    const first = loaded[0];
    return { mode: 'live', variant: 'live', qualifier: null, loaded, serverEnabled,
      instance: { label: first.label, environment: first.environment, preset: first.preset } };
  }
  // ARC-08-C17 — A QUICK RUN HAS NOT PROBED, AND ABSENCE IS NOT A VERDICT.
  //
  // `loaded` is the SERVER's answer, and a quick run never spawns it, so `instances` arrived
  // empty and this function concluded design-only about a checkout with a configured store and a
  // connected server. That line is what the SessionStart hook prints, and the rule file forbids
  // every MCP call in design-only — so a user with a working instance could not get one tool
  // called. The hook was not describing the machine, it was disabling it.
  //
  // `probed: false` says the question was not ASKED. The store's own entries then decide, which
  // is what the quick run can cheaply know: a configured instance and a reachable server is live.
  // It is not a claim that the server loaded the entry — SV-02/SV-03 own that, on a full run —
  // and the variant says so, so nothing here asserts a probe that did not happen.
  if (!probed && serverEnabled && configured) {
    const first = instances[0];
    return { mode: 'live', variant: 'liveUnprobed', qualifier: null, loaded, serverEnabled,
      instance: { label: first.label, environment: first.environment, preset: first.preset } };
  }
  if (!serverEnabled && configured) {
    return { mode: 'design-only', variant: 'serverDisabled', loaded, serverEnabled,
      qualifier: MODE_VARIANTS.serverDisabled(instances[0].label, spell), instance: null };
  }
  if (serverEnabled && configured) {
    // Entries exist and none of them loaded — the store is there and something in it is wrong,
    // which SV-02/SV-03 have already said in detail. The Mode line points at them rather than
    // repeating them.
    return { mode: 'design-only', variant: 'noInstanceLoaded', loaded, serverEnabled,
      qualifier: MODE_VARIANTS.noInstanceLoaded(spell), instance: null };
  }
  if (serverEnabled) {
    return { mode: 'design-only', variant: 'noInstanceLoaded', loaded, serverEnabled,
      qualifier: MODE_VARIANTS.noInstanceLoaded(spell), instance: null };
  }
  return { mode: 'design-only', variant: 'unconfigured', loaded, serverEnabled,
    qualifier: MODE_VARIANTS.unconfigured(spell), instance: null };
}

/**
 * The banner form: the mode, the instance, and — in live mode — when the doctor last looked.
 *
 * The stamp rides on the LIVE line only. A design-only line already ends in an instruction
 * ("run ./snowarch instance add …"), and a date bolted onto the end of a sentence that tells
 * somebody what to type reads as part of the command. The story's criteria say the same thing
 * from the other side: criterion 1 quotes the live line WITH the stamp, criterion 2 quotes the
 * design-only line without it and calls it exact.
 */
export function modeLine(derived, { summary, at } = {}) {
  const stamped = derived.mode === 'live' && summary;
  return renderModeLine({
    mode: derived.mode,
    instance: derived.instance,
    qualifier: derived.qualifier,
    ...(stamped ? { stamp: doctorStamp({ summary, at }) } : {}),
  });
}

/**
 * `WRITE=on CMDB_WRITE=off …` — the labels from the contract, never a list typed here.
 *
 * ARC-08-C21 — `null` FLAGS PRODUCE NO SUMMARY, and that is the whole defect.
 *
 * The default was `flags = {}`, so `flags[name] === 'true'` was false for every name and a caller
 * with nothing to report rendered six `off`s. Since ARC-09-C8 took the server section out of the
 * quick subset, `modeLineDetailed`'s caller passed exactly that on every quick run — so a live user
 * read `WRITE=off CMDB_WRITE=off SCRIPTING=off ATF=off NOW_ASSIST=off FLUENT=off` about an instance
 * whose store says five of the six are on, in the line the SessionStart banner, `./snowarch mode`
 * and the panel all quote. **A flag nobody read printed as a flag that is off** — absence rendered
 * as a finding, which is this programme's own defect class in the most-quoted sentence it ships.
 *
 * `{}` is still a summary of six `off`s, because an empty flag set IS six flags that are off. It is
 * `null`/`undefined` — "I did not read them" — that has no summary to give.
 */
export function flagSummary(contract, flags) {
  // NO `= {}` DEFAULT, and that is the fix rather than a tidy-up: the default caught `undefined`
  // before the guard could see it, so "called with nothing" still rendered six `off`s while
  // "called with null" did not — two spellings of the same absence, one of them still lying. A
  // caller that passes nothing has read nothing.
  if (!contract || flags === null || flags === undefined) return null;
  return flagNames(contract)
    .map((name) => `${name.replace(/_ENABLED$/, '')}=${flags[name] === 'true' ? 'on' : 'off'}`)
    .join(' ');
}

/**
 * What the line says in live mode when there is no flag summary to give.
 *
 * NOT an omission. A live panel that silently dropped the summary would be a shorter line nobody
 * notices — absence hidden one step later, which is the same defect wearing a quieter coat.
 * Design-only omits it because there is no instance for the flags to be about.
 *
 * AND IT NAMES THE CAUSE IT OBSERVED, which cost me a rewrite: the first version said
 * `flags unknown (store not read)` unconditionally, and the first test to hit it had a readable
 * store and no CONTRACT — so the sentence stated a cause that was not the one. `flagSummary`
 * returns null for two different absences and the line must not conflate them; *never state a
 * cause you did not check* is the rule this repository applies to remedies, and a parenthesis in
 * the most-quoted line of the product is not exempt from it.
 */
export const flagsUnknown = ({ contract = null } = {}) => (contract
  ? 'flags unknown (store not read)'
  : 'flags unknown (contract unavailable)');

/**
 * The skill form: everything `/snowarch status` prints on one line.
 *
 * The tool count says where it came from. `398 tools` is what the RUNNING server advertised;
 * `398 tools (contract)` is what the pinned contract declares, printed when SV-05 did not run —
 * on `--quick`, or with no dependencies. A count with no provenance is the kind of number a reader
 * trusts and should not.
 */
export function modeLineDetailed(derived, { contract = null, instances = [], toolCount = null,
  flags = null } = {}) {
  if (derived.mode !== 'live' || !derived.instance) return modeLine(derived);
  const parts = [`Mode: live — ${derived.instance.label} (${derived.instance.environment})`,
    `preset ${derived.instance.preset}`];
  // `flags ?? {}` is gone: it turned "not read" into "all off" at the call site, which is where the
  // defect actually lived — `flagSummary` was only obeying it.
  const summary = flagSummary(contract, flags);
  parts.push(summary ?? flagsUnknown({ contract }));
  if (toolCount?.count != null) {
    parts.push(`${toolCount.count} tools${toolCount.source === 'contract' ? ' (contract)' : ''}`);
  }
  const others = instances.filter((i) => i.label !== derived.instance.label);
  const alsoLoaded = others.filter((i) => i.status === 'loaded');
  if (alsoLoaded.length > 0) {
    parts.push(`+${alsoLoaded.length} instance (${alsoLoaded.map((i) => i.label).join(', ')})`);
  }
  for (const other of others.filter((i) => i.status !== 'loaded')) {
    parts.push(`${other.label}: not loaded${other.reason ? ` (${other.reason})` : ''}`);
  }
  return parts.join(' · ');
}
