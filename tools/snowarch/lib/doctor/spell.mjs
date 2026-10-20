// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * How the doctor spells the launcher — ARC-07-W17. One accessor, every check.
 *
 * ARC-07-C1 found 88 hand-spelled launcher names; ARC-07-C21 fixed four more sources and built a
 * guard over a hand-kept list; this row found 163 sites the guard's widened form could see, 57 of
 * them in the doctor. The doctor is the worst place for the defect: its remedies are the lines a
 * user is TOLD TO PASTE, on the path where something is already wrong.
 *
 * `ctx` CARRIES THE PLATFORM AND THE ENV, and both are threaded rather than one. `isWindowsShell`
 * reads SHELL and MSYSTEM so Git Bash on Windows keeps the POSIX spelling, and `env` defaults to
 * `process.env` — so passing only the platform renders POSIX on any machine with SHELL set, which
 * is the trap `tests/windows-spellings.test.mjs` writes out at length and the one that made a
 * `noTtyMessage` call site wrong in ARC-07-W7.
 *
 * A FUNCTION OF ITS ARGUMENT, not a module-load constant: the doctor can be told a platform, so a
 * case can drive a Windows remedy on a mac.
 *
 * `ctx.spell` FIRST (ARC-11-C1). `runDoctor` puts the told shell's spelling on the context, so a check
 * spells what the Mode line spells. A context built without one — a case driving one check — keeps
 * deriving it from `platform` and `env`, as before. `B06.mjs` reads `spellings()` once at load and is right
 * to — it renders for the process it is in — but the doctor's checks take a ctx, so they use it.
 */
import { spellings } from '../text.mjs';

export const spellFor = (ctx) => ctx?.spell ?? spellings({ platform: ctx?.platform, env: ctx?.env });

/** The launcher alone, which is what almost every remedy needs. */
export const cliOf = (ctx) => spellFor(ctx).cli;

/** ...and the bootstrap, for the checks whose remedy is a re-run. */
export const bootstrapOf = (ctx) => spellFor(ctx).bootstrap;
