// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * One line from stdin, or `null` at end of input. One implementation.
 *
 * There were three: `bootstrap.mjs`'s `stdinAsker`, `doctor/index.mjs`'s `defaultAsk` — whose
 * comment already claimed it was "the same reader the plan screen uses", a claim nothing enforced —
 * and the plan screen's own injected `ask`. Three readers of one line is three chances to disagree
 * about what end-of-input means, and "stdin closed" is exactly the case where a prompt must NOT be
 * read as a yes.
 *
 * `null` is the contract: every caller treats it as a refusal, never as an empty answer.
 */
import { createInterface } from 'node:readline';

/**
 * A reader that stays open across several questions. Close it when the dialogue ends.
 *
 * `terminal: false` on purpose: the callers are scripts driven from a terminal AND from a test that
 * writes a string into a stream, and line editing in the second case makes the input unreadable.
 */
export function lineReader(input = process.stdin, output = undefined) {
  const rl = createInterface({ input, ...(output ? { output } : {}), terminal: false });
  const it = rl[Symbol.asyncIterator]();
  return {
    ask: async () => { const { value, done } = await it.next(); return done ? null : value; },
    close: () => rl.close(),
  };
}

/** One question, one answer, reader closed. For a command that asks exactly once. */
export function askOnce(input = process.stdin) {
  return async () => {
    const reader = lineReader(input);
    try { return await reader.ask(); } finally { reader.close(); }
  };
}

/**
 * `Enter` or `y` is yes; anything else, and end-of-input, is no.
 *
 * The asymmetry is deliberate and is design principle 10: the plan is a proposal. A closed stdin,
 * a typed `n`, a stray word — all of them leave the tree alone. Only an explicit yes proceeds.
 */
export const isYes = (answer) => answer !== null && /^(y(es)?)?$/i.test(String(answer).trim());
