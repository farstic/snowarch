// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-06-S03 — the one amendable plan screen (principle 10).
//
// The whole installation is uninterrupted except here. That is the point: an installer that asks
// eleven questions is an installer nobody finishes, and one that asks none is one that surprises
// people. So everything that will be decided is shown ONCE, before anything is written, and can be
// changed from this screen.
//
// "Before anything is written" is load-bearing and is why this module writes through an injected
// function rather than the logger: the logger creates `.local/logs/` on its first line, and
// acceptance criterion 2 says quitting here leaves no `.local/` at all.
import { MODE, effectiveDocsMode } from './docs/sync.mjs';
import { plannedSteps } from './steps/index.mjs';
import { redact } from './redact.mjs';
import { spellings } from './text.mjs';

export const MODES = Object.freeze(['design-only', 'live']);
/**
 * The docs choices, and only ONE of the three is spelled here.
 *
 * `sparse` and `full` are ARC-03's vocabulary — they name the two shapes a checkout can have, and
 * `MODE` is where that is decided. Retyping them would be a second declaration of a word the docs
 * library already owns, and the contract-literals guard says so out loud: `full` is also a preset
 * name, so a literal here is indistinguishable from a preset typed into a wizard. `skip` is the one
 * genuinely local value: it is not a checkout shape, it is this command declining to make one.
 */
export const DOCS = Object.freeze([MODE.sparse, MODE.full, 'skip']);

/**
 * ARC-09-C244 — the choices the Docs line OFFERS: the whole corpus, the default, and skip. Sparse is a flag
 * (`--docs sparse`) and never a choice on this screen, the owner's rule: it is never presented as a way to save
 * space. `DOCS` above still says what a flag may name.
 */
export const DOCS_OFFERED = Object.freeze([MODE.full, 'skip']);

/**
 * THE TWO LINES ABOVE THE PLAN — ARC-07-W13.
 *
 * The screen opened on `Plan — Enter runs it as shown …`, which tells a reader what the KEYS do and
 * nothing about what is being decided or how long it takes. Somebody running an unfamiliar installer
 * wants two things before they read any option: what this is about to touch, and whether they are
 * going to be sitting here. Both were answerable from the code and neither was on the screen.
 *
 * "into this folder only — nothing else on the machine changes" is the claim the whole design is
 * built on, and B07 is the one step that could make it false: it writes Claude Code settings. It
 * writes them per-checkout, which is why the sentence is true and why it is safe to print.
 *
 * WIDTH, AND A RULED PHRASE DROPPED FOR A REASON. The second line as ruled ended "… live adds a
 * short wizard in this terminal" and measured 103 columns against `COLUMNS` = 100. The phrase that
 * came off is the one already printed three rows below it — the Mode line's own
 * "(wizard runs in this terminal)" — so the trim removes a SECOND author for that fact rather than a
 * fact, and the line lands at 86. Same resolution as ARC-07-W12's aside, one row earlier.
 */
export const ORIENTATION = Object.freeze([
  'Installing the AI ServiceNow Architect into this folder only — nothing else on the machine changes.',
  'Two choices below, then it runs on its own (about a minute; live adds a short wizard).',
]);

export const HEADER =
  // ARC-07-C10 (S06 sitting) — "change" read as "open a sub-prompt for that line": the owner
  // pressed 1 seven times waiting to be asked something, and each press silently TOGGLED Mode and
  // redrew the plan. The verb is the whole of the fix; the behaviour was right.
  'Plan — Enter runs it as shown · type a number to choose that line\'s value · "?" explains · q quits';

/**
 * The same plan, with no keys offered — ARC-07-C46.
 *
 * `upgrade` passes `--yes`, and on that path `runPlanScreen` prints the plan and returns without
 * ever calling `ask`. The header still offered four keys: Enter runs it, a number chooses, "?"
 * explains, q quits. None of them was true — there was no prompt to press them at — and `q quits`
 * is the one that matters, because a reader who wanted out would press it, see it ignored, and have
 * to reach for Ctrl-C while an install was already running.
 *
 * The suffix stays: `(accepted: --yes)` is the sentence that explains why nothing is being asked, so
 * dropping the legend without it would leave a plan that simply appears and starts.
 */
export const HEADER_ACCEPTED = 'Plan — running it as shown';

/**
 * What each line and each key is for (ARC-07-C11) — the owner's ruling, and the pattern is the
 * preset editor's.
 *
 * "Everything very easy and understandable; there can even be information for each option so the
 * user knows what it is instead of wondering." The measurement behind it: fourteen presses of `1`.
 * `preset-ui.ts` already answers the same question one screen over — its footer offers
 * `"?" explains the flags` and it prints a line per flag — so this mirrors that rather than
 * inventing a second convention for "tell me what this is".
 *
 * The KEYS are explained too, which the header cannot carry: a header long enough to say what
 * Enter, a number and q each do is a header nobody finishes reading.
 */
export const EXPLANATIONS = Object.freeze([
  // SHORT ENOUGH NOT TO WRAP, because the engine has no wrapper and should not grow one for this:
  // `preset-ui.ts` wraps at 100 columns but lives in the server package, which this must not depend
  // on, and the doctor's renderer already ruled that "a wrapped remedy that starts mid-line is the
  // part people stop reading". The plan line above each entry already shows the VALUES, so these
  // say what the option is for and stop. `explainLines` asserts the budget; the test asserts it too.
  //
  // "skips ServiceNow" rather than the phrase ARC-08-C7 reserves for the unconfigured STATE: this
  // explains what a mode IS, and borrowing that sentence would put a second answer to "no instance
  // configured" in the tree. Plainer for a first-time reader too, which is what this row is for.
  ['Mode', 'design-only skips ServiceNow; live also configures an instance and needs Node.js 20+.'],
  ['Docs', 'how much of the documentation corpus to fetch — all of it, or skip it for now.'],
  ['Enter', 'runs the plan exactly as shown above. Nothing is written before that.'],
  ['a number', 'asks what that line should be, the way the instance wizard asks its questions.'],
  ['q', 'quits without writing anything.'],
  // ARC-07-W13 — `?` claims to explain THE SCREEN, so a screen that grew two lines and left them
  // unexplained makes the header's own offer false. These two answer the questions the orientation
  // lines raise rather than restating them: WHERE the writes go, and WHERE the minute goes.
  ['this folder', 'everything written lands in this checkout — settings, docs corpus, instance store.'],
  ['the minute', 'mostly fetching the documentation corpus, all of it.'],
]);

/** The budget every other line on this screen is written to. */
export const COLUMNS = 100;

/** The launcher for THIS shell, read once — ARC-07-W7's rule, B06's shape. */
const SPELL = spellings();

/** The explanation block, one row per entry, in the plan's own label column. */
export const explainLines = () => EXPLANATIONS.map(([label, text]) => `  ${label} — ${text}`);

/**
 * What to say after a press (ARC-07-C11).
 *
 * The header alone was not enough: the owner pressed `1` seven times against "change that line" and
 * fourteen times against "toggle that line", asking why it kept asking again. Both times the plan
 * was redrawn and followed by a bare `> `, which answers neither question a person has after a
 * keystroke — *did that do anything*, and *what does Enter do now*.
 *
 * So the prompt answers both, at the only moment they are asked. The label and the value are the
 * plan's OWN for that line (`modeValue`/`docsValue`), because a second vocabulary for the thing
 * on screen would be a third way to describe one fact.
 */
export const ackLine = ({ label, to, key }) =>
  `${label} → ${to} · Enter runs it · ${key} changes it again · q quits`;

/**
 * The plan, before any of it is applied.
 *
 * Mode proposes `design-only` (principle 1: the safe thing is the default) unless the operator
 * asked otherwise or a previous run already recorded `live` — someone who has configured an
 * instance should not be offered the beginner's path every time.
 */
export function buildPlan({ ctx, state = null, flags = {} }) {
  const nodeFixed = !ctx.node.present;
  const asked = flags.mode === 'live' ? 'live' : (flags.mode === 'design' ? 'design-only' : null);
  const recorded = state?.mode === 'live' ? 'live' : null;
  return {
    mode: nodeFixed ? 'design-only' : (asked ?? recorded ?? 'design-only'),
    // ARC-09-C244 — a flag, else the recorded mode as effectiveDocsMode reads it: the whole corpus by default.
    docs: DOCS.includes(flags.docs) ? flags.docs : effectiveDocsMode(state?.docs),
    nodeFixed,
    nodeVersion: ctx.node.version,
    areas: ctx.areaCount,
  };
}

const modeHint = (plan) => (plan.nodeFixed
  ? ''
  : 'live needs a ServiceNow instance (wizard runs in this terminal); '
    + `Node ${plan.nodeVersion} found`);

const modeValue = (plan) => (plan.nodeFixed
  ? `design-only (fixed — Node.js 20+ not found; add live mode later with ${SPELL.cli} mode live)`  // ARC-07-W14: was a literal
  : plan.mode);

const docsValue = (plan) => (plan.docs === 'sparse' ? `sparse (${plan.areas} areas)` : plan.docs);

/** The screen. `accepted` is the `(accepted: --yes)` suffix, present only on the non-interactive path. */
export function formatPlan(plan, ctx, { accepted = null } = {}) {
  const steps = plannedSteps({ ...ctx, mode: plan.mode, docs: plan.docs })
    .map((s) => `${s.id} ${s.title}`).join(' · ');
  const pad = (s, w) => s.padEnd(w);
  return [
    ...ORIENTATION,
    `${accepted ? `${HEADER_ACCEPTED}  (accepted: ${accepted})` : HEADER}`,
    `  1  Mode   ${pad(modeValue(plan), 20)} ${modeHint(plan)}`.trimEnd(),
    `  2  Docs   ${pad(docsValue(plan), 20)} `
      + 'full = whole corpus · skip = none (the doctor will report FAIL)',
    `  Steps  ${steps}`,
  ].join('\n');
}

/**
 * One keystroke's worth of decision.
 *
 * Returns the next plan and what the caller should do, rather than acting: a parser that printed
 * and exited could only be tested through a terminal, and the interactive path is the one part of
 * this story a test cannot drive end to end.
 */
/**
 * The two lines a number opens, and what each may be set to (ARC-07-C12).
 *
 * THE WIZARD'S PATTERN, because it is the one this user reads correctly. At the S06 sitting the
 * owner answered `What is this instance?  [1] pdi  [2] dev  [3] test  [4] prod` and
 * `Authentication?  [1] basic  [2] oauth_ropc` first time, on both dry runs — while pressing `1` on
 * THIS screen seven times, then fourteen, then a third time with the whole explanation redesign in
 * place, writing "I press 1 and get the message again, I choose 1 again and nothing happens".
 *
 * "I choose 1" is the sentence. A number in a numbered list is a CHOICE, and ours was a toggle; no
 * wording on the screen overrides that, which is what three screens proved.
 */
export const LINES = Object.freeze({
  1: { label: 'Mode',
    values: MODES,
    // ONE LINE EACH, beside the option, because the question is the moment the meaning is wanted —
    // `?` explains the whole screen, and a reader who has already opened this line should not have
    // to go back out to learn what the two answers are. Short enough not to wrap at `COLUMNS`.
    // "no instance" and not the phrase ARC-08-C7 reserves for the unconfigured STATE — the same
    // trap C11's Mode explanation hit. Short, because this line must not wrap at `COLUMNS`.
    meaning: {
      // ARC-07-W14 — WHAT EACH ANSWER GIVES YOU, not what it lacks. `no instance` said only what
      // design-only is missing, which is a strange way to describe the mode most readers should pick:
      // it is the whole product minus one connection. `Claude` is dropped from the ruled sentence for
      // one reason, measured — see WIDTH below.
      'design-only': 'works from the ServiceNow docs and the specialist skills; no instance',
      // "in a moment" came off for width — 108 columns WITH the renderer's ` (current)` appended,
      // and only a check that takes each value as current in turn can see that. It is also the phrase
      // ARC-07-W13's orientation line already carries ("live adds a short wizard"), so once more what
      // was dropped is a second author rather than a fact. 96 columns, four of headroom.
      live: 'also connects one ServiceNow instance (the wizard asks for URL and login)',
    },
    of: (plan) => plan.mode,
    set: (plan, v) => ({ ...plan, mode: v }) },
  2: { label: 'Docs',
    values: DOCS_OFFERED,
    meaning: {
      // WHAT THE DISK LOSES, not what you read — measured on the page that already states both. The
      // whole corpus is 293 MB of files (299 on Windows) and about 495 MB with its `.git` (ARC-09-C244,
      // docs-real run 40076281656), and at the moment somebody is deciding whether to fetch it, what the
      // disk loses is the number that matters. `docs/INSTALL.md` states the same figure, and a test holds
      // the two within 10 MB of each other.
      full: 'the whole ServiceNow documentation, ~495 MB (recommended)',
      // The launcher is spelled by the definition, never here — ARC-07-W7's rule. Read at module
      // load like B06's eight sites, and correct for the same reason: a process's platform does not
      // change, and a function here would turn the assertions below into comparisons of a value
      // with itself.
      skip: `none for now; the health check reports FAIL until ${SPELL.cli} docs sync`,
    },
    of: (plan) => plan.docs,
    set: (plan, v) => ({ ...plan, docs: v }) },
});

/**
 * `Mode:  [1] design-only — no ServiceNow instance  [2] live — configures one, needs Node.js 20+`
 *
 * The wizard's own shape (`What is this instance?  [1] pdi  [2] dev`), with each option's meaning
 * beside it and the current value marked.
 */
export const choicesLine = (line, plan) => {
  const rows = line.values.map((v, i) => `[${i + 1}] ${v}`
    + `${line.meaning?.[v] ? ` — ${line.meaning[v]}` : ''}`
    + `${v === line.of(plan) ? ' (current)' : ''}`);
  const joined = `${line.label}:  ${rows.join('  ')}`;
  // ARC-07-W14 — ONE OPTION PER LINE WHEN THE ROW WILL NOT FIT, and the decision is made on the
  // RENDERED text rather than on the meanings alone: ` (current)` is appended by this function, so
  // whether a row fits depends on which value is current. The `design-only` row is 96 columns when
  // it is not the current value and 106 when it is, and a check that measured the meaning would have
  // called it safe on the exact run where the user sees it overflow.
  //
  // WRAPPING IS NOT THIS, DELIBERATELY. `preset-ui.ts` has `wrapRow`, which folds a long note across
  // lines — and it lives in the server package, which this must never import. What happens here is a
  // LAYOUT change: each option keeps its own whole line, indented under the label, so a reader still
  // sees one option per number. Nothing is broken mid-phrase, which is the property the doctor's
  // renderer already ruled on: "a wrapped remedy that starts mid-line is the part people stop
  // reading". A row still too long for the budget is a WORDING defect and the case says so.
  if (joined.length <= COLUMNS) return joined;
  return [`${line.label}:`, ...rows.map((r) => `  ${r}`)].join('\n');
};

/**
 * One answer to a line's question: a number, the value spelled out, or nothing.
 *
 * `null` means "leave it as it is and go back to the plan" — Enter runs the PLAN, and only at the
 * plan's own prompt. Opening a line by mistake must not start an install.
 */
export function resolveChoice(line, input) {
  const answer = String(input ?? '').trim().toLowerCase();
  if (answer === '') return null;
  const byNumber = line.values[Number(answer) - 1];
  if (byNumber) return byNumber;
  return line.values.includes(answer) ? answer : undefined;   // undefined: not an option
}

export function applyChoice(plan, input) {
  const answer = String(input ?? '').trim().toLowerCase();
  if (answer === '') return { plan, action: 'run' };
  if (answer === 'q' || answer === 'quit') return { plan, action: 'quit' };
  // ARC-07-C11 — a QUESTION, not a choice: it changes nothing and the screen comes back.
  if (answer === '?' || answer === 'help') return { plan, action: 'reprint', help: true };

  // ARC-07-C12 — a number OPENS that line rather than flipping it. The value is decided by the
  // answer to the line's own question, which the caller asks, because this function has no io.
  const line = LINES[answer];
  if (line) {
    if (answer === '1' && plan.nodeFixed) {
      return { plan, action: 'reprint',
        message: 'Mode is fixed at design-only until Node.js 20+ is installed.' };
    }
    return { plan, action: 'choose', key: answer, line };
  }
  return { plan, action: 'reprint',
    message: `"${answer}" is not one of 1, 2, ?, q or Enter.` };
}

/**
 * Drive the screen against a line source.
 *
 * `ask` is injected — `node:readline` in production, an array of answers in the tests. The screen
 * is the only interactive moment in the installation, and an interactive moment that can only be
 * exercised by a human is one that breaks silently.
 */
export async function runPlanScreen({ plan, ctx, ask, write, accepted = null }) {
  let current = plan;
  if (accepted) {
    write(`${formatPlan(current, ctx, { accepted })}\n`);
    return { plan: current, action: 'run' };
  }
  // ARC-07-C11 — the prompt carries the last press's acknowledgement, or nothing on the first draw
  // because nothing has happened yet. A redraw that says nothing is indistinguishable from a prompt
  // that did nothing, which is how one keystroke came to be pressed fourteen times.
  let ack = null;
  for (;;) {
    write(`${formatPlan(current, ctx)}\n${ack ? `${ack}\n` : ''}> `);
    const answer = await ask();
    if (answer === null) return { plan: current, action: 'quit' };   // stdin closed: not a yes
    const next = applyChoice(current, answer);
    current = next.plan;

    // ARC-07-C12 — A NUMBER ASKS THAT LINE'S QUESTION, the way the wizard does. The parser has no
    // io, so the question is asked here: it prints the line's options, reads one answer, and sets
    // the value the answer names. Nothing is flipped, and the plan comes back with the value on it.
    if (next.action === 'choose') {
      write(`${choicesLine(next.line, current)}\n> `);
      const picked = await ask();
      if (picked === null) return { plan: current, action: 'quit' };   // stdin closed: still not a yes
      const value = resolveChoice(next.line, picked);
      if (value === null) {                    // Enter: leave it, and back to the plan
        ack = null;
      } else if (value === undefined) {
        write(`${redact(`"${String(picked).trim()}" is not one of `
          + next.line.values.map((v, i) => `[${i + 1}] ${v}`).join('  '))}\n`);
        ack = null;
      } else {
        current = next.line.set(current, value);
        ack = ackLine({ key: next.key, label: next.line.label,
          to: next.key === '1' ? modeValue(current) : docsValue(current) });
      }
      continue;
    }

    if (next.action !== 'reprint') return { plan: current, action: next.action };
    if (next.help) write(`${explainLines().join('\n')}\n`);
    ack = next.changed ? ackLine(next.changed) : null;
    if (next.message) write(`${redact(next.message)}\n`);
  }
}
