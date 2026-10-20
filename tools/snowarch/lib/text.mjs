// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-06-S09 — the sentences the installation ends with, in one place.
//
// Two of them are promises. The `Mode:` line is quoted verbatim by the SessionStart banner, by
// `/snowarch status` and by `snowarch mode`, so four programs must agree on its shape or a user
// sees three different answers to "what am I in". And the dialog count is a promise made before
// first contact: say one and show two, and the tool has lied in the first thirty seconds.
//
// So both live here, `text.json` is generated from this file, and the Node-free launchers read that
// rather than repeating the strings.

import { renderSummaryLine } from './doctor/report-text.mjs';
import { POSIX, isWindowsShell, needSpell, spellings } from './launcher-spelling.mjs';

/**
 * How many Claude Code dialogs a first `claude` will show.
 *
 * ONE, from the owner's sitting on 2.1.258 (2026-09-07), recorded in
 * `docs/plans/03-RISKS-AND-UNKNOWNS.md` §F as the S-01 dialog-count row: `live` = 1 (workspace trust
 * only), `design` = 1, and `control` — no toggle written — = 2. A test reads that row and fails if
 * the two ever disagree, because the number is the promise and the row is where it was measured.
 *
 * The row also notes what is NOT yet measured: the count is confirmed on 2.1.258, and the engine's
 * floor is 2.1.214, whose row is still pending. Two is therefore budgeted rather than promised away
 * — `nextBlock` prints one sentence per dialog and adds the second the moment this becomes 2.
 */
export const EXPECTED_DIALOGS = 1;

/**
 * ARC-09-C157 — the folder Claude Code has to start in, as a SLOT in the shared text. The Node bootstrap fills it with
 * the root it ran in; the Node-free launchers print the generated text with their own root in its place; the install
 * page shows SAMPLE_ROOT, so a reader sees what the line looks like rather than a placeholder.
 */
export const ROOT_SLOT = '{root}';
export const SAMPLE_ROOT = '/Users/you/snowarch';

/**
 * The spelling itself lives in `launcher-spelling.mjs` — ARC-07-C31, and the move is the row.
 *
 * RE-EXPORTED, not re-implemented, because some seventy call sites import `spellings` from here and
 * the definition's address is not what any of them are about. What changed is which file the guard
 * exempts: it exempted THIS one, whose comment named the definition while its behaviour skipped five
 * hundred lines of sentences — and those sentences are precisely where a hand-spelled launcher gets
 * written. Now the exempt file is the definition and nothing else, and this file is read like the
 * rest of the tree.
 */
// IMPORTED ABOVE AND RE-EXPORTED HERE, which is two lines where `export { … } from` would be one —
// because that form re-exports WITHOUT binding the name in this module, and three renderers in this
// file call `spellings` themselves. The one-line version was 55 red cases in the engine suite alone,
// all of them `ReferenceError: spellings is not defined`.
export { isWindowsShell, needSpell, spellings };

/**
 * The four things a design-only or unknown checkout can BE, as sentences.
 *
 * They live here, with the Mode line itself, because they are the same sentence in four moods:
 * a variant table inside the doctor would be a second place where "what mode is this?" is
 * answered in words, and the rule file's promise — that the Mode line is authoritative — is only
 * true while there is one of it. ARC-08-S05's derivation picks a key; this renders it.
 */
/**
 * ARC-05-S06 criterion 3 — ONE remedy for "there is no instance yet", wherever it is offered.
 *
 * Sitting A found two, for the same state, in the same run: the doctor's Mode line said
 * `./snowarch instance add`, and the bootstrap's Next block said `./snowarch mode live`. Both work,
 * which is what makes two of them worse than one wrong one — a reader has to decide which is THE
 * path, and the criterion exists so nobody has to.
 *
 * `mode live` is the one, because it is the documented path and it runs the wizard as B06 with the
 * rest of the switch around it; `instance add` is the wizard alone, and a user who runs it is one
 * step into a live mode the toggles do not yet reflect.
 */
export const ADD_INSTANCE = (cli = POSIX.cli) =>
  `${cli} mode live, or /snowarch setup-instance inside Claude`;

/**
 * ARC-07-W17 — these name the READER'S shell, not both shells.
 *
 * `notBootstrapped` said `run ./bootstrap.sh (Windows: bootstrap.cmd)` — two spellings by hand, and the
 * Windows one BARE, which is the one PowerShell refuses: it does not resolve a command from the current
 * directory and nothing here is on PATH. So the message that tells a user their checkout is not
 * bootstrapped gave a Windows reader a command their shell rejects, with the POSIX one beside it as a
 * distraction. One spelling, for the shell doing the reading.
 *
 * FUNCTIONS, and the reason is the THREE CONSUMERS, not the import cycle. It was both until C31 moved
 * the definition to `launcher-spelling.mjs`: a load-time `spellings()` here used to throw
 * `Cannot access 'isWindowsShell' before initialization`, because `text.mjs` sits in the
 * `panel -> text -> report-text -> panel` cycle and the `const` was in this file. A leaf module is
 * initialised before any cycle is entered, so that hazard is gone — and these are still functions,
 * because a value would render one shell for a doctor, a committed page and a live terminal alike.
 */
/**
 * The spelling a variant was given, or a refusal — ARC-07-W17.
 *
 * NO PROCESS DEFAULT, and this is the second time this row has had to learn it. Reading `spellings()`
 * here made every variant render for the machine it ran on, and THREE consumers need three different
 * answers: the doctor renders for the ctx it was given, `gen-doctor-docs.mjs` writes a COMMITTED page
 * that must be identical on every runner, and the SessionStart hook renders for the person in front of
 * it. A process default satisfied the hook and broke the other two — twelve Windows cells, because a
 * generated page rendered `.\snowarch.cmd` on Windows and `gen:check` then failed `lint`, `contract`,
 * the release rehearsal and E-21 in the doctor itself.
 *
 * So the spelling is required, and a miss THROWS rather than printing `undefined` — the same rule
 * `summaryLine` and `renderText` carry, for the same reason: a plausible-looking wrong line passes
 * review and a green test.
 */

/**
 * EVERY VARIANT TAKES ONE, including the one that does not use it.
 *
 * `noInstanceLoaded` names a slash command and no launcher, so it has nothing to spell — and it demands
 * the argument anyway, because a UNIFORM call shape is what stops the defect this row already shipped
 * once: a consumer that called one variant as a value printed the function's source as a Mode line, and
 * the only reason it was not caught is that some variants took an argument and others did not.
 */
export const MODE_VARIANTS = Object.freeze({
  unconfigured: (spell) =>
    `no ServiceNow instance configured; run ${ADD_INSTANCE(needSpell(spell, 'MODE_VARIANTS.unconfigured').cli)}`,
  serverDisabled: (label, spell) => `server disabled in .claude/settings.local.json although instance `
    + `"${label}" is configured; run ${needSpell(spell, 'MODE_VARIANTS.serverDisabled').cli} mode live`,
  noInstanceLoaded: (spell) => {
    needSpell(spell, 'MODE_VARIANTS.noInstanceLoaded');
    return 'server enabled but no instance is loaded (see SV-02/SV-03); run /snowarch setup-instance';
  },
  notBootstrapped: (spell) => 'this checkout has not been bootstrapped; run '
    + `${needSpell(spell, 'MODE_VARIANTS.notBootstrapped').bootstrap}`,
});

/**
 * THE Mode line. One definition, five consumers.
 *
 * `instance` carries only a label, an environment and a preset — the three things that are not
 * secrets. A URL or a username here would end up in a banner, a status reply and a log at once.
 *
 * `qualifier` and `stamp` are ARC-08-S05's: the doctor knows WHY a checkout is design-only and
 * when it last checked, and the bootstrap does not. Both are optional, so the launcher's
 * `Mode: design-only` — which a Node-free shell prints from `text.json` — is unchanged.
 */
export function modeLine({ mode, instance = null, qualifier = null, stamp = null } = {}) {
  const tail = stamp ? ` — ${stamp}` : '';
  if (mode === 'unknown') return `Mode: unknown${qualifier ? ` — ${qualifier}` : ''}${tail}`;
  if (mode !== 'live') return `Mode: design-only${qualifier ? ` — ${qualifier}` : ''}${tail}`;
  if (!instance) return `Mode: live${qualifier ? ` — ${qualifier}` : ''}${tail}`;
  return `Mode: live — instance=${instance.label} (${instance.environment}) `
    + `preset=${instance.preset}${tail}`;
}

/**
 * The banner's four nudges — one definition each, for the hook and for `/snowarch status`.
 *
 * They are the only lines the SessionStart hook prints besides the Mode line, and two programs
 * print them: the hook at the top of a session, and the status skill when somebody asks. A second
 * wording in the second place is how a user comes to believe the two describe different things.
 *
 * Each is ONE line. The banner has a budget measured in milliseconds and a reader who has not
 * asked for any of this yet; a nudge that wraps is a nudge that gets skipped.
 */
/**
 * ARC-07-C31 — EVERY MEMBER IS A FUNCTION TAKING THE SPELLING, including the two that have no launcher
 * to spell.
 *
 * THIS FILE WAS EXEMPT FROM THE SPELLING GUARD AND I READ THAT AS THE FILE BEING SETTLED. It is exempt
 * for what it DEFINES — `spellings` on line 45 and `ADD_INSTANCE`'s POSIX default — not for what it
 * says, and it said six messages with the launcher spelled POSIX by hand. A Windows reader was shown a
 * spelling their shell refuses in all six, and the guard structurally could not see them, because
 * reading this file is exactly what the exemption prevents.
 *
 * TWO CONSUMERS, TWO RENDERINGS, which is why the spelling is an argument rather than a lazy call: the
 * SessionStart hook and `/snowarch status` render for the person in front of them, and `exportable()`
 * below feeds `text.json` — a GENERATED, COMMITTED file that must be byte-identical on every runner or
 * `gen:check` fails on one of them. A lazy `spellings()` here would satisfy the first and break the
 * second, which is precisely the mistake ARC-07-W17 made with `MODE_VARIANTS` and paid for across
 * twelve Windows cells.
 *
 * `firstRun` and `staleSuffix`… — the ones with nothing to spell take the argument anyway. A UNIFORM
 * CALL SHAPE is what stops the defect this programme has already shipped once: a consumer called a
 * variant as a VALUE and printed the function's source as a Mode line, and the only reason it was not
 * caught sooner is that some members took an argument and others did not.
 */
export const BANNER = Object.freeze({
  firstRun: (spell) => {
    needSpell(spell, 'BANNER.firstRun');
    return 'No ServiceNow instance configured — /snowarch setup-instance adds one '
      + '(design-only works without it).';
  },
  upgrade: (tag, spell) =>
    `A newer release is available (${tag}) — run ${needSpell(spell, 'BANNER.upgrade').cli} upgrade.`,
  staleRegistration: (spell) => 'Stale MCP registrations from the old setup found in ~/.claude.json '
    + `— run ${needSpell(spell, 'BANNER.staleRegistration').cli} doctor --section legacy for the removal `
    + 'commands.',
  doctorFail: (n, spell) =>
    `Doctor: ${n} FAIL — run ${needSpell(spell, 'BANNER.doctorFail').cli} doctor for remedies.`,
  /** The cache could not be refreshed in time: the line is still true, just old. */
  staleSuffix: (spell) => ` (cache stale — run ${needSpell(spell, 'BANNER.staleSuffix').cli} doctor)`,
  timedOut: (spell) =>
    `Mode: unknown — doctor timed out; run ${needSpell(spell, 'BANNER.timedOut').cli} doctor`,
  /** Anything unforeseen. The CLASS, never the message: a message can carry a path or a value. */
  failed: (errorClass, spell) => `Mode: unknown — session banner failed (${errorClass}); run `
    + `${needSpell(spell, 'BANNER.failed').cli} doctor`,
  /**
   * What `/snowarch status` says when the doctor cannot run at all (ARC-08-S09).
   *
   * The mode is READ from `.local/bootstrap-state.json` rather than derived, and the sentence says
   * so — "from bootstrap state" is the difference between a fact the doctor established a moment
   * ago and one the bootstrap recorded at install time, and a reader deciding whether to trust it
   * needs to know which they have.
   *
   * ARC-08-C18 — THE CAUSE IS AN ARGUMENT, and deliberately has no default. It used to end
   * "until Node 20+ is installed" unconditionally, which is the one cause `./snowarch status`
   * can never be the one to report: a machine without Node cannot run the command that would
   * say so. SKILL.md's own rule for this line is *"never state a cause you did not check"*, and a
   * default here would be a cause nobody checked. A caller that forgets renders the word
   * `undefined`, which is visibly broken — the right failure for a sentence whose whole job is to
   * be trusted.
   */
  fromState: (mode, at, cause) => `Mode: ${mode} — from bootstrap state (${at}); `
    + `doctor unavailable ${cause}`,
});

/**
 * THE registration line. One definition, three consumers: `snowarch mode`, the doctor's report
 * (ARC-08) and the troubleshooting page's wording.
 *
 * The parenthesis is the whole message. "local" and "user" both mean `~/.claude.json`, and the
 * difference between them — this checkout, or every project on the machine — is the thing a user
 * has to understand before they choose one; the kind's name alone does not carry it.
 */
export const REGISTRATION_KINDS = Object.freeze({
  project: 'project (.mcp.json)',
  local: 'local (~/.claude.json, this checkout only)',
  user: 'user (~/.claude.json, every project — not recommended)',
});

export function registrationLine(kind) {
  return `registration: ${REGISTRATION_KINDS[kind] ?? `${kind} (unknown kind)`}`;
}

/**
 * What to do after a registration or a mode switch — the one thing a user must not have to guess.
 *
 * A running Claude session has already read its MCP configuration; nothing this command does
 * reaches it. Saying so here is the difference between "it did not work" and "it works after a
 * reconnect", which is a support conversation either way if the sentence is missing.
 */
export const restartSentence = (serverKey, mode = 'live') => (mode === 'live'
  ? `Restart claude (or /mcp → ${serverKey} → reconnect) to load the server.`
  // ARC-06 (Sitting A) — after `mode design` the old sentence pointed the wrong way: it told the
  // user to reconnect in order to LOAD a server the switch had just turned off. Seen on two runs.
  : `Restart claude to unload the server — ${serverKey} will not be listed in /mcp afterwards.`);

/**
 * `mode design` keeps the store. This says so, names the label, and gives the two commands that
 * undo it in either direction — because "design-only" reads like "the instance is gone" to
 * everyone who has not read the code.
 */
export function instanceKeptNote({ label, platform, env } = {}) {
  const s = spellings({ platform, env });
  if (!label) return `note: no instance is configured; ${s.cli} mode live adds one`;
  return `note: instance "${label}" kept in .local/instances.json; ${s.cli} mode live re-enables `
    + `it; ${s.cli} instance remove ${label} deletes it`;
}

/**
 * `DOCTOR: 41 ok, 0 warn, 0 fail`, or the honest absence when Node cannot run one.
 *
 * The line itself is the DOCTOR's renderer (ARC-08-S05): the bootstrap's summary and the doctor's
 * report describe the same run, and they drifted the moment the doctor learned to say
 * `(2 fixable — …)`. What stays here is the sentence for a machine with no Node — which the
 * doctor, by definition, cannot print.
 */
/**
 * ARC-08-C37 — `checks` rides along on the counts object, so `summaryBlock` gains no parameter.
 *
 * B09 spreads whatever `doctorCounts` returned into `summaryBlock`, which spreads it again into
 * here, so the ids reach the renderer by the route the counts already take. When the doctor could
 * not be spawned, `doctorCounts` falls back to tallying `state.steps` and there is no `checks` key
 * at all — which is the honest case the default covers.
 */
export function doctorLine({ ok = 0, warn = 0, fail = 0, skip = 0, fixable = 0, notInQuick = 0,
  nodeUsable = true, checks = null, source = null, platform, env } = {}) {
  if (!nodeUsable) return 'DOCTOR: unavailable until Node 20+ is installed (design-only is complete)';
  // ARC-07-W15 — THE QUICK LINE ONLY WHEN THE DOCTOR ACTUALLY RAN, and `source` is how that is known
  // rather than guessed. `doctorCounts` returns `source: 'doctor'` when it spawned one and
  // `'bootstrap'` when it could not and tallied `state.steps` instead. That fallback is not a health
  // check at all — it counts the install's own steps — so calling it "Health check (quick)" would put
  // a name on it that it cannot earn, and there is no subset of checks it left out to point at.
  //
  // `notInQuick` is named in the parameter list because this function REBUILDS the summary object
  // from five fields rather than passing `counts` through: a new field that is not named here is
  // silently dropped, which is how the number would have arrived as 0 with every unit test green.
  const quick = source === 'doctor';
  return renderSummaryLine({ ok, warn, fail, skip, fixable, notInQuick }, checks,
    { quick, cli: spellings({ platform, env }).cli });
}

/**
 * ARC-07-W12 — the one sentence `mode design` prints about itself.
 *
 * `mode --help` has described the design switch as *"switch back to design-only; the instance store
 * is kept"* since it was written, and the second half is the half a reader needs: what somebody
 * hesitates over is whether going back throws the instance away. The live ending now says the same
 * thing, and it QUOTES this rather than paraphrasing it — a second sentence about whether a store
 * survives is how one of the two comes to be wrong.
 */
export const MODE_DESIGN_NOTE = 'switch back to design-only; the instance store is kept';

/**
 * WHAT A LIVE CHECKOUT CAN STILL CHANGE — ARC-07-W12.
 *
 * THE ASYMMETRY THIS CLOSES, MEASURED RATHER THAN ASSERTED. The design-only ending ends with a
 * command that CHANGES the one thing that reader has chosen: `Add a live instance later: run
 * ./snowarch mode live`. The live ending ended with two ways to VERIFY — `/mcp should show …` and
 * `/snowarch status quotes the Mode line above` — and named nothing that could be changed. So the
 * reader who chose nothing was told how to change it, and the reader who had just chosen an
 * environment, an auth method, a preset, six permission flags and a docs corpus mode was told how to
 * confirm that the thing they could no longer change was working.
 *
 * EACH ROW NAMES THE SUBJECT, NOT THE COMMAND, so a reader scanning for a word finds the command on
 * the same line — and the label is the one just saved rather than a placeholder, which is
 * ARC-07-W11's rule one row later: a command carrying the answers beats a command with holes in it.
 * `<label>` is the honest default for a caller that has no instance, spelled rather than invented.
 *
 * The launcher comes from `spellings()` — ARC-07-W7's rule, applied here at the start rather than
 * retrofitted, which is the whole point of having the rule.
 */
export function changeLaterBlock({ label, platform, env } = {}) {
  const s = spellings({ platform, env });
  const name = label ?? '<label>';
  const rows = [
    ['preset', `${s.cli} instance set-preset ${name} <preset>`],
    ['flags', `${s.cli} instance set-flags ${name} WRITE=on CMDB_WRITE=off`],
    ['credentials', `${s.cli} instance set-credentials ${name}`],
    ['docs', `${s.cli} docs sync --mode full`, 'or --mode sparse, for the smaller corpus'],
    ['design-only', `${s.cli} mode design`, MODE_DESIGN_NOTE],
  ];
  const width = Math.max(...rows.map(([key]) => key.length));
  const gutter = ' '.repeat(6 + width + 2);
  // A LINE THAT CARRIES A COMMAND CARRIES NOTHING ELSE, and that is ARC-07-W7's lesson applied
  // rather than re-learnt: my first draft of this block wrote `mode design   — switch back to
  // design-only …`, which is prose inside a command — the identical defect the architect caught in
  // W7's `pushd "{root}" then .\bootstrap.cmd`. A reader who selects the line and pastes it gets an
  // error, and the two rows with something to say were exactly the two that would break. So an aside
  // goes on its own line, aligned under the command and parenthesised. It fixes the width at the same
  // time: with the note inline, `design-only` was 100 columns on POSIX and 104 on Windows against a
  // budget of 100 — one change for both, which is why the aside is a third column and not a suffix.
  const out = ['Change later, one command each — the bootstrap does not need re-running:'];
  for (const [key, cmd, aside] of rows) {
    out.push(`      ${key.padEnd(width)}  ${cmd}`);
    if (aside) out.push(`${gutter}(${aside})`);
  }
  return out.join('\n');
}

/**
 * The `Next:` block — what to type, and what will happen when they do.
 *
 * One sentence per dialog, always. The alternative — one sentence saying "you may see one or two" —
 * is the sort of hedge that makes a user distrust every other line in the summary.
 */
export function nextBlock({ mode, dialogs = EXPECTED_DIALOGS, serverKey, root = ROOT_SLOT, platform, env } = {}) {
  const s = spellings({ platform, env });
  // ARC-09-C157 — the folder by name, on a line of its own so it copies cleanly: "here" sent the Windows colleague's
  // `claude` one folder up (2026-10-15), where it loads none of this product and /mcp shows nothing.
  const lines = [`Next: run \`claude\` in this folder: ${root}`,
    '      You will see one workspace-trust dialog — answer Yes.'];
  if (dialogs >= 2) {
    lines.push(`      …and one approval for the "${serverKey}" MCP server — answer Yes.`);
  }
  lines.push('      (If you are already inside Claude Code in this folder: exit it and start '
    + '`claude` again.)');
  lines.push(mode === 'live'
    ? `      In Claude, /mcp should show: ${serverKey} ✔ connected · /snowarch status quotes the `
      + 'Mode line above.'
    : `      Add a live instance later: run ${ADD_INSTANCE(s.cli)}.`);
  return lines.join('\n');
}

/** The whole closing block, as one string — what `--json`'s `next` field carries verbatim. */
export function summaryBlock({ mode, instance = null, counts = {}, nodeUsable = true,
  dialogs = EXPECTED_DIALOGS, serverKey, root = ROOT_SLOT, platform, env, warnings = [], failures = [] } = {}) {
  const lines = [
    doctorLine({ ...counts, nodeUsable, platform, env }),
    // ARC-08-C? (Sitting A) — every FAIL, in full, directly under the count that announced it.
    // The summary used to print `DOCTOR: 8 ok, 0 warn, 1 fail` and stop, and by the time anybody ran
    // the full doctor the failure was gone: a count with nothing named is a number nobody can act
    // on, and the one run that saw the failure is the one run that should have said what it was.
    ...failures.map((f) => `      ${f}`),
    modeLine({ mode, instance }),
    nextBlock({ mode, dialogs, serverKey, root, platform, env }),
  ];
  // ARC-07-W12 — LIVE ONLY, and not for tidiness: four of the five rows name an instance, and in
  // design-only there is none. The design ending already carries its own change line, which is the
  // asymmetry this block was written to remove. It goes BEFORE the warnings recap, because the
  // warning has to be the last thing on screen — the same rule the wizard's save path states.
  if (mode === 'live') lines.push(changeLaterBlock({ label: instance?.label, platform, env }));
  if (warnings.length > 0) {
    lines.push(`Warnings: ${warnings.length}`, ...warnings.map((w) => `      ${w}`));
  }
  return lines.join('\n');
}

/** Everything the Node-free launchers need, as data. `text.json` is generated from this. */
export function exportable({ serverKey }) {
  const forShell = (where) => ({
    spellings: spellings(where),
    nextDesign: nextBlock({ mode: 'design-only', serverKey, ...where }),
    nextLive: nextBlock({ mode: 'live', serverKey, ...where }),
  });
  return {
    expectedDialogs: EXPECTED_DIALOGS,
    // ARC-09-C157 — the slot both Next blocks carry, which each launcher fills with its own root when it prints.
    rootSlot: ROOT_SLOT,
    modeDesign: modeLine({ mode: 'design-only' }),
    // The banner's fixed strings, as data: the hook prints them and `/snowarch status` (S09) says
    // the same words. The two that take an argument are rendered with an example one, so the file
    // shows the shape rather than a placeholder nobody can compare against.
    banner: {
      // ARC-07-C31 — PINNED POSIX, because `text.json` is generated AND COMMITTED: its bytes must be
      // identical on every runner or `gen:check` fails on a mac or on the Windows cell, whichever ran
      // second. The Node-free launchers read this file, and they cannot know the reader's shell either.
      // Same form as `gen-doctor-docs.mjs` and the rules page — the platform is STATED, not inherited.
      firstRun: BANNER.firstRun(POSIX),
      // A sample tag far past any real release: a sample equal to the next one would read as a real nudge.
      upgrade: BANNER.upgrade('v9.1.0', POSIX),
      staleRegistration: BANNER.staleRegistration(POSIX),
      doctorFail: BANNER.doctorFail(2, POSIX),
      staleSuffix: BANNER.staleSuffix(POSIX),
      timedOut: BANNER.timedOut(POSIX),
      failed: BANNER.failed('Error', POSIX),
      fromState: BANNER.fromState('design-only', '2026-09-10T10:00:00.000Z',
        'until Node 20+ is installed'),
    },
    doctorUnavailable: doctorLine({ nodeUsable: false }),
    posix: forShell({ platform: 'linux', env: {} }),
    windows: forShell({ platform: 'win32', env: {} }),
  };
}
